import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { Analysis } from "../../folioprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { DATA_NOTICE, findFund, isFull, PctOutput, pct, pctText, TOP_50_NOTE, usd } from "./shared.js";

const Weights = z.object({
  portfolioSharePctViaFund: PctOutput.describe("Share of your portfolio held in this stock via this fund, in percent."),
  weightInFundPct: PctOutput.describe("Weight of this stock inside this fund, in percent."),
  valueUsd: z.number().optional(),
});
const Output = {
  fundA: z.string(),
  fundB: z.string(),
  sharedCount: z.number().describe("Total stocks both funds own, before the limit."),
  shared: z.array(z.object({ ticker: z.string(), name: z.string(), fundA: Weights, fundB: Weights })),
};

type Child = Analysis["intersection"]["rows"][number]["children"][number];

function weights(child: Child, full: boolean) {
  return {
    portfolioSharePctViaFund: pct(child.portfolioPct),
    weightInFundPct: pct(child.fundWeightPct),
    ...(full && { valueUsd: usd(child.valueCents) }),
  };
}

type Weighted = ReturnType<typeof weights>;

function sharedLine(ticker: string, a: [string, Weighted], b: [string, Weighted]): string {
  const via = ([fund, w]: [string, Weighted]) =>
    `share of your portfolio via ${fund} ${pctText(w.portfolioSharePctViaFund)}, weight inside ${fund} ${pctText(w.weightInFundPct)}`;
  return `  ${ticker}: ${via(a)}; ${via(b)}`;
}

/** Register `folioprism_fund_overlap`. */
export function registerFundOverlap(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_fund_overlap",
    {
      title: "FolioPrism fund overlap",
      description:
        "Stocks from the Top 50 stock intersection that two held funds both own, with each fund's weight in that stock and the percent of the portfolio it adds. " +
        DATA_NOTICE,
      inputSchema: {
        fundA: z.string().min(1),
        fundB: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10).describe("How many shared stocks to list, 1-50."),
      },
      outputSchema: Output,
    },
    async ({ fundA, fundB, limit }) => {
      const analysis = await ctx.folioprism.analysis(false);
      const a = findFund(analysis, fundA);
      const b = findFund(analysis, fundB);
      const full = isFull(ctx);
      const all = analysis.intersection.rows.flatMap((row) => {
        const inA = row.children.find((c) => c.sourceTicker === a);
        const inB = row.children.find((c) => c.sourceTicker === b);
        return inA && inB ? [{ ticker: row.ticker, name: row.name, fundA: weights(inA, full), fundB: weights(inB, full) }] : [];
      });
      const shared = all.slice(0, limit);
      const lines = shared.map((s) => sharedLine(s.ticker, [a, s.fundA], [b, s.fundB]));
      const heading = `${a} and ${b} share ${all.length} of the Top 50 stocks (showing ${shared.length}):`;
      const text = [heading, ...lines, TOP_50_NOTE].join("\n");
      return toolResult(text, { fundA: a, fundB: b, sharedCount: all.length, shared });
    },
  );
}
