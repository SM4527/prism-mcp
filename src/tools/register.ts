import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import type { FolioPrismClient } from "../folioprism/client.js";
import type { CallLog } from "../log.js";
import { dropDollarKeys } from "../privacy.js";
import type { SignalPrismClient } from "../signalprism/client.js";

/** Apps whose dollar fields are public data, such as SEC insider purchase values, so they stay at "percent". */
const PUBLIC_DOLLAR_APPS = new Set(["signalprism"]);

/** Everything a tool handler may use. The detail level comes only from `config`. */
export interface ToolContext {
  config: Config;
  folioprism: FolioPrismClient;
  signalprism: SignalPrismClient;
  now: () => number;
  log: CallLog;
}

export interface ToolDefinition<I extends ZodRawShapeCompat, O extends ZodRawShapeCompat> {
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
}

/** Whether a tool is on: its app is enabled and the config doesn't set it to false. */
export function isToolEnabled(config: Config, app: string, name: string): boolean {
  const appConfig = config.apps[app as keyof Config["apps"]];
  if (!appConfig) return true;
  return appConfig.enabled && appConfig.tools[name] !== false;
}

/** Keep dollar fields only at detail "full", except for apps whose dollar fields are public. */
function applyDetail(config: Config, app: string, result: CallToolResult): CallToolResult {
  if (config.detail === "full" || PUBLIC_DOLLAR_APPS.has(app) || !result.structuredContent) return result;
  return { ...result, structuredContent: dropDollarKeys(result.structuredContent) };
}

/**
 * Register a read-only tool unless the config turns it off. Every call is filtered
 * for the detail level and logged without its result.
 */
export function registerTool<I extends ZodRawShapeCompat, O extends ZodRawShapeCompat>(
  server: McpServer,
  ctx: ToolContext,
  app: string,
  name: string,
  definition: ToolDefinition<I, O>,
  handler: (args: ShapeOutput<I>) => Promise<CallToolResult>,
): void {
  if (!isToolEnabled(ctx.config, app, name)) return;
  const run = async (args: ShapeOutput<I>): Promise<CallToolResult> => {
    const start = performance.now();
    const entry = (ok: boolean, size: number) => ({
      time: new Date(ctx.now()).toISOString(),
      tool: name,
      args: args as Record<string, unknown>,
      resultBytes: size,
      durationMs: Math.round(performance.now() - start),
      ok,
    });
    try {
      const result = applyDetail(ctx.config, app, await handler(args));
      ctx.log(entry(!result.isError, Buffer.byteLength(JSON.stringify(result))));
      return result;
    } catch (error) {
      ctx.log(entry(false, Buffer.byteLength((error as Error).message)));
      throw error;
    }
  };
  // The SDK's callback type is conditional on I, which TypeScript can't resolve for a generic shape.
  const callback = run as unknown as ToolCallback<I>;
  server.registerTool(name, { ...definition, annotations: { readOnlyHint: true } }, callback);
}
