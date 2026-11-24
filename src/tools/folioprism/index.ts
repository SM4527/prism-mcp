import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../register.js";
import { registerDataQuality } from "./data-quality.js";
import { registerFundOverlap } from "./fund-overlap.js";
import { registerPrismView } from "./prism-view.js";
import { registerStockExposure } from "./stock-exposure.js";
import { registerSummary } from "./summary.js";
import { registerTopStocks } from "./top-stocks.js";

/** Register every FolioPrism tool the config leaves on. */
export function registerFolioPrismTools(server: McpServer, ctx: ToolContext): void {
  registerSummary(server, ctx);
  registerPrismView(server, ctx);
  registerTopStocks(server, ctx);
  registerStockExposure(server, ctx);
  registerFundOverlap(server, ctx);
  registerDataQuality(server, ctx);
}
