import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../register.js";
import { registerClusters } from "./clusters.js";
import { registerRecent } from "./recent.js";
import { registerTicker } from "./ticker.js";

/** Register every SignalPrism tool the config leaves on. */
export function registerSignalPrismTools(server: McpServer, ctx: ToolContext): void {
  registerRecent(server, ctx);
  registerClusters(server, ctx);
  registerTicker(server, ctx);
}
