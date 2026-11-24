import { mkdtempSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseConfig } from "../src/config.js";
import { createServer, type ServerOptions } from "../src/server.js";

export const analysisFixture = readFileSync("tests/fixtures/analysis.json", "utf8");

/** The fixture as JSON text after `change` edits a parsed copy of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests edit arbitrary fixture JSON
export function fixtureWith(change: (analysis: any) => void): string {
  const analysis = JSON.parse(analysisFixture);
  change(analysis);
  return JSON.stringify(analysis);
}

export type FakeMode = "ok" | "http500" | "malformed" | "badJson" | "slow";

export interface FakeFolioPrism {
  baseUrl: string;
  server: Server;
  requests: { method: string; url: string }[];
  mode: FakeMode;
  body: string;
}

const SLOW_MS = 1000;

function respond(fake: FakeFolioPrism, req: IncomingMessage, res: ServerResponse): void {
  const path = new URL(req.url ?? "/", fake.baseUrl).pathname;
  const send = (status: number, body: string) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };
  if (req.method !== "GET") return send(405, '{"error":"method not allowed"}');
  if (path === "/api/health") return send(200, '{"ok":true}');
  if (path !== "/api/analysis") return send(404, '{"error":"not found"}');
  if (fake.mode === "http500") return send(500, '{"error":"boom"}');
  if (fake.mode === "malformed") return send(200, '{"summary":{"name":42}}');
  if (fake.mode === "badJson") return send(200, "{not json");
  if (fake.mode === "slow") {
    setTimeout(() => send(200, fake.body), SLOW_MS);
    return;
  }
  send(200, fake.body);
}

/** Start a fake FolioPrism on an ephemeral loopback port that serves the fixture and records requests. */
export async function startFakeFolioPrism(mode: FakeMode = "ok"): Promise<FakeFolioPrism> {
  const fake: FakeFolioPrism = {
    baseUrl: "",
    requests: [],
    mode,
    body: analysisFixture,
    server: createHttpServer((req, res) => {
      fake.requests.push({ method: req.method ?? "", url: req.url ?? "" });
      respond(fake, req, res);
    }),
  };
  await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  fake.baseUrl = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  return fake;
}

/** Stop a fake FolioPrism, dropping any request still waiting. */
export async function stopFakeFolioPrism(fake: FakeFolioPrism): Promise<void> {
  fake.server.closeAllConnections();
  await new Promise((resolve) => fake.server.close(resolve));
}

/** A fresh empty log folder outside the repo, so tests never write to the home folder. */
export function tempLogDir(): string {
  return mkdtempSync(join(tmpdir(), "prism-mcp-logs-"));
}

/**
 * Connect an MCP client to a Prism MCP server built from raw config, over an in-memory
 * transport. `logDir` defaults to a fresh temp folder.
 */
export async function connectClient(rawConfig: Record<string, unknown>, options: ServerOptions = {}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const config = parseConfig({ logDir: tempLogDir(), ...rawConfig });
  await createServer(config, options).connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

export interface FakeOptions extends ServerOptions {
  detail?: "percent" | "full";
  tools?: Record<string, boolean>;
  logDir?: string;
}

/** Start a fake FolioPrism in `mode` and connect an MCP client to a server pointed at it. */
export async function connectToFake(
  mode: FakeMode = "ok",
  { detail, tools, logDir, ...options }: FakeOptions = {},
): Promise<{ client: Client; fake: FakeFolioPrism }> {
  const fake = await startFakeFolioPrism(mode);
  const raw = {
    ...(detail && { detail }),
    ...(logDir && { logDir }),
    apps: { folioprism: { baseUrl: fake.baseUrl, ...(tools && { tools }) } },
  };
  const client = await connectClient(raw, options);
  return { client, fake };
}

/** Call a tool and return its text and structured content. */
export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[]).map((part) => part.text).join("\n");
  return { text, structured: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}
