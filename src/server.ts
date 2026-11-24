import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { createFolioPrismClient } from "./folioprism/client.js";
import { type CallLog, createCallLog } from "./log.js";
import { registerFolioPrismTools } from "./tools/folioprism/index.js";
import type { ToolContext } from "./tools/register.js";
import { registerStatus } from "./tools/status.js";

export interface ServerOptions {
  now?: () => number;
  log?: CallLog;
}

/** Build the Prism MCP server with every tool the config leaves on. */
export function createServer(config: Config, options: ServerOptions = {}): McpServer {
  const ctx: ToolContext = {
    config,
    folioprism: createFolioPrismClient(config.apps.folioprism.baseUrl),
    now: options.now ?? Date.now,
    log: options.log ?? createCallLog(config.logDir),
  };
  const server = new McpServer({ name: "prism-mcp", version: "0.0.1" });
  registerStatus(server, ctx);
  registerFolioPrismTools(server, ctx);
  return server;
}
