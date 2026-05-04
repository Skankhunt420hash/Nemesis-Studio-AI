import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AgentStreamEvent, AgentTraceEntry, ToolCallRecord } from "./agent-types";
import {
  beginMutationBatch,
  discardMutationBatch,
  flushMutationBatch,
} from "./agent-mutation-batch";
import { executeTool } from "./tools-registry";

const DEFAULT_MAX_TOOL_ROUNDS = 24;

export type StreamAgentOptions = {
  tools: ChatCompletionTool[];
  signal?: AbortSignal;
  maxToolRounds?: number;
};

type ToolAcc = Record<number, { id: string; name: string; arguments: string }>;

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return e instanceof Error && e.name === "AbortError";
}

export async function* streamAgent(
  openai: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  options: StreamAgentOptions
): AsyncGenerator<AgentStreamEvent, void, undefined> {
  const { tools, signal } = options;
  const maxRounds =
    typeof options.maxToolRounds === "number" &&
    Number.isFinite(options.maxToolRounds)
      ? Math.min(80, Math.max(4, Math.floor(options.maxToolRounds)))
      : DEFAULT_MAX_TOOL_ROUNDS;
  const trace: AgentTraceEntry[] = [];
  const working: ChatCompletionMessageParam[] = [...messages];

  beginMutationBatch();
  try {
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) {
      discardMutationBatch();
      yield { type: "cancelled" };
      return;
    }

    let stream: AsyncIterable<ChatCompletionChunk>;
    try {
      stream = await openai.chat.completions.create(
        {
          model,
          messages: working,
          tools,
          tool_choice: "auto",
          stream: true,
        },
        { signal }
      );
    } catch (e) {
      if (isAbort(e, signal)) {
        discardMutationBatch();
        yield { type: "cancelled" };
        return;
      }
      discardMutationBatch();
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    let fullContent = "";
    const toolAcc: ToolAcc = {};

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          discardMutationBatch();
          yield { type: "cancelled" };
          return;
        }
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta?.content) {
          fullContent += delta.content;
          yield { type: "assistant_delta", text: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (toolAcc[idx] === undefined) {
              toolAcc[idx] = { id: "", name: "", arguments: "" };
            }
            if (tc.id) toolAcc[idx].id = tc.id;
            if (tc.function?.name) toolAcc[idx].name += tc.function.name;
            if (tc.function?.arguments) toolAcc[idx].arguments += tc.function.arguments;
          }
        }
      }
    } catch (e) {
      if (isAbort(e, signal)) {
        discardMutationBatch();
        yield { type: "cancelled" };
        return;
      }
      discardMutationBatch();
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    const ids = Object.keys(toolAcc)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);

    if (ids.length === 0) {
      const text = fullContent.trim();
      if (text) trace.push({ kind: "assistant_text", content: text });
      const undoSnapshots = flushMutationBatch();
      yield { type: "done", trace, finalMessage: text, undoSnapshots };
      return;
    }

    for (const i of ids) {
      const t = toolAcc[i];
      if (!t?.name?.trim()) {
        discardMutationBatch();
        yield { type: "error", message: "Unvollständiger Tool-Aufruf vom Modell." };
        return;
      }
    }

    working.push({
      role: "assistant",
      content: fullContent.trim() === "" ? null : fullContent,
      tool_calls: ids.map((i) => {
        const t = toolAcc[i];
        return {
          id: t.id || `call_${i}`,
          type: "function" as const,
          function: {
            name: t.name,
            arguments: t.arguments || "{}",
          },
        };
      }),
    });

    const calls: ToolCallRecord[] = [];
    for (const i of ids) {
      if (signal?.aborted) {
        discardMutationBatch();
        yield { type: "cancelled" };
        return;
      }
      const t = toolAcc[i];
      const name = t.name;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(t.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const id = t.id || `call_${i}`;
      yield { type: "heartbeat", phase: "tool_start", name };
      const result = await executeTool(name, parsed);
      yield { type: "heartbeat", phase: "tool_done", name };
      calls.push({
        id,
        name,
        arguments: t.arguments || "{}",
        result,
      });
      working.push({
        role: "tool",
        tool_call_id: id,
        content: result,
      });
    }

    trace.push({
      kind: "tool_round",
      summary: fullContent.trim() === "" ? null : fullContent,
      calls,
    });
    yield {
      type: "tool_round",
      summary: fullContent.trim() === "" ? null : fullContent,
      calls,
    };
  }

  discardMutationBatch();
  yield {
    type: "error",
    message: "Zu viele Tool-Runden (Schutzgrenze). Bitte Aufgabe verkleinern.",
  };
  } finally {
    discardMutationBatch();
  }
}
