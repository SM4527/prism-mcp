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

const SIGNAL_FIXTURES = "fixtures/signalprism";
const signalFixture = (name: string) => readFileSync(`${SIGNAL_FIXTURES}/${name}.json`, "utf8");

/** The only query parameters SignalPrism accepts, by path. Anything else is a 400. */
const SIGNALPRISM_PARAMS: Record<string, string[]> = {
  "/api/mcp/signals": ["days", "minScore", "role", "heldOnly", "includePlan"],
  "/api/mcp/clusters": ["days"],
};

export interface FakeSignalPrism {
  baseUrl: string;
  server: Server;
  requests: { method: string; url: string }[];
  /** Override a response body by file name without extension, such as "status". */
  bodies: Record<string, string>;
}

function respondSignalPrism(fake: FakeSignalPrism, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", fake.baseUrl);
  const send = (status: number, body: string) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };
  const body = (name: string) => fake.bodies[name] ?? signalFixture(name);
  const allowed = SIGNALPRISM_PARAMS[url.pathname] ?? [];
  if (req.method !== "GET") return send(405, '{"error":"method not allowed"}');
  if ([...url.searchParams.keys()].some((key) => !allowed.includes(key))) return send(400, '{"error":"unknown parameter"}');
  if (url.pathname === "/api/mcp/status") return send(200, body("status"));
  if (url.pathname === "/api/mcp/clusters") return send(200, body("clusters"));
  if (url.pathname === "/api/mcp/signals") {
    return send(200, body(url.searchParams.get("includePlan") === "true" ? "signals-with-plan" : "signals"));
  }
  if (url.pathname === "/api/mcp/ticker/GSBD") return send(200, body("ticker-GSBD"));
  send(404, '{"error":"not found"}');
}

/** Start a fake SignalPrism on an ephemeral loopback port that serves the fixtures and records requests. */
export async function startFakeSignalPrism(): Promise<FakeSignalPrism> {
  const fake: FakeSignalPrism = {
    baseUrl: "",
    requests: [],
    bodies: {},
    server: createHttpServer((req, res) => {
      fake.requests.push({ method: req.method ?? "", url: req.url ?? "" });
      respondSignalPrism(fake, req, res);
    }),
  };
  await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  fake.baseUrl = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  return fake;
}

/** Stop a fake SignalPrism, dropping any request still waiting. */
export async function stopFakeSignalPrism(fake: FakeSignalPrism): Promise<void> {
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

export interface SignalPrismFakeOptions {
  detail?: "percent" | "full";
  tools?: Record<string, boolean>;
}

/** Start a fake SignalPrism and connect an MCP client to a server with SignalPrism enabled against it. */
export async function connectToFakeSignalPrism({ detail, tools }: SignalPrismFakeOptions = {}): Promise<{
  client: Client;
  fake: FakeSignalPrism;
}> {
  const fake = await startFakeSignalPrism();
  const raw = {
    ...(detail && { detail }),
    apps: { signalprism: { enabled: true, baseUrl: fake.baseUrl, ...(tools && { tools }) } },
  };
  return { client: await connectClient(raw), fake };
}

/** Call a tool and return its text and structured content. */
export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[]).map((part) => part.text).join("\n");
  return { text, structured: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}
