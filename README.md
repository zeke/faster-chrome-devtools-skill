# faster-chrome-devtools-skill

An [agent skill](https://agentskills.io) and command-line tool for controlling Chrome directly through the
Chrome DevTools Protocol (CDP).

Works with Claude Code, OpenCode, Codex, Pi, or any coding agent that supports the Agent Skills protocol.

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

Run this command to install the skill globally for all your installed agents:

```sh
npx skills add zeke/faster-chrome-devtools-skill --global --all --yes
```

This skill includes a dependency-free Node.js script that uses a WebSocket connection to Chrome, so **you will need Node.js installed**, but you **do not need** Chrome DevTools MCP, Puppeteer, or Playwright.

## Try it

Once installed, you can invoke the skill by pasting one of these prompts into your coding agent.

**🔑 Option 1: Drive your existing logged-in Chrome.**

For this to work, you'll need to enable remote debugging in Chrome at `chrome://inspect/#remote-debugging`.

```text
Using my logged-in Chrome, open https://github.com/notifications, snapshot the page, and summarize what needs my attention.
```

**🕵️‍♀️ Option 2: Use a clean, anonymous local Chromium with no logins.**

```text
Launch a fresh anonymous Chrome instance on a throwaway profile, open https://news.ycombinator.com, take a screenshot, and list the top five story titles.
```

**⛅️ Option 3: Run in the cloud on Cloudflare [Browser Run](https://developers.cloudflare.com/browser-run/).**

```text
Using Cloudflare Browser Run, open https://blog.cloudflare.com, read the page, and give me the five most recent post titles with their links as a markdown table. If the Browser Rendering credentials aren't set up yet, configure the required environment variables to authenticate first.
```

The skill's Browser Run setup uses `lab=true` by default so Chrome beta features
such as WebMCP are available when the remote browser supports them.

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

## Why a CLI instead of MCP?

Google's [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
is still great and this skill began as a guide for using it, but using a CLI
instead has some key advantages:

- Works anywhere. Any agent that supports Agent Skills and can run a shell can use
  it, with no MCP server to configure.
- Full CDP protocol. MCP offers a fixed set of high-level tools plus JavaScript
  evaluation; the CLI's `raw` command can call any Chrome DevTools method.
- Leaner context. The MCP server advertises dozens of tools to the model for the
  whole session. This skill loads only its description until used, then runs
  through the shell tool your agent already has.
- No screenshot bloat. MCP returns screenshots inline to the model, which is why
  large ones can be silently dropped or even break a session. The CLI writes
  images to a file and returns the path, so the bytes enter the model only if you
  ask for them.

To set up MCP instead, see [Browsers in the cloud](https://zeke.sikelianos.com/browsers-in-the-cloud/).

## Development

See [AGENTS.md](AGENTS.md)

## License

MIT
