# faster-chrome-devtools-skill

Google maintains an [official MCP server](https://zeke.sikelianos.com/driving-chrome-with-an-agent/) that lets you remotely control your logged-in Chrome browser window using an AI agent. This is incredibly useful, but it's also slow by default. This skill exists to make those MCP interactions faster and safer.

## Install

```sh
npx skills add zeke/faster-chrome-devtools-skill
```

## What it covers

- Prefer [`take_snapshot`](https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree) (80ms avg) over [`take_screenshot`](https://pptr.dev/api/puppeteer.page.screenshot) (1,118ms avg) — `take_snapshot` returns the page's accessibility tree (element roles, names, and UIDs you can interact with); `take_screenshot` renders a pixel image. Use snapshot to read or interact with the page; only screenshot when you need to see how it visually looks.

- Screenshot safety: PNG is lossless and large — a full-page PNG can easily reach 3–7MB. JPEG at quality 75 is typically 90%+ smaller. If a screenshot hits the MCP's internal 2MB threshold it's silently saved to disk and the model never sees it; if it hits Claude's 5MB API limit it permanently kills the session. The skill tells you when to use JPEG, what quality to set, and what to do when you get a file path back instead of an image.

- Always set timeouts on `navigate_page` — unset timeouts were observed hanging for 43 seconds in real sessions

- Reuse existing tabs via `list_pages` + `select_page` instead of opening `new_page` (3,500ms avg)

- How `wait_for` actually works internally (MutationObserver-based, not polling) and when it costs you

- `evaluate_script` as an escape hatch for React components, custom dropdowns, and synthetic events

- The canonical sub-100ms interaction loop: `click` → `wait_for` → `fill` → `wait_for`

## How it was made

This skill was built by mining OpenCode's local session history — a SQLite database of every tool call, timing, and response across many months of real browser automation work.

The analysis covered:

- Hundreds of `chrome-devtools_*` tool calls across many sessions
- Per-tool timing distributions measured from actual call timestamps
- Tool transition patterns — what tool tends to follow what, and at what latency
- `wait_for` timeout failures and their root causes
- A real session that was permanently killed by an oversized screenshot exceeding Claude's API limit
- The source code of `chrome-devtools-mcp` to understand how `wait_for`, `navigate_page`, and screenshot size-gating actually work internally

## License

MIT
