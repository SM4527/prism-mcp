import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { APP_TOOLS } from "../apps.js";
import type { AppConfig } from "../config.js";
import { getJson } from "../http.js";
import { isToolEnabled, registerTool, type ToolContext } from "./register.js";
import { toolResult } from "./result.js";

const SAMPLE_PORTS: Record<string, string> = { folioprism: "8420", signalprism: "8500" };
export const HEALTH_TIMEOUT_MS = 2000;

export const CLOUD_NOTICE =
  "Tool results go to whichever AI app is connected. With a cloud app they leave this machine.";

export const DETAIL_TEXT = {
  percent: "Detail: percent. No dollar amounts or portfolio total are included.",
  full: "Detail: full. Dollar amounts are included; use only with a local AI app.",
};

const AppStatus = z.object({
  app: z.string(),
  enabled: z.boolean(),
  baseUrl: z.string(),
  stack: z.enum(["sample", "personal"]),
  reachable: z.boolean(),
  tools: z.array(z.string()),
  lastPoll: z.string().nullable().optional(),
  pausedUntil: z.string().nullable().optional(),
});

const StatusOutput = {
  detail: z.enum(["percent", "full"]),
  detailNotice: z.string(),
  apps: z.array(AppStatus),
  notice: z.string(),
};

type AppStatus = z.infer<typeof AppStatus>;

async function isHealthy(app: string, baseUrl: string): Promise<boolean> {
  try {
    await getJson(baseUrl, "/api/health", { app, timeoutMs: HEALTH_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** SignalPrism has no health route; its status answers instead and adds the last poll and pause. */
async function signalPrismPoll(ctx: ToolContext): Promise<Pick<AppStatus, "reachable" | "lastPoll" | "pausedUntil">> {
  try {
    const status = await ctx.signalprism.status();
    const poll = status.last_poll;
    return { reachable: true, lastPoll: poll ? (poll.finished_at ?? poll.started_at) : null, pausedUntil: status.paused_until };
  } catch {
    return { reachable: false };
  }
}

async function appStatus(ctx: ToolContext, app: string, appConfig: AppConfig): Promise<AppStatus> {
  const { config } = ctx;
  const live = !appConfig.enabled
    ? { reachable: false }
    : app === "signalprism"
      ? await signalPrismPoll(ctx)
      : { reachable: await isHealthy(app, appConfig.baseUrl) };
  return {
    app,
    enabled: appConfig.enabled,
    baseUrl: appConfig.baseUrl,
    stack: new URL(appConfig.baseUrl).port === SAMPLE_PORTS[app] ? "sample" : "personal",
    ...live,
    tools: APP_TOOLS[app].filter((name) => isToolEnabled(config, app, name)),
  };
}

function pollText(status: AppStatus): string {
  if (status.lastPoll === undefined) return "";
  const paused = status.pausedUntil ? `, polling paused until ${status.pausedUntil}` : ", not paused";
  return `\n${status.app} last poll: ${status.lastPoll ?? "none yet"}${paused}`;
}

function describe(status: AppStatus): string {
  const state = !status.enabled ? "disabled" : status.reachable ? "reachable" : "not reachable";
  const tools = status.tools.length > 0 ? status.tools.join(", ") : "none";
  return `${status.app}: ${state} at ${status.baseUrl} (${status.stack} stack)${pollText(status)}\n${status.app} tools: ${tools}`;
}

/** Register `prism_status`: configured apps, reachability, stack, enabled tools and detail level. */
export function registerStatus(server: McpServer, ctx: ToolContext): void {
  const { config } = ctx;
  registerTool(
    server,
    ctx,
    "prism",
    "prism_status",
    {
      title: "Prism status",
      description:
        "Shows which Prism apps are configured and reachable, whether each points at the sample or personal stack, which tools are enabled, and the detail level.",
      inputSchema: {},
      outputSchema: StatusOutput,
    },
    async () => {
      const entries = Object.entries(config.apps);
      const apps = await Promise.all(entries.map(([name, app]) => appStatus(ctx, name, app)));
      const detailNotice = DETAIL_TEXT[config.detail];
      const output = { detail: config.detail, detailNotice, apps, notice: CLOUD_NOTICE };
      return toolResult([...apps.map(describe), detailNotice, CLOUD_NOTICE].join("\n"), output);
    },
  );
}
