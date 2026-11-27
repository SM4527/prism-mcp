import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { ClustersResponse } from "../../signalprism/schema.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { asOfLine, clusterText, listLines, SIGNAL_NOTICE } from "./shared.js";

/** Register `signalprism_clusters`. */
export function registerClusters(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "signalprism",
    "signalprism_clusters",
    {
      title: "SignalPrism insider buying clusters",
      description:
        "Clusters: two or more insiders, at least one an officer, buying the same stock close together. Lists each member's purchase. " +
        SIGNAL_NOTICE,
      inputSchema: {
        days: z.number().int().positive().optional().describe("Window ended within this many days; SignalPrism sets the default."),
      },
      outputSchema: ClustersResponse.shape,
    },
    async ({ days }) => {
      const response = await ctx.signalprism.clusters(days);
      const head = `${response.clusters.length} clusters ended in the last ${response.filters.days} days.`;
      const rows = listLines(response.clusters.map(clusterText), "clusters");
      return toolResult([asOfLine(response.as_of), head, ...rows].join("\n"), response);
    },
  );
}
