# faster-chrome-devtools-skill

An agent skill and command-line tool for controlling Chrome directly through the
Chrome DevTools Protocol (CDP).

It uses a WebSocket connection from Node.js to Chrome, so you do not need Chrome
DevTools MCP, Puppeteer, or Playwright.

![HIC LIMAX NAVIGAT LENTE](images/chrome-snail-09.jpg)

## Capabilities

- List, open, and reuse tabs
- Read compact accessibility snapshots with stable element references
- Click and fill by accessibility reference or CSS selector
- Navigate with explicit timeouts
- Wait for text or selectors without arbitrary sleeps
- Type into focused cross-origin frames using native CDP input
- Capture compressed JPEG/WebP screenshots by default
- Inspect console messages and failed network loads
- Evaluate JavaScript or invoke any raw CDP method
- Connect to authenticated remote browser endpoints
- Keep the connection alive in a lightweight background daemon

## Install

```sh
npx skills add zeke/faster-chrome-devtools-skill --global --all --yes
```

Node.js 22 or later is required. For local browser access, enable remote
debugging in Chrome at `chrome://inspect/#remote-debugging`.

## Try it

Once installed, paste one of these prompts into your coding agent.

Drive your existing logged-in Chrome:

```text
Using my logged-in Chrome, open https://github.com/notifications, snapshot the page, and summarize what needs my attention.
```

Use a clean, anonymous local Chromium with no logins:

```text
Launch a fresh anonymous Chrome instance on a throwaway profile, open https://news.ycombinator.com, take a screenshot, and list the top five story titles.
```

Run in the cloud on Cloudflare Browser Rendering:

```text
Using Cloudflare Browser Rendering, open https://blog.cloudflare.com, read the page, and give me the five most recent post titles with their links as a markdown table. If the Browser Rendering credentials aren't set up yet, configure the required environment variables to authenticate first.
```

## Design

The CLI is implemented entirely with Node.js built-ins. `scripts/lib/websocket.mjs`
contains the small RFC 6455 client used to support custom HTTP upgrade headers,
which Node's browser-compatible global `WebSocket` API does not expose.

A loopback-only background daemon holds the CDP connection open for 20 minutes.
Its random authentication token and connection details are stored in an
owner-readable temporary state file. This avoids repeated Chrome access prompts
without exposing the daemon on the network.

Stop the sole active daemon with `node scripts/cdp.mjs stop`. If several are
running, the CLI lists safe daemon IDs and requires `stop --id <id>` or the
explicit `stop --all`. An endpoint-specific stop can be selected with
`--ws-endpoint` or `--http-endpoint`; cleanup never needs to reconnect to or
rediscover the browser.

## Development

```sh
node --test
node --check scripts/cdp.mjs
node --check scripts/lib/websocket.mjs
```

The test suite has no external dependencies and does not require Chrome.

## License

MIT
