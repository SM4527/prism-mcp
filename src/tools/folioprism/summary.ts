import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Decimal } from "decimal.js";
import * as z from "zod";
import type { Analysis } from "../../folioprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import {
  DATA_NOTICE,
  formatUsd,
  isFull,
  listText,
  MERGE_SHARE_CLASSES_HELP,
  MERGED_NOTE,
  PctOutput,
  pct,
  pctText,
  usd,
  weightPct,
} from "./shared.js";

const TOP_N = 10;

const Output = {
  name: z.string(),
  benchmark: z.string(),
  asOf: z.string().nullable(),
  holdings: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      weightPct: PctOutput.nullable(),
      valueUsd: z.number().nullable().optional(),
      priceKind: z.string(),
      stale: z.boolean(),
    }),
  ),
  totalUsd: z.number().optional(),
  top10ConcentrationPct: PctOutput,
  staleTickers: z.array(z.string()),
  unpricedTickers: z.array(z.string()),
};

function summarize({ summary, holdings, intersection }: Analysis, full: boolean) {
  const top = Decimal.sum(0, ...intersection.rows.slice(0, TOP_N).map((row) => row.portfolioPctDisplay));
  return {
    name: summary.name,
    benchmark: summary.benchmark,
    asOf: summary.asOf,
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      weightPct: weightPct(h.valueCents, summary.totalCents),
      ...(full && { valueUsd: h.valueCents === null ? null : usd(h.valueCents) }),
      priceKind: h.priceKind,
      stale: h.stale,
    })),
    ...(full && { totalUsd: usd(summary.totalCents) }),
    top10ConcentrationPct: pct(top.toFixed(2)),
    staleTickers: summary.staleTickers,
    unpricedTickers: summary.unpricedTickers,
  };
}

function holdingText(h: { ticker: string; name: string; weightPct: number | null; valueUsd?: number | null }): string {
  const label = `${h.ticker} (${h.name})`;
  if (h.weightPct === null) return `${label} unpriced`;
  const weight = `${label} ${pctText(h.weightPct)}`;
  return typeof h.valueUsd === "number" ? `${weight} (${formatUsd(h.valueUsd)})` : weight;
}

function describe(output: ReturnType<typeof summarize>, merged: boolean): string {
  return [
    ...(merged ? [MERGED_NOTE] : []),
    `${output.name} vs ${output.benchmark}, prices as of ${output.asOf ?? "unknown"}.`,
    ...(output.totalUsd === undefined ? [] : [`Total: ${formatUsd(output.totalUsd)}.`]),
    `Holdings: ${output.holdings.map(holdingText).join(", ")}.`,
    `Top 10 look-through stocks: ${pctText(output.top10ConcentrationPct)} of the portfolio.`,
    `Stale: ${listText(output.staleTickers)}. Unpriced: ${listText(output.unpricedTickers)}.`,
  ].join("\n");
}

/** Register `folioprism_summary`. */
export function registerSummary(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_summary",
    {
      title: "FolioPrism summary",
      description:
        "Portfolio name, benchmark, price time, each holding's weight in percent (null when unpriced; dollar values and the total only when the detail level is full), top-10 look-through stock concentration, and stale or unpriced tickers. " +
        DATA_NOTICE,
      inputSchema: {
        mergeShareClasses: z.boolean().optional().describe(MERGE_SHARE_CLASSES_HELP),
      },
      outputSchema: Output,
    },
    async ({ mergeShareClasses = false }) => {
      const output = summarize(await ctx.folioprism.analysis(mergeShareClasses), isFull(ctx));
      return toolResult(describe(output, mergeShareClasses), output);
    },
  );
}
