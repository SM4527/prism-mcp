# Changelog

## 0.2.0

- SignalPrism as a second app: `signalprism_recent`, `signalprism_clusters`, `signalprism_ticker`. Off until enabled in the config.
- `watchedOnly` filter on `signalprism_recent`.
- Every SignalPrism answer starts with an `as of` line.
- `prism_status` reports SignalPrism (reachable, stack, last poll, pause).
- Privacy scan also guards SignalPrism's personal port.
- Tests read `as_of` values from the fixtures.

## 0.1.0

- FolioPrism tools over MCP (stdio): summary, top stocks, stock exposure, fund overlap, Prism view, data quality, plus `prism_status`.
- `percent` and `full` detail levels, set only in the config file.
- Loopback-only, GET-only client; call log without results.
- Setup guides for LM Studio and Claude Desktop; demo GIF.
