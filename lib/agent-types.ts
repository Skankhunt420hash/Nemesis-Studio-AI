export type AgentTraceEntry =
  | {
      kind: "assistant_text";
      content: string;
    }
  | {
      kind: "tool_round";
      summary?: string | null;
      calls: Array<{
        id: string;
        name: string;
        arguments: string;
        result: string;
      }>;
    };

export type UndoSnapshot = { path: string; content: string | null };

export type AgentResult =
  | {
      ok: true;
      trace: AgentTraceEntry[];
      finalMessage: string;
      undoSnapshots?: UndoSnapshot[];
    }
  | { ok: false; error: string };

export type ToolCallRecord = {
  id: string;
  name: string;
  arguments: string;
  result: string;
};

/** NDJSON-Events für /api/chat mit stream: true */
export type AgentStreamEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "tool_round"; summary: string | null; calls: ToolCallRecord[] }
  | {
      type: "done";
      trace: AgentTraceEntry[];
      finalMessage: string;
      /** Vorherige Dateiinhalte für „Letzte Agent-Runde rückgängig“. */
      undoSnapshots?: UndoSnapshot[];
    }
  | { type: "error"; message: string }
  | { type: "cancelled" }
  | { type: "heartbeat"; phase: "tool_start" | "tool_done"; name: string };
