# Demo recording checklist

Sample stack only (`http://127.0.0.1:8420`). Never record anything from the personal stack.

## Before

- Start FolioPrism's sample stack only. Check `http://127.0.0.1:8420/api/health`.
- Leave the personal stack alone and close its windows and browser tabs.
- Use a fresh config: sample URL, `detail: percent`, default tools. Do not use your personal config.
- Turn on Windows Do Not Disturb so no notification appears.
- Start a clean chat. Close editors or windows showing your real `mcp.json`, logs or `~/.prism-mcp`.
- Pick the client: record in LM Studio if the local model handles all five calls below cleanly in a dry run; otherwise record in Claude Desktop.

## Record

- Crop strictly to the chat area: no taskbar, title bar, browser bookmarks or other windows.
- Tool: ScreenToGif or Xbox Game Bar. 720p or less, GIF under about 5 MB, under about 45 seconds.
- Five calls, in order:
  1. `prism_status` (shows sample stack and `percent`)
  2. `folioprism_summary`
  3. `folioprism_top_stocks`
  4. `folioprism_stock_exposure` for a sample ticker
  5. `folioprism_fund_overlap`

## After

- Step through every frame. Check for real tickers or amounts, and for the taskbar, title bar, bookmarks, notifications and other windows.
- Save as `docs/demo.gif` and add it to the README.
- Run `npm run privacy-scan`.
