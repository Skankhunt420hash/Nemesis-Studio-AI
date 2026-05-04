import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { executeMcpOpenAiTool, getMcpOpenAiTools, isMcpOpenAiToolName } from "./mcp-bridge";
import { BUILTIN_TOOL_DEFINITIONS, executeBuiltinTool } from "./tools";

export async function getAllToolDefinitions(): Promise<ChatCompletionTool[]> {
  const mcp = await getMcpOpenAiTools();
  return [...BUILTIN_TOOL_DEFINITIONS, ...mcp];
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (isMcpOpenAiToolName(name)) {
    return executeMcpOpenAiTool(name, args);
  }
  return executeBuiltinTool(name, args);
}
