import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertLoopback, loadConfig, PACKAGE_ROOT, parseConfig } from "../src/config.js";

function configFile(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "prism-mcp-config-")), "config.json");
  writeFileSync(path, text);
  return path;
}

describe("config", () => {
  it("defaults to the sample stack at percent detail", () => {
    const config = loadConfig({});
    expect(config.detail).toBe("percent");
    expect(config.apps.folioprism.baseUrl).toBe("http://127.0.0.1:8420");
    expect(config.logDir.startsWith(homedir())).toBe(true);
  });

  it("loads the example file", () => {
    const config = loadConfig({ PRISM_MCP_CONFIG: "config.example.json" });
    expect(config.apps.folioprism.tools).toEqual({ folioprism_top_stocks: false });
  });

  it.each(["percent", "full"])("accepts detail %s", (detail) => {
    expect(parseConfig({ detail }).detail).toBe(detail);
  });

  it.each(["everything", "Full", "", 1, null])("refuses detail %j", (detail) => {
    expect(() => parseConfig({ detail })).toThrow(/^Refusing to start: invalid config at detail/);
  });

  it("rejects a non-loopback base URL", () => {
    const raw = { apps: { folioprism: { baseUrl: "http://192.168.1.5:8420" } } };
    expect(() => parseConfig(raw)).toThrow(/not a loopback/);
  });

  it("refuses an unknown tool name", () => {
    const raw = { apps: { folioprism: { baseUrl: "http://127.0.0.1:8420", tools: { folioprism_sumary: false } } } };
    expect(() => parseConfig(raw)).toThrow("Refusing to start: unknown tool in config: apps.folioprism.tools.folioprism_sumary");
  });

  it.each([PACKAGE_ROOT, join(PACKAGE_ROOT, "logs"), "logs"])("refuses logDir %s", (logDir) => {
    expect(() => parseConfig({ logDir })).toThrow(/^Refusing to start: logDir must be/);
  });

  it("accepts a logDir outside the package", () => {
    const logDir = join(tmpdir(), "prism-mcp-logs");
    expect(parseConfig({ logDir }).logDir).toBe(logDir);
  });
});

describe("config file", () => {
  it("refuses a missing file instead of using defaults", () => {
    const path = join(tmpdir(), "prism-mcp-does-not-exist.json");
    expect(() => loadConfig({ PRISM_MCP_CONFIG: path })).toThrow(
      `Refusing to start: config file not found or unreadable: ${path}`,
    );
  });

  it("refuses an empty PRISM_MCP_CONFIG", () => {
    expect(() => loadConfig({ PRISM_MCP_CONFIG: "" })).toThrow(/^Refusing to start: config file not found/);
  });

  it("refuses invalid JSON", () => {
    const path = configFile("{ detail: full");
    expect(() => loadConfig({ PRISM_MCP_CONFIG: path })).toThrow(`Refusing to start: config file is not valid JSON: ${path}`);
  });

  it("refuses an invalid detail in the file", () => {
    const path = configFile('{ "detail": "dollars" }');
    expect(() => loadConfig({ PRISM_MCP_CONFIG: path })).toThrow(/invalid config at detail/);
  });
});

describe("--config option", () => {
  const full = () => configFile('{ "detail": "full" }');
  const percent = () => configFile('{ "detail": "percent" }');

  it("loads the file named by the option", () => {
    expect(loadConfig({}, ["--config", full()]).detail).toBe("full");
  });

  it("accepts the --config=<path> form", () => {
    expect(loadConfig({}, [`--config=${full()}`]).detail).toBe("full");
  });

  it("loads the file named by the environment when there is no option", () => {
    expect(loadConfig({ PRISM_MCP_CONFIG: full() }, []).detail).toBe("full");
  });

  it("lets the option win over the environment", () => {
    expect(loadConfig({ PRISM_MCP_CONFIG: percent() }, ["--config", full()]).detail).toBe("full");
  });

  it("uses the sample-stack defaults with neither", () => {
    const config = loadConfig({}, []);
    expect(config.detail).toBe("percent");
    expect(config.apps.folioprism.baseUrl).toBe("http://127.0.0.1:8420");
  });

  it("refuses a missing option file even when the environment file is good", () => {
    const path = join(tmpdir(), "prism-mcp-does-not-exist.json");
    expect(() => loadConfig({ PRISM_MCP_CONFIG: percent() }, ["--config", path])).toThrow(
      `Refusing to start: config file not found or unreadable: ${path}`,
    );
  });

  it("refuses invalid JSON in the option file", () => {
    const path = configFile("{ detail: full");
    expect(() => loadConfig({}, ["--config", path])).toThrow(`Refusing to start: config file is not valid JSON: ${path}`);
  });

  it("refuses --config with no value", () => {
    expect(() => loadConfig({}, ["--config"])).toThrow(/config/);
  });
});

describe("assertLoopback", () => {
  it.each(["http://127.0.0.1:8420", "http://localhost:8420", "http://[::1]:8420"])("accepts %s", (url) => {
    expect(() => assertLoopback(url)).not.toThrow();
  });

  it.each(["http://192.168.1.5:8420", "https://example.com", "http://127.0.0.1.evil.com:8420"])(
    "rejects %s",
    (url) => {
      expect(() => assertLoopback(url)).toThrow(/not a loopback/);
    },
  );
});
