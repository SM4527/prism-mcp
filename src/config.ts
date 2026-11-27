import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as z from "zod";
import { APP_TOOLS } from "./apps.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The prism-mcp folder: the parent of `src/` or `dist/`. */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

const AppSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.url(),
  tools: z.record(z.string(), z.boolean()).default({}),
});

const SAMPLE_FOLIOPRISM = { enabled: true, baseUrl: "http://127.0.0.1:8420", tools: {} };
const SAMPLE_SIGNALPRISM_URL = "http://127.0.0.1:8500";
const SAMPLE_SIGNALPRISM = { enabled: false, baseUrl: SAMPLE_SIGNALPRISM_URL, tools: {} };

const SignalPrismSchema = AppSchema.extend({ baseUrl: z.url().default(SAMPLE_SIGNALPRISM_URL) });

const ConfigSchema = z.object({
  detail: z.enum(["percent", "full"]).default("percent"),
  apps: z
    .object({
      folioprism: AppSchema.default(SAMPLE_FOLIOPRISM),
      signalprism: SignalPrismSchema.default(SAMPLE_SIGNALPRISM),
    })
    .default({ folioprism: SAMPLE_FOLIOPRISM, signalprism: SAMPLE_SIGNALPRISM }),
  logDir: z.string().default("~/.prism-mcp/logs"),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AppConfig = z.infer<typeof AppSchema>;

function refuse(reason: string): never {
  throw new Error(`Refusing to start: ${reason}`);
}

/** Throw unless the URL's host is loopback. */
export function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (!LOOPBACK_HOSTS.has(host)) refuse(`${url} is not a loopback address (127.0.0.1, localhost or [::1]).`);
}

function assertKnownTools(app: string, tools: Record<string, boolean>): void {
  for (const name of Object.keys(tools)) {
    if (!APP_TOOLS[app].includes(name)) refuse(`unknown tool in config: apps.${app}.tools.${name}`);
  }
}

function assertOutsidePackage(logDir: string): void {
  if (!isAbsolute(logDir)) refuse(`logDir must be an absolute path or start with ~, got ${logDir}`);
  const rel = relative(PACKAGE_ROOT, logDir);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    refuse(`logDir must be outside the prism-mcp folder, got ${logDir}`);
  }
}

/** Validate raw config, expand `~` in logDir and enforce the loopback, tool-name and logDir guards. */
export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    refuse(`invalid config at ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  const config = result.data;
  for (const [name, app] of Object.entries(config.apps)) {
    assertLoopback(app.baseUrl);
    assertKnownTools(name, app.tools);
  }
  const logDir = config.logDir.replace(/^~(?=$|[/\\])/, homedir());
  assertOutsidePackage(logDir);
  return { ...config, logDir };
}

function readConfigFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    refuse(`config file not found or unreadable: ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse(`config file is not valid JSON: ${path}`);
  }
}

/**
 * Load config from the file named by `--config <path>`, else PRISM_MCP_CONFIG,
 * or use the sample-stack defaults when neither is set.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): Config {
  const { values } = parseArgs({ args: argv, options: { config: { type: "string" } } });
  const path = values.config ?? env.PRISM_MCP_CONFIG;
  return parseConfig(path === undefined ? {} : readConfigFile(path));
}
