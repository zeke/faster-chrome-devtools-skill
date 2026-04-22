# faster-chrome-devtools-skill

An agent skill that makes the [Chrome DevTools MCP](https://zeke.sikelianos.com/driving-chrome-with-an-agent/) faster and safer to use.

## Install

```sh
npx skills add zeke/faster-chrome-devtools-skill
```

## What it covers

- Prefer `take_snapshot` (80ms avg) over `take_screenshot` (1,118ms avg) for DOM inspection
- Screenshot safety: format, quality, and size rules to avoid permanently killing sessions with a 5MB API limit violation
- Always set timeouts on `navigate_page` — unset timeouts were observed hanging for 43 seconds
- Reuse existing tabs via `list_pages` + `select_page` instead of opening `new_page` (3,500ms avg)
- How `wait_for` actually works internally (MutationObserver-based, not polling) and when it costs you
- `evaluate_script` as an escape hatch for React components, custom dropdowns, and synthetic events
- The canonical sub-100ms interaction loop: `click` → `wait_for` → `fill` → `wait_for`

## How it was made

This skill was built by analyzing real Chrome DevTools MCP usage patterns across hundreds of OpenCode sessions stored in a local SQLite database (~770MB of conversation history).

The analysis covered:

- 653 `chrome-devtools_*` tool calls across 20+ sessions
- Per-tool timing distributions (avg, min, max) measured from actual call timestamps
- Tool transition patterns — what tool tends to follow what, and at what latency
- `wait_for` timeout failures and their root causes
- A real session that was permanently killed by a 7MB screenshot exceeding Claude's 5MB API limit
- The source code of `chrome-devtools-mcp` to understand how `wait_for`, `navigate_page`, and screenshot size-gating actually work internally

For background on the Chrome DevTools MCP and how to set it up, see:
[Driving Chrome with an Agent](https://zeke.sikelianos.com/driving-chrome-with-an-agent/)

## License

MIT
