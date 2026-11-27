import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { ROLES, SignalsResponse } from "../../signalprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { asOfLine, listLines, SIGNAL_NOTICE, signalText } from "./shared.js";

/** Register `signalprism_recent`. */
export function registerRecent(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "signalprism",
    "signalprism_recent",
    {
      title: "SignalPrism recent insider purchases",
      description:
        "Recent open-market insider purchases from SEC Form 4 filings, scored, newest first. Plan buys (10b5-1, ESPP, DRIP, 401(k)) are left out unless includePlan is true. held_via says whether the user holds the stock now, never amounts. " +
        SIGNAL_NOTICE,
      inputSchema: {
        days: z.number().int().positive().optional().describe("Filed within this many days; SignalPrism sets the default."),
        minScore: z.number().int().min(0).optional().describe("Lowest score to include."),
        role: z.enum(ROLES).optional().describe("Only this insider role."),
        heldOnly: z.boolean().optional().describe("Only stocks the user holds now."),
        includePlan: z.boolean().optional().describe("Include plan buys. Leave false unless the user asks."),
      },
      outputSchema: SignalsResponse.shape,
    },
    async (query) => {
      const response = await ctx.signalprism.signals(query);
      const { filters, count, truncated } = response;
      const head = `${count} signals filed in the last ${filters.days} days, minimum score ${filters.min_score}${filters.include_plan ? ", plan buys included" : ""}.`;
      const cap = truncated ? ["Result hit the 200-row cap; older or lower rows may be missing."] : [];
      const rows = listLines(response.signals.map(signalText), "signals");
      return toolResult([asOfLine(response.as_of), head, ...cap, ...rows].join("\n"), response);
    },
  );
}
