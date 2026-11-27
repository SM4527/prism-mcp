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
- Save as `docs/demo.gif` and add it to the README under `## FolioPrism`.
- Run `npm run privacy-scan`.

## SignalPrism GIF

`docs/signalprism-demo.gif` is built from two LM Studio screenshots, not a screen recording. Use SignalPrism's sample stack only (`http://127.0.0.1:8500`).

- Screenshots (not committed, only the GIF is): "Any cluster buying this month?" (tool `signalprism_clusters`) and "Any insider buys in my holdings in the last 30 days?" (tool `signalprism_recent`).
- Before capturing, check the frame for real tickers or amounts, other windows, and the personal server entry in LM Studio's integrations panel. Crop to the chat column, which drops the right-hand panel.
- Layout: 960 px wide, dark title card (2.5 s), then each screenshot under a step header (6 s and 7 s), looping. Same style as `docs/demo.gif`, built with a short Pillow script (`uv run --with pillow`) that is not kept in the repo.
- Add it to the README under `## SignalPrism` and run `npm run privacy-scan`.

## prism_status screenshot

`docs/prism-status.png` is a single LM Studio screenshot of `prism_status` against both sample stacks (`8420` and `8500`), shown below the tool table in the README.

- Crop to the chat column only (same as the SignalPrism GIF): remove the left sidebar and the right-hand integrations panel, which lists the personal server entry. The prompt and full response stay.
- Before committing, view the cropped file for real tickers or amounts, chat names in the sidebar and other windows. Run `npm run privacy-scan`.
