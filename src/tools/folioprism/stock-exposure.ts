import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { amountText, DATA_NOTICE, exposureText, isFull, PctOutput, TOP_50_NOTE } from "./shared.js";
import { toRow } from "./top-stocks.js";

const DIRECT_HOLDING = "Direct Holding";

const Fund =z.object({ ticker: z.string(), name: z.string(), portfolioPct: PctOutput, valueUsd: z.number().optional() });
const Output = {
  found: z.boolean(),
  ticker: z.string(),
  name: z.string().optional(),
  portfolioPct: PctOutput.optional(),
  valueUsd: z.number().optional(),
  viaFunds: z.array(Fund).optional(),
};

/** Register `folioprism_stock_exposure`. */
export function registerStockExposure(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_stock_exposure",
    {
      title: "FolioPrism stock exposure",
      description:
        "How much of the portfolio is in one stock, in total and through each fund, from the Top 50 stock intersection. " +
        DATA_NOTICE,
      inputSchema: { ticker: z.string().min(1).describe("Stock ticker, any case.") },
      outputSchema: Output,
    },
    async ({ ticker }) => {
      const rows = (await ctx.folioprism.analysis(false)).intersection.rows;
      const row = rows.find((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
      if (!row) {
        return toolResult(`${ticker} is outside the Top 50 stock intersection. ${TOP_50_NOTE}`, { found: false, ticker });
      }
      const { funds: viaFunds, ...stock } = toRow(row, isFull(ctx));
      const via = viaFunds.map((f) => (f.name === DIRECT_HOLDING ? exposureText({ ...f, ticker: `${f.ticker} (held directly)` }) : exposureText(f))).join(", ");
      const text = `${row.ticker} (${row.name}) is ${amountText(stock)} of the portfolio: ${via}.\nThis total is complete and includes every fund.`;
      return toolResult(text, { found: true, ...stock, viaFunds });
    },
  );
}
