import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getWorkspaceRoot } from "./workspace";

type McpClient = import("@modelcontextprotocol/sdk/client/index.js").Client;

let client: McpClient | null = null;
let initPromise: Promise<void> | null = null;

const openAiToMcpName = new Map<string, string>();
let cachedOpenAiTools: ChatCompletionTool[] = [];

function parseStdioCommand(): { command: string; args: string[] } {
  const raw = process.env.MCP_STDIO_COMMAND;
  if (!raw?.trim()) {
    throw new Error(
      "MCP_STDIO_COMMAND fehlt: JSON-Array wie [\"npx\",\"-y\",\"@modelcontextprotocol/server-filesystem\",\"{WORKSPACE}\"]"
    );
  }
  const arr = JSON.parse(raw) as unknown;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("MCP_STDIO_COMMAND muss ein nicht-leeres JSON-Array von Strings sein");
  }
  const strings = arr.map((x) => {
    if (typeof x !== "string") throw new Error("MCP_STDIO_COMMAND: nur Strings erlaubt");
    return x.replaceAll("{WORKSPACE}", getWorkspaceRoot());
  });
  const [command, ...args] = strings;
  return { command, args };
}

function toOpenAiToolName(mcpName: string, used: Set<string>): string {
  const base = `mcp__${mcpName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let name = base;
  let i = 0;
  while (used.has(name)) {
    i += 1;
    name = `${base}_${i}`;
  }
  used.add(name);
  return name;
}

function schemaToParameters(schema: {
  type?: string;
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}): Record<string, unknown> {
  if (schema.type === "object") {
    return schema as Record<string, unknown>;
  }
  return {
    type: "object",
    properties: (schema.properties ?? {}) as Record<string, unknown>,
    required: schema.required,
  };
}

function formatMcpResult(
  result: Awaited<ReturnType<McpClient["callTool"]>>
): string {
  if (result && typeof result === "object" && "toolResult" in result) {
    const tr = (result as { toolResult: unknown }).toolResult;
    return typeof tr === "string" ? tr : JSON.stringify(tr, null, 2);
  }
  const r = result as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  };
  if (r.isError) return "MCP-Tool meldet einen Fehler (isError).";
  const parts =
    r.content?.map((item) => {
      if (item.type === "text" && typeof item.text === "string") return item.text;
      return JSON.stringify(item);
    }) ?? [];
  return parts.join("\n\n").slice(0, 120_000) || "(leer)";
}

async function doInit(): Promise<void> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const { command, args } = parseStdioCommand();
  const transport = new StdioClientTransport({
    command,
    args,
    stderr: "ignore",
  });

  const c = new Client({ name: "nemesis-agent", version: "0.1.0" });
  await c.connect(transport);

  const tools: Awaited<ReturnType<McpClient["listTools"]>>["tools"] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await c.listTools(cursor ? { cursor } : {});
    tools.push(...page.tools);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  openAiToMcpName.clear();
  const usedNames = new Set<string>();
  const openAiTools: ChatCompletionTool[] = [];

  for (const t of tools) {
    const openAiName = toOpenAiToolName(t.name, usedNames);
    openAiToMcpName.set(openAiName, t.name);
    openAiTools.push({
      type: "function",
      function: {
        name: openAiName,
        description: `[MCP] ${t.description ?? t.name}`,
        parameters: schemaToParameters(t.inputSchema),
      },
    });
  }

  client = c;
  cachedOpenAiTools = openAiTools;
}

export async function ensureMcpClient(): Promise<void> {
  if (process.env.MCP_ENABLE !== "1") return;
  if (client) return;
  if (!initPromise) {
    initPromise = doInit().catch((e) => {
      initPromise = null;
      client = null;
      cachedOpenAiTools = [];
      openAiToMcpName.clear();
      throw e;
    });
  }
  await initPromise;
}

export async function getMcpOpenAiTools(): Promise<ChatCompletionTool[]> {
  if (process.env.MCP_ENABLE !== "1") return [];
  try {
    await ensureMcpClient();
    return cachedOpenAiTools;
  } catch {
    return [];
  }
}

export function isMcpOpenAiToolName(name: string): boolean {
  return name.startsWith("mcp__");
}

export function getMcpBridgeStatus(): {
  enabled: boolean;
  connected: boolean;
  toolCount: number;
} {
  return {
    enabled: process.env.MCP_ENABLE === "1",
    connected: client !== null,
    toolCount: cachedOpenAiTools.length,
  };
}

export async function executeMcpOpenAiTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (process.env.MCP_ENABLE !== "1") {
    return "MCP ist deaktiviert (MCP_ENABLE=1 setzen).";
  }
  try {
    await ensureMcpClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `MCP nicht verbunden: ${msg}`;
  }
  if (!client) return "MCP-Client fehlt.";
  const mcpName = openAiToMcpName.get(name);
  if (!mcpName) return `Unbekanntes MCP-Tool: ${name}`;

  try {
    const result = await client.callTool({ name: mcpName, arguments: args });
    return formatMcpResult(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `MCP callTool Fehler: ${msg}`;
  }
}
