import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

// stdout carries the MCP protocol, so everything else goes to stderr.
let server;
try {
  server = createServer(loadConfig());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

await server.connect(new StdioServerTransport());
