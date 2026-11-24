import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { Analysis } from "../../folioprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { DATA_NOTICE, listText, PctOutput, pct, pctText } from "./shared.js";

/** FolioPrism's provenance rule: fund holdings older than this many days are stale. */
export const STALE_DAYS = 180;
const DAY_MS = 86_400_000;

/** FolioPrism's `isStale`: false for a null date, otherwise older than STALE_DAYS. */
export function isStale(asOf: string | null, now: number): boolean {
  return asOf !== null && now - Date.parse(asOf) > STALE_DAYS * DAY_MS;
}

const FundDate = z.object({ ticker: z.string(), asOf: z.string() });

const Output = {
  pricesAsOf: z.string().nullable(),
  staleTickers: z.array(z.string()),
  unpricedTickers: z.array(z.string()),
  oldestFundHoldings: FundDate.nullable(),
  staleFundHoldings: z.array(FundDate),
  benchmarkHoldingsAsOf: z.string().nullable(),
  lookThroughPct: PctOutput,
  fundCoveredPct: PctOutput,
  unavailableFunds: z.array(z.string()),
};

type CoverageItem = Analysis["intersection"]["coverage"]["items"][number];

function fundDates(items: CoverageItem[]) {
  return items
    .filter((i) => i.source !== "direct")
    .flatMap((i) => (i.holdingsAsOf ? [{ ticker: i.ticker, asOf: i.holdingsAsOf }] : []))
    .sort((x, y) => x.asOf.localeCompare(y.asOf));
}

function quality({ summary, intersection: { coverage } }: Analysis, now: number) {
  const dated = fundDates(coverage.items);
  return {
    pricesAsOf: summary.asOf,
    staleTickers: summary.staleTickers,
    unpricedTickers: summary.unpricedTickers,
    oldestFundHoldings: dated[0] ?? null,
    staleFundHoldings: dated.filter((d) => isStale(d.asOf, now)),
    benchmarkHoldingsAsOf: summary.benchmarkHoldingsAsOf,
    lookThroughPct: pct(coverage.lookThroughPct),
    fundCoveredPct: pct(coverage.fundCoveredPct),
    unavailableFunds: coverage.items.filter((i) => i.unavailable).map((i) => i.ticker),
  };
}

function describe(q: ReturnType<typeof quality>): string {
  const dates = (list: { ticker: string; asOf: string }[]) => listText(list.map((d) => `${d.ticker} ${d.asOf}`));
  return [
    `Prices as of ${q.pricesAsOf ?? "unknown"}. Stale: ${listText(q.staleTickers)}. Unpriced: ${listText(q.unpricedTickers)}.`,
    `Oldest fund holdings: ${dates(q.oldestFundHoldings ? [q.oldestFundHoldings] : [])}. Benchmark holdings as of ${q.benchmarkHoldingsAsOf ?? "unknown"}.`,
    `Fund holdings older than ${STALE_DAYS} days: ${dates(q.staleFundHoldings)}.`,
    `Look-through covers ${pctText(q.lookThroughPct)} of the portfolio and ${pctText(q.fundCoveredPct)} of fund value.`,
    `Funds without holdings data: ${listText(q.unavailableFunds)}.`,
  ].join("\n");
}

/** Register `folioprism_data_quality`. */
export function registerDataQuality(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_data_quality",
    {
      title: "FolioPrism data quality",
      description:
        `How fresh and complete FolioPrism's data is: price time, stale or unpriced tickers, holdings dates, fund holdings older than ${STALE_DAYS} days, look-through coverage and funds without holdings data. ` +
        DATA_NOTICE,
      inputSchema: {},
      outputSchema: Output,
    },
    async () => {
      const output = quality(await ctx.folioprism.analysis(false), ctx.now());
      return toolResult(describe(output), output);
    },
  );
}
