---
name: faster-chrome-devtools-skill
description: >
  Performance and safety guide for the Chrome DevTools MCP. Load this skill
  whenever you are about to use any chrome-devtools_* tool: take_snapshot,
  take_screenshot, navigate_page, wait_for, click, fill, new_page, list_pages,
  select_page, or evaluate_script. The exact tool prefix depends on your MCP
  server config key and may differ from chrome-devtools_*. Covers screenshot
  size limits that can permanently kill sessions, navigation timeout pitfalls,
  recovering when the browser will not connect, the fastest patterns for common
  browser automation tasks, Browser Run Quick Actions from Workers, and the
  quirks of driving a remote Cloudflare Browser Rendering target.
---

# Chrome DevTools MCP: faster patterns

## A note on tool names

Tool name prefixes come from the MCP server's config key, so they vary by setup. A default single-instance `chrome-devtools-mcp` install produces `chrome-devtools_*` (e.g. `chrome-devtools_take_snapshot`). If you run a second instance, such as one pointed at a remote Cloudflare Browser Rendering target, it gets whatever key you assign. This guide uses bare tool names (`take_snapshot`, `navigate_page`, etc.); apply them regardless of prefix.

## Tool speed reference

Measured from real session data (medians, at default viewport):

| Tool                    | Median  | Notes                                            |
| ----------------------- | ------- | ------------------------------------------------ |
| `take_snapshot`         | 34ms    | Fastest page inspection. Prefer over screenshot. |
| `list_console_messages` | 73ms    | Cheap                                            |
| `wait_for`              | 97ms    | Resolves instantly when text is already present  |
| `fill`                  | 245ms   |                                                  |
| `evaluate_script`       | 301ms   | Fast; use as escape hatch for React components   |
| `click`                 | 304ms   |                                                  |
| `take_screenshot`       | 722ms   | Slower; only use when visual appearance matters  |
| `navigate_page`         | 1,219ms | Highly variable; always set `timeout`            |
| `new_page`              | 2,380ms | Expensive; reuse existing tabs when possible     |
| `list_pages`            | 3,432ms | Slowest common tool; avoid in tight loops        |

## Screenshot safety

PNG is lossless and uncompressed — a full-page PNG of a typical 1280px-wide page can easily reach 3–7MB. JPEG and WebP use lossy compression; at quality 75 a JPEG is typically 90%+ smaller than the equivalent PNG with no perceptible quality loss for the purposes of page inspection.

This matters because of two size thresholds in the pipeline:

- 2MB (MCP threshold): screenshots >= 2MB are saved to a temp file and the model receives only a file path. The model never sees the image. This happens silently with no warning.
- 5MB (Claude API limit): if an inline screenshot exceeds 5MB as base64, the API rejects the entire request and the session becomes permanently unrecoverable — compaction doesn't help because it replays the same images.

Always use JPEG or WebP with a quality setting when the screenshot will be shown to the model:

```
// Safe
take_screenshot({ format: "jpeg", quality: 75 })

// Dangerous — PNG has no compression, fullPage compounds it
take_screenshot({ fullPage: true })
```

Only use `fullPage: true` when you genuinely need the full page, and never without `format: "jpeg", quality: 75`.

If you get back a file path instead of an image, the screenshot exceeded 2MB. Retry with JPEG at quality 60.

## Snapshot over screenshot

`take_snapshot` returns the page's [accessibility tree](https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree) — element roles, names, and UIDs you can pass to other tools. `take_screenshot` renders a [pixel image via Puppeteer](https://pptr.dev/api/puppeteer.page.screenshot).

Use `take_snapshot` when you need to know what's on the page. Use `take_screenshot` only when visual appearance (images, CSS rendering, canvas) matters.

```
// Check page state — fast
take_snapshot()

// Verify a chart rendered correctly — screenshot warranted
take_screenshot({ format: "jpeg", quality: 75 })
```

After `navigate_page`, `take_snapshot` resolves in ~15ms. `wait_for` followed by `take_screenshot` averages 3,800ms for the same information.

## Always set a timeout on navigate_page

With no timeout, `navigate_page` can block indefinitely. A localhost server with no timeout was observed hanging for 43 seconds.

```
// Always include a timeout
navigate_page({ type: "url", url: "https://example.com", timeout: 15000 })

// Dangerous — no timeout
navigate_page({ type: "url", url: "http://localhost:3000" })
```

Recommended timeouts by context:

| Context                       | Timeout  |
| ----------------------------- | -------- |
| Local dev server              | 10,000ms |
| Normal web page               | 15,000ms |
| Slow or resource-heavy page   | 30,000ms |
| OAuth / external redirect flow| 60,000ms |

## Reuse tabs

`new_page` runs ~2,400ms (median) and `list_pages` is slower still. If a relevant tab is already open, use it.

```
// Check first
list_pages()
select_page({ pageId: <id> })

// Only open a new tab if the URL isn't already open
new_page({ url: "https://example.com" })
```

## When the browser won't connect

The most common failure with the local server is `Not connected`, or a repeated `MCP error -32001: Request timed out`, on `list_pages`, `navigate_page`, or `new_page`. It means the MCP server can't reach a Chrome instance. Either Chrome isn't running with remote debugging enabled, or the MCP hasn't been granted browser access yet.

Retrying won't fix it. After one retry, stop and recover:

1. Ask the user to enable remote debugging (in Chrome, `chrome://inspect/#remote-debugging`) and to grant the MCP browser access if prompted, then retry once.
2. If a clean or anonymous browser is acceptable, fall back to a remote Cloudflare Browser Rendering instance if one is configured.

Don't burn several tool calls looping on the same error: it almost always needs the user to flip an access switch, not another attempt.

## How wait_for works

`wait_for` is MutationObserver-based, not a polling loop. It resolves the moment matching text appears in the DOM. When the content is already present or appears quickly, it resolves in 40–100ms.

The cost only comes when the expected content never appears and the timeout elapses. Set timeouts that reflect how long the operation could realistically take:

```
// After a click that triggers a UI update — short timeout is fine
wait_for({ text: ["Success", "Done"], timeout: 5000 })

// After submitting a form that hits a slow API
wait_for({ text: ["Order confirmed"], timeout: 15000 })

// After starting an OAuth flow — needs time for external redirect
wait_for({ text: ["refresh_token"], timeout: 60000 })
```

Do not use `wait_for` for things that will never appear in the accessibility tree (background processes, DNS propagation, external service completion). Use `evaluate_script` to poll a JS condition instead.

## evaluate_script for hard cases

The accessibility tree is insufficient for React custom components, headless dropdowns, and synthetic event inputs. Use `evaluate_script` as the escape hatch.

Programmatic click (React-select and similar):

```js
evaluate_script({
  function: () => {
    const option = document.querySelector('[class*="option"]');
    option?.click();
  }
})
```

Range slider with React synthetic events:

```js
evaluate_script({
  function: () => {
    const input = document.querySelector('input[type="range"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '75');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
})
```

Read state that isn't in the a11y tree:

```js
evaluate_script({
  function: () => document.querySelector('.status')?.dataset.state
})
```

## Canonical interaction pattern

The sub-100ms loop observed across automated sessions — every state transition confirmed with `wait_for` before the next action, no arbitrary sleeps:

```
click({ uid: "..." })                                     // ~105ms
wait_for({ text: ["Enter symbol"], timeout: 3000 })       // ~60ms
fill({ uid: "...", value: "AAPL" })                       // ~105ms
press_key({ key: "Enter" })                               // ~105ms
wait_for({ text: ["Sell All", "Action"], timeout: 3000 }) // ~65ms
fill({ uid: "...", value: "Sell" })                       // ~105ms
click({ uid: "..." })                                     // ~105ms
wait_for({ text: ["Order confirmed"], timeout: 5000 })    // ~55ms
```

## Anti-patterns

| Anti-pattern                              | Instead                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `take_screenshot()` to check DOM state    | `take_snapshot()`                                                  |
| `take_screenshot({ fullPage: true })`     | `take_screenshot({ fullPage: true, format: "jpeg", quality: 75 })` |
| `navigate_page({ url })` with no timeout  | Always include `timeout`                                           |
| `new_page()` when tab is already open     | `list_pages()` then `select_page()`                                |
| Long `wait_for` for async external events | `evaluate_script` polling a JS condition                           |
| Clicking into React components via a11y   | `evaluate_script` with direct DOM manipulation                     |
| Browser Run REST API fetch from a Worker  | `env.BROWSER.quickAction(...)` with a browser binding              |
| CDP session for one-shot scrape/PDF work  | Browser Run Quick Actions                                          |

## Browser Run Quick Actions from Workers

If the task is a stateless browser output from a URL or HTML string, and you are already writing a Cloudflare Worker, use Browser Run Quick Actions through the browser binding instead of Chrome DevTools MCP, CDP, Puppeteer, Playwright, or a REST API call.

Workers can call Quick Actions directly with `env.BROWSER.quickAction(action, options)`. This avoids API tokens, avoids external HTTP requests, and keeps the call on Cloudflare's network.

Use Quick Actions for:

- Screenshots: `"screenshot"`
- PDFs: `"pdf"`
- Rendered HTML: `"content"`
- Markdown extraction: `"markdown"`
- AI structured JSON extraction: `"json"`
- CSS selector scraping: `"scrape"`
- Link extraction: `"links"`
- Combined HTML and screenshot capture: `"snapshot"`
- Crawling: `"crawl"`

Required Worker configuration:

```jsonc
{
  "compatibility_date": "2026-03-24",
  "browser": {
    "binding": "BROWSER"
  }
}
```

Example:

```js
const screenshot = await env.BROWSER.quickAction("screenshot", {
  url: "https://www.cloudflare.com/",
});
```

Decision rule:

- Need one output from one rendered page: use `quickAction()`.
- Need login state, multi-step clicks, DOM mutation, debugging an active tab, or visual inspection by the agent: use Chrome DevTools MCP or a browser session.
- Need browser automation inside a Worker that cannot be expressed as a Quick Action: use Browser Run with Puppeteer, Playwright, or CDP.
- Never add a `fetch()` call to the Browser Run REST API from a Worker just to call Quick Actions. Use the binding.

## Cloudflare Browser Rendering (remote target)

A second `chrome-devtools-mcp` instance can point at a Chromium instance running on [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-run/cdp/mcp-clients/) over a CDP WebSocket instead of a local Chrome. Same package, same tool surface, different runtime; its tool prefix is whatever config key you give it. Same patterns above apply, with the caveats below.

When to prefer the remote (Cloudflare) variant:

- The local Chrome is busy with the user's real session and you don't want to interrupt it.
- You need a clean, anonymous browser with no logged-in cookies (the local autoConnect server inherits the user's session, which is sometimes exactly what you don't want).
- You're running in CI, on a server, or anywhere without a local Chrome.
- You want geolocation, userAgent, or viewport emulation without touching the user's real browser.

When to prefer the local variant:

- You need access to the user's existing logged-in session (banking, internal tools, paywalled sites).
- You're debugging something the user is looking at right now.
- Latency matters — local CDP round-trips beat the remote ones.

Known quirks observed driving the remote target:

- `resize_page` fails with `Browser.setContentsSize wasn't found`. The call reports status `completed` with the error buried in its output, so the success status is misleading: check the output, don't trust the status. Use `emulate({ viewport: "1280x800x1" })` instead. Every subsequent tool response will echo the emulated viewport, which is noisy but harmless.
- Default viewport is small (780x493). Always `emulate` a real viewport early in the session.
- `navigator.clipboard.readText()` inside `evaluate_script` hangs and returns `MCP error -32001: Request timed out` (no permission prompt UI is reachable). The session recovers on the next call, but you've burned a timeout. Read clipboard state another way (e.g., inspect the source element directly), or skip the check.
- The remote browser identifies as `HeadlessChrome/126` on `X11; Linux x86_64`. Sites that gate on UA or behave differently for headless Chrome will behave differently here than they do locally.
- `emulate({ geolocation: "lat x lon" })` works but is not echoed in the response. Confirm with `navigator.geolocation.getCurrentPosition` from `evaluate_script` if you actually need it.
- `lighthouse_audit` works and produces full HTML + JSON reports. Useful for ad-hoc audits without setting up a separate Lighthouse install.

Setup notes (for reference, not for the agent to do unprompted):

- Config lives in the MCP client (OpenCode, Claude Desktop, Cursor, etc.) as a `chrome-devtools-mcp` entry with `--wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/browser-rendering/devtools/browser?keep_alive=600000` and `--wsHeaders` carrying a `Browser Rendering - Edit` API token.
- `keep_alive` defaults to 600000ms (10 min) of idle before the session is recycled. Long-running automations should bump this.

Sanity-check pattern for a fresh remote session:

```
list_pages()                                    // confirm about:blank starting point
emulate({ viewport: "1280x800x1" })             // resize_page does not work
navigate_page({ url, timeout: 15000 })          // standard timeout
take_snapshot()                                 // verify load
evaluate_script({ function: () => ({
  ua: navigator.userAgent,
  viewport: { w: innerWidth, h: innerHeight }
})})                                            // confirm headless identity
```
