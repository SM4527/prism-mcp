import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Build a tool result: short text for the model plus the same facts as structured JSON. */
export function toolResult(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}
