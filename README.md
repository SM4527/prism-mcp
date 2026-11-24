# Prism MCP

A read-only MCP server (stdio) that lets an AI assistant answer questions about your own Prism apps, starting with FolioPrism. It runs on your machine and only talks to loopback addresses.

A personal analysis tool, not investment advice. Data comes from your own FolioPrism instance.

![Demo](docs/demo.gif)

*Sample portfolio, Qwen3 4B Instruct in LM Studio*

Tools: `prism_status`, `folioprism_summary`, `folioprism_top_stocks`, `folioprism_stock_exposure`, `folioprism_fund_overlap`, `folioprism_prism_view`, `folioprism_data_quality`.

## Run

```sh
npm install
npm run build
node dist/index.js
```

Try it by hand with `npx @modelcontextprotocol/inspector node dist/index.js`. For the command-line mode, put the server command after `--` so the Inspector does not take `--config` for itself: `npx @modelcontextprotocol/inspector --cli --method tools/call --tool-name prism_status -- node dist/index.js --config <path>`.

## Configure

Pass a JSON file shaped like `config.example.json` with `--config <path>` or the `PRISM_MCP_CONFIG` environment variable. If both are set, `--config` wins. Use an absolute path: clients do not control the working directory. Without either, the server uses the FolioPrism sample stack on `http://127.0.0.1:8420` at the `percent` detail level. Keep your own config outside the repo. A missing or invalid config file stops the server; it never falls back to defaults.

- `detail`: `percent` (default) or `full`. Only the config file sets it, never the model.
- `apps.<app>.enabled` and `apps.<app>.tools`: every tool is on unless set to `false`. Turned-off tools are not listed at all. An unknown tool name stops the server.
- `logDir` (default `~/.prism-mcp/logs`): each call appends time, tool, arguments, result size, duration and ok to `calls.jsonl`. Results are never logged. It must be outside this folder.

## Privacy

**Where results go.** Whatever a tool returns goes into the AI model's conversation. With a local model (LM Studio) nothing leaves your machine. With a cloud app such as Claude Desktop, results go to that provider.

Small local models can add details that aren't in the tool's answer. Expand the tool result in your chat app to see exactly what came back.

**Detail levels.**

| Level | Tools return | Use with |
|---|---|---|
| `percent` (default) | Percentages, tickers and names. No dollar amounts, no portfolio total | Any client |
| `full` | Adds dollar values and the portfolio total | Local models only |

**Sample vs personal stack.** The default points at FolioPrism's sample stack on port 8420. Pointing at your personal stack (port 8430) is your own choice, made in your own config outside this repo. The server refuses any base URL that is not `127.0.0.1`, `localhost` or `[::1]`, and only sends GET requests.

`npm run privacy-scan` runs on pre-push and blocks local config, env files and logs.

## Setup: LM Studio (local, recommended for real data)

On Windows on ARM (Snapdragon X, 16 GB RAM):

1. Install the ARM64 build of [LM Studio](https://lmstudio.ai) (Windows on Snapdragon is supported; see Qualcomm's [LM Studio tutorial for Windows on Snapdragon](https://www.qualcomm.com/developer/blog/2025/02/how-to-run-deepseek-windows-snapdragon-tutorial-lmstudio)) and Node 24 for ARM64. `node -p process.arch` should print `arm64`.
2. Download a 4B model with tool-use support, for example a Qwen3 4B build. Check for the tool-use badge. Small models can be unreliable at tool calls; Gemma 3 4B may struggle.
3. Run `npm run build` and create your config outside the repo.
4. In the right sidebar open the Program tab (labelled Integration in newer versions), then Install, then Edit mcp.json (`%USERPROFILE%\.lmstudio\mcp.json`). Add one of:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["C:/Users/YOU/projects/prism-mcp/dist/index.js", "--config", "C:/Users/YOU/prism-config.json"]
    }
  }
}
```

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["C:/Users/YOU/projects/prism-mcp/dist/index.js"],
      "env": { "PRISM_MCP_CONFIG": "C:/Users/YOU/prism-config.json" }
    }
  }
}
```

Clients pass only the environment variables listed in their config, so `PRISM_MCP_CONFIG` must be set in `env`.

5. Load the model, enable the `prism` server, and ask it to call `prism_status`. Confirm the stack (sample or personal), the detail level and the enabled tools before asking real questions. LM Studio asks you to confirm each tool call.

## Setup: Claude Desktop (cloud)

Tool results go to Anthropic. Keep `detail` at `percent` and do not use `full`.

1. Build the server and create your config as above.
2. Open `claude_desktop_config.json` and add the same `mcpServers` entry as above, either variant. The packaged Windows install keeps it at `%LOCALAPPDATA%\Claude-Data\<package-id>\claude_desktop_config.json`, not `%APPDATA%\Claude`. The reliable way to find it: menu (≡), Help, Troubleshooting, Enable Developer Mode, then Settings, Developer, Edit Config.
3. Quit Claude Desktop completely and restart it.
4. Ask Claude to call `prism_status` and confirm the stack and detail level before asking real questions.

Tested on Windows on ARM (Snapdragon X): Claude Desktop ran as native ARM64 and `prism_status` worked against the sample stack.

## Development

`npm test`, `npm run lint`. Built on the v1 MCP TypeScript SDK (`@modelcontextprotocol/sdk`). Demo recording steps: `docs/demo-checklist.md`.
