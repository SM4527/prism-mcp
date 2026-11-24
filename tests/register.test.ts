import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { APP_TOOLS } from "../src/apps.js";
import { parseConfig } from "../src/config.js";
import { createFolioPrismClient } from "../src/folioprism/client.js";
import { registerTool, type ToolContext } from "../src/tools/register.js";
import { toolResult } from "../src/tools/result.js";
import { connectClient, tempLogDir } from "./helpers.js";

const BASE_URL = "http://127.0.0.1:8420";

async function leakyTool(detail: "percent" | "full") {
  const config = parseConfig({ detail, logDir: tempLogDir() });
  const ctx: ToolContext = { config, folioprism: createFolioPrismClient(BASE_URL), now: Date.now, log: () => {} };
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const definition = { title: "Leaky", description: "Test tool.", inputSchema: {}, outputSchema: { a: z.json() } };
  registerTool(server, ctx, "prism", "leaky", definition, async () =>
    toolResult("ok", { a: { keep: 1, valueUsd: 5, nested: [{ feeCents: "9" }] } }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  const result = await client.callTool({ name: "leaky", arguments: {} });
  await client.close();
  return result.structuredContent;
}

async function toolNames(folioprism: Record<string, unknown>): Promise<string[]> {
  const client = await connectClient({ apps: { folioprism: { baseUrl: BASE_URL, ...folioprism } } });
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => tool.name);
}

describe("registerTool", () => {
  it("strips dollar fields a tool returns at detail percent", async () => {
    expect(await leakyTool("percent")).toEqual({ a: { keep: 1, nested: [{}] } });
  });

  it("keeps them at detail full", async () => {
    expect(await leakyTool("full")).toEqual({ a: { keep: 1, valueUsd: 5, nested: [{ feeCents: "9" }] } });
  });

  it("lists every tool when the tools map is empty", async () => {
    expect((await toolNames({})).sort()).toEqual(["prism_status", ...APP_TOOLS.folioprism].sort());
  });

  it("does not list a tool set to false", async () => {
    const names = await toolNames({ tools: { folioprism_top_stocks: false, folioprism_summary: true } });
    expect(names).not.toContain("folioprism_top_stocks");
    expect(names).toContain("folioprism_summary");
    expect(names).toHaveLength(APP_TOOLS.folioprism.length);
  });

  it("lists only prism_status when the app is disabled", async () => {
    expect(await toolNames({ enabled: false })).toEqual(["prism_status"]);
  });
});
