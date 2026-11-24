import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { Analysis } from "../../folioprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { DATA_NOTICE, exposureText, isFull, PctOutput, pct, usd } from "./shared.js";

const Fund = z.object({ ticker: z.string(), name: z.string(), portfolioPct: PctOutput, valueUsd: z.number().optional() });
const Output = {
  rows: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      portfolioPct: PctOutput,
      valueUsd: z.number().optional(),
      funds: z.array(Fund),
    }),
  ),
};

/** One Top 50 row with its fund contributions; dollar values only when `full`. */
export function toRow(row: Analysis["intersection"]["rows"][number], full: boolean) {
  return {
    ticker: row.ticker,
    name: row.name,
    portfolioPct: pct(row.portfolioPct),
    ...(full && { valueUsd: usd(row.valueCents) }),
    funds: row.children.map((c) => ({
      ticker: c.sourceTicker,
      name: c.sourceName,
      portfolioPct: pct(c.portfolioPct),
      ...(full && { valueUsd: usd(c.valueCents) }),
    })),
  };
}

function describe(rows: ReturnType<typeof toRow>[]): string {
  return rows
    .map((r, i) => `${i + 1}. ${exposureText(r)} (${r.funds.map(exposureText).join(", ")})`)
    .join("\n");
}

/** Register `folioprism_top_stocks`. */
export function registerTopStocks(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_top_stocks",
    {
      title: "FolioPrism top stocks",
      description:
        "The largest look-through stock exposures across all holdings, with the percent of the portfolio each fund (or a direct holding) contributes. " +
        DATA_NOTICE,
      inputSchema: { limit: z.number().int().min(1).max(50).default(10).describe("How many stocks, 1-50.") },
      outputSchema: Output,
    },
    async ({ limit }) => {
      const rows = (await ctx.folioprism.analysis(false)).intersection.rows.slice(0, limit);
      const output = rows.map((row) => toRow(row, isFull(ctx)));
      return toolResult(describe(output), { rows: output });
    },
  );
}
