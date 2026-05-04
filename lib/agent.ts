import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentResult, AgentTraceEntry } from "./agent-types";
import {
  beginMutationBatch,
  discardMutationBatch,
  flushMutationBatch,
} from "./agent-mutation-batch";
import { executeTool } from "./tools-registry";

const DEFAULT_MAX_TOOL_ROUNDS = 24;

export type { AgentResult, AgentTraceEntry };

export type RunAgentOptions = {
  tools: ChatCompletionTool[];
  signal?: AbortSignal;
  maxToolRounds?: number;
};

export async function runAgent(
  openai: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  options: RunAgentOptions
): Promise<AgentResult> {
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
        return { ok: false, error: "Anfrage abgebrochen." };
      }

      let completion;
      try {
        completion = await openai.chat.completions.create(
          {
            model,
            messages: working,
            tools,
            tool_choice: "auto",
          },
          { signal }
        );
      } catch (e) {
        discardMutationBatch();
        if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
          return { ok: false, error: "Anfrage abgebrochen." };
        }
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      const choice = completion.choices[0];
      if (!choice?.message) {
        discardMutationBatch();
        return { ok: false, error: "Keine Antwort vom Modell." };
      }

      const msg = choice.message;
      working.push(msg);

      const toolCalls = msg.tool_calls;
      if (!toolCalls?.length) {
        const text = msg.content?.trim() ?? "";
        if (text) trace.push({ kind: "assistant_text", content: text });
        const undoSnapshots = flushMutationBatch();
        return { ok: true, trace, finalMessage: text, undoSnapshots };
      }

      type ToolCallTrace = Extract<AgentTraceEntry, { kind: "tool_round" }>["calls"];
      const calls: ToolCallTrace = [];
      for (const tc of toolCalls) {
        if (signal?.aborted) {
          discardMutationBatch();
          return { ok: false, error: "Anfrage abgebrochen." };
        }
        if (tc.type !== "function") continue;
        const name = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeTool(name, args);
        calls.push({
          id: tc.id,
          name,
          arguments: tc.function.arguments || "{}",
          result,
        });
        working.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      trace.push({
        kind: "tool_round",
        summary: msg.content,
        calls,
      });
    }

    discardMutationBatch();
    return {
      ok: false,
      error: "Zu viele Tool-Runden (Schutzgrenze). Bitte Aufgabe verkleinern.",
    };
  } finally {
    discardMutationBatch();
  }
}
