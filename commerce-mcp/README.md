# Commerce MCP

One MCP server that gives an AI assistant (Claude, ChatGPT, Cursor, or any other MCP client) access to:

- **Amazon Seller (SP-API)**: orders, sales, inventory, catalog for any ASIN, Buy Box and every competing offer, fees, listings (price/content edits), the whole FBA "Send to Amazon" shipment flow, labels, MCF, reports, feeds, Data Kiosk, finances, notifications, Buy Shipping, A+ content and review insights. That's about 150 operations plus a raw caller for anything else. Restricted PII operations (buyer names and addresses) are left out on purpose.
- **Other sales channels** such as 9Yard, through a configurable connector (`channels_list`, `channel_request`).
- **Your real Google Chrome on your computer** (you can watch and use it at the same time): tabs, incognito, human-like clicking, typing, dragging, scrolling, zoom, proxies, forced screen size, headless mode (keeps working while the PC is locked), cookies, uploads, downloads, network inspection, and a **record mode** that captures everything a website does.

```
 Claude / ChatGPT / Cursor ──HTTPS──▶  Cloudflare Worker (this repo: worker/)
                                         ├─ Amazon SP-API
                                         ├─ 9Yard and other channel APIs
                                         └─ BridgeHub (Durable Object)
                                                 ▲ WebSocket (outbound from your PC)
                                                 │
                              your computer: bridge/ ──▶ Chrome (Playwright)
```

The bridge on your computer connects **out** to the Worker, so you don't need to open ports, set up port forwarding or run a tunnel.

---

## Hosting options

| Option | Cost | Notes |
|---|---|---|
| **Cloudflare Workers (recommended, what's built here)** | Free tier works. Workers Paid ($5/mo) is advised for heavy report use. | Always on, HTTPS included, nothing to maintain. The free plan allows 10 ms CPU and 50 outbound calls per request. Big reports or long polling can hit those limits; the paid plan raises them a lot. |
| Your own server / VPS | What you already pay | Possible. The Worker code uses only web-standard APIs, but the Durable Object relay would need a Node port. Ask me if you'd rather host it there. |
| Bridge only, no cloud | Free | Not built: without a public server, cloud AI apps can't reach your computer. |

---

## 1. Deploy the server (Cloudflare)

Needs Node 22+ and a free Cloudflare account.

```bash
cd commerce-mcp/worker
npm install
npx wrangler login
```

Create the secrets. Generate the two random ones with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```bash
npx wrangler secret put MCP_SECRET          # random: protects the MCP URL
npx wrangler secret put BRIDGE_TOKEN        # random: lets your PC's bridge connect
npx wrangler secret put LWA_CLIENT_ID       # Seller Central → Develop Apps → your app → LWA credentials
npx wrangler secret put LWA_CLIENT_SECRET
npx wrangler secret put SP_REFRESH_TOKEN    # the Atzr|… refresh token from authorizing the app
npx wrangler secret put SP_SELLER_ID        # your Merchant Token (Seller Central → Settings → Account Info → Merchant Token)
npx wrangler secret put CHANNELS_JSON       # optional, see "Other channels" below
```

If your account isn't North America / amazon.com, edit `SP_REGION` and `SP_MARKETPLACE_ID` in `wrangler.toml`. Then deploy:

```bash
npx wrangler deploy
```

Your MCP URL is: `https://commerce-mcp.<your-subdomain>.workers.dev/mcp/<MCP_SECRET>`

Keep that URL private. Anyone who has it can use the tools.

## 2. Connect your AI apps

The server uses the standard MCP "Streamable HTTP" transport. Every client below uses the same URL.

| App | How |
|---|---|
| **Claude (web / desktop / mobile)** | Settings → Connectors → *Add custom connector* → paste the MCP URL. |
| **Claude Code** | `claude mcp add --transport http commerce https://…workers.dev/mcp/<MCP_SECRET>` |
| **ChatGPT** | Settings → Apps & Connectors → Advanced → turn on *Developer mode*, then *Create* a connector: paste the MCP URL, Authentication = *No authentication* (the secret in the URL is the protection). Enable it in a chat through the + menu. Requires a plan that allows developer-mode connectors. |
| **Cursor** | `~/.cursor/mcp.json` → `{"mcpServers":{"commerce":{"url":"https://…/mcp/<MCP_SECRET>"}}}` |
| **VS Code / Copilot, Windsurf, others** | Add a remote HTTP MCP server with the same URL. If an app only supports a header, use `/mcp` with `Authorization: Bearer <MCP_SECRET>`. |

## 3. Install the Chrome bridge on your computer

Needs Node 22+ and **Google Chrome** (your regular Chrome; Chromium is not used).

```bash
cd commerce-mcp/bridge
npm install
cp config.example.json config.json     # Windows: copy config.example.json config.json
```

Edit `config.json`:

- `serverUrl`: your Worker URL, without `/mcp/...`.
- `bridgeToken`: the same value as the `BRIDGE_TOKEN` secret.
- `name`: a name for this computer. You can connect several computers; tools take a `computer` argument to choose one.

### Mode A (default): your own Chrome window, you and the assistant together

`config.json` has `"cdpUrl": "http://127.0.0.1:9222"`.

1. Double-click **`open-chrome.cmd`** (Mac: `open-chrome.sh`). Regular Google Chrome opens.
2. Start **`start-bridge.cmd`** (Mac: `./start-bridge.sh`).
3. Use that Chrome like normal: log into Seller Central, 9Yard and anything else, and watch the assistant click around. You can take over at any point. Logins are remembered.

The bridge only *connects* to this Chrome. Restarting or stopping the bridge never closes your window or tabs.

Why a separate Chrome profile? Since Chrome 136, Google blocks remote control of your everyday profile (a security measure against malware stealing cookies). `open-chrome` therefore uses its own profile folder (`bridge/chrome-profile/`). It's the same Chrome, just a different profile, so log into your sites there once.

### Mode B: the bridge launches Chrome itself (locked-screen / unattended)

Remove `cdpUrl` from `config.json`. The bridge then starts Google Chrome on its own with:

- `headless`: `true` = no window, and **it keeps working while the computer is locked**. `false` = visible window.
- `width` / `height`: a forced screen size (default 1920×1080, whatever your monitor is).
- `proxy`: e.g. `{"server":"http://host:port","username":"u","password":"p"}`. You can also set a proxy per tab with `browser_tab_new`.

In this mode `browser_launch` switches between visible and headless, changes the resolution, proxy, user agent and so on, on request.

### Run automatically, even when locked

- **Windows:** run this once (change the path):
  ```
  schtasks /Create /SC ONLOGON /TN "Commerce MCP Bridge" /TR "\"C:\path\to\commerce-mcp\bridge\start-bridge.cmd\""
  ```
  It starts at login and keeps running after you lock the screen. Chrome is started with flags that stop it from pausing hidden or locked windows; for fully unattended use, Mode B with `headless: true` is the most reliable. Set Power settings → Sleep to *Never*; a sleeping PC can't be reached.
- **Mac:** System Settings → General → Login Items → add `start-bridge.sh` (and `open-chrome.sh` for Mode A), and turn off sleep.

## Browser tools

| | |
|---|---|
| Tabs & contexts | `browser_tabs`, `browser_tab_new` (incognito, per-tab proxy, user agent, size, mobile, geolocation), `browser_tab_select`, `browser_tab_close` (one / all / all-except), `browser_context_close` |
| Navigate & read | `browser_navigate`, `browser_history`, `browser_snapshot` (numbered elements + text), `browser_screenshot`, `browser_content` |
| Interact | `browser_click` (natural mouse paths; double/right-click; Ctrl-click to a new tab), `browser_hover`, `browser_type` (human key timing), `browser_press`, `browser_select`, `browser_check`, `browser_drag`, `browser_scroll`, `browser_mouse`, `browser_upload`, `browser_wait` |
| View & settings | `browser_launch` (headless, resolution, proxy, UA, locale, timezone, Chrome flags), `browser_set_viewport`, `browser_zoom`, `browser_emulate`, `browser_block`, `browser_dialogs`, `browser_cookies` |
| Inspect | `browser_network`, `browser_request_detail`, `browser_console`, `browser_evaluate`, `browser_downloads`, `browser_pdf` |
| **Record mode** | `browser_record_start` → browse (the assistant, you, or both) → `browser_record_stop`. Returns an endpoint map (API calls grouped by pattern, query/body fields, response shapes, GraphQL operations), auth mechanism, cookies, third-party domains, scripts, WebSockets and your own clicks. `browser_record_query` and `browser_record_get` dig into any request or JavaScript file. Everything is saved under `bridge/recordings/<name>/`. |

Secret values (cookies, Authorization headers, tokens) are masked in what the assistant sees unless you ask for `revealSecrets`. The full raw data stays on your computer.

## Amazon tools

- `amazon_guide`: step-by-step workflows (FBA inbound, pricing/Buy Box, sales, reports, listings).
- `amazon_offers`: Buy Box winner and every competing seller for up to 20 ASINs.
- `amazon_sales`, `amazon_orders`, `amazon_inventory`.
- `amazon_run_report` / `amazon_download_report`: request, wait, download and parse any report.
- `amazon_data_kiosk_query`: sales and traffic by ASIN (sessions, conversion, Buy Box %).
- `amazon_submit_feed`: bulk listing changes.
- `amazon_wait_operation`: for the async FBA inbound steps.
- `amazon_list_operations` + `amazon_call`: every catalogued SP-API operation.
- `amazon_raw_request`: any other SP-API path.

Your SP-API app's **roles** decide what Amazon allows. If a call returns 403 `Unauthorized`, add the matching role (Pricing, Inventory and Order Tracking, Amazon Fulfillment, Product Listing, Finance and Accounting, Brand Analytics…) to the app in Seller Central, then re-authorize to get a new refresh token.

## Other channels (9Yard etc.)

Set the `CHANNELS_JSON` secret to a JSON object, one entry per API:

```json
{
  "nineyard": {
    "description": "9Yard",
    "baseUrl": "https://API-BASE-URL-FROM-9YARD-DOCS",
    "auth": { "type": "bearer", "token": "YOUR_9YARD_API_KEY" },
    "docsUrl": "https://link-to-their-api-docs"
  }
}
```

`auth.type` can be `bearer`, `header` (`name`, `value`), `basic` (`username`, `password`), `query` (`name`, `value`), `oauth2_client_credentials` (`tokenUrl`, `clientId`, `clientSecret`, `scope`) or `none`. Requests can only go to that channel's host, so a key can't leak elsewhere. When you send me the 9Yard API docs I'll add dedicated tools (orders, listings, inventory sync) on top of this.

## Safety notes

- Tools that change things (prices, listings, shipments, feeds, channel writes) say in their descriptions that the assistant must confirm with you first. Inbound placement and transport confirmations cost money.
- To rotate a secret: `npx wrangler secret put MCP_SECRET` (then update the URL in your apps) or `BRIDGE_TOKEN` (then update `config.json`).

## Local testing

```bash
cd worker && printf 'MCP_SECRET=local-secret-0123456789\nBRIDGE_TOKEN=local-bridge-0123456789\n' > .dev.vars && npx wrangler dev
```

Then point the bridge `config.json` at `http://localhost:8787` with the same `BRIDGE_TOKEN`.
