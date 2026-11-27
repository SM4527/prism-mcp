import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { TickerResponse } from "../../signalprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { asOfLine, clusterText, listLines, SIGNAL_NOTICE, signalText } from "./shared.js";

/** Register `signalprism_ticker`. */
export function registerTicker(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "signalprism",
    "signalprism_ticker",
    {
      title: "SignalPrism one ticker",
      description:
        "One stock's insider purchases over the last 12 months, including plan buys flagged by a plan badge, and its clusters. " +
        SIGNAL_NOTICE,
      inputSchema: { ticker: z.string().min(1).describe("Stock ticker, any case.") },
      outputSchema: TickerResponse.shape,
    },
    async ({ ticker }) => {
      const r = await ctx.signalprism.ticker(ticker.toUpperCase());
      const held = r.held_via === null ? "not held" : `held via ${r.held_via}`;
      const head = `${r.ticker} (${r.company ?? "unknown"}), ${held}: ${r.signals.length} signals since ${r.since}, ${r.plan_count} of them plan buys, ${r.clusters.length} clusters.`;
      const lines = [
        ...listLines(r.signals.map(signalText), "signals"),
        ...listLines(r.clusters.map(clusterText), "clusters"),
      ];
      return toolResult([asOfLine(r.as_of), head, ...lines].join("\n"), r);
    },
  );
}
