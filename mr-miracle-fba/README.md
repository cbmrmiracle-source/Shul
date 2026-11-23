# Mr Miracle FBA System

Password-protected FBA dashboard on Cloudflare Workers that pulls data directly from Amazon (SP-API).

**Live:** https://mr-miracle-fba.cb-mrmiracle.workers.dev

| Module | What it does |
|---|---|
| Dashboard | Yesterday / 7 / 14 / 30-day sales, month-to-date, last month, month trajectory, 12-month chart, top products, alerts |
| Sales analysis | Units and $ for all products or selected SKUs/ASINs over any period, by day/week/month, estimated profit |
| Price vs sales | Every price change per product (detected from actual order prices + changes made here) with units/day and sales/day before vs. after, % change, elasticity |
| Daily grid | Day-by-day units / sales / price grid (like the "2_months" sheet), price changes highlighted |
| Compare periods | Range 1 vs Range 2: units, sales, profit, changes, days of stock (like the "Comparison" sheet) |
| Repricer | Non–Mr Miracle products, every 15 min, rules (match/beat Buy Box, beat lowest FBA/lowest, ignore FBM/Amazon/low-feedback sellers, raise when winning, max when alone), min/max per SKU, test mode, bulk edit, activity log |
| Mr Miracle pricing | Manual price changes without rules — one or many at once (set, ±$, ±%, match Buy Box, paste a SKU,price list), review screen, push queue |
| FBA fee changes | Daily snapshot of Amazon's fee preview report; flags dimension/weight/size-tier changes (old vs new dims), low-inventory-level fee changes, price-band and rate changes; dashboard + customizable daily email |
| Seller count | Watch chosen ASINs (every 30 min by default), email when the number of sellers changes, history + current offers |
| Inventory status | Same columns and formulas as the "FBA Inventory Status" sheet (weighted 30-day average, days of stock, qty to ship with min/alert/max/send/forecast rules) |
| Image updates | Pick a product, upload or link new images per slot (main, 1–8, swatch), push to Amazon, see Amazon's response |
| Users | Admin / Manager / Viewer roles, password sign-in, audit trail |

## How it works

- **Worker** (`src/index.ts`) serves the dashboard (embedded from `public/`) and forwards `/api/*` to one **Durable Object** (`src/store.ts`) that holds all data in SQLite.
- The Durable Object's **alarm** runs the scheduler (every 10–60 s); a 5-minute cron keeps it alive.
- **Amazon access** goes through the existing `commerce-mcp` Worker via a service binding (the same way `review-requester` works). It needs that Worker's MCP secret, entered once in *Settings → Connections* (or as the Worker secret `COMMERCE_MCP_SECRET`). Direct SP-API app credentials (`LWA_CLIENT_ID`, `LWA_CLIENT_SECRET`, `SP_REFRESH_TOKEN`) also work if added as Worker secrets.
- **Email** via Gmail (App Password) or Resend, entered in *Settings → Connections*.
- Uploaded images live in KV (`IMAGES`) at `/img/<id>` so Amazon can fetch them.

### Data sources

| Data | Amazon source | Schedule |
|---|---|---|
| Daily sales per SKU (units, $, avg price) | `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL` (30-day windows, 2-year backfill) | hourly (last 3 days), daily (last 3 weeks) |
| Products | `GET_MERCHANT_LISTINGS_ALL_DATA` + Catalog Items (images, brand) | 12 h / 6 h |
| Inventory | FBA Inventory API (`/fba/inventory/v1/summaries`) | hourly |
| Fees & dimensions | `GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA` | daily |
| Low-inventory-level fee | `GET_FBA_INVENTORY_PLANNING_DATA` | daily |
| Buy Box / offers / seller count | `getItemOffersBatch` (20 ASINs per call, ~1 call / 10 s) | 15 min (repricer), 30 min (sellers) |
| Price & image changes | Listings Items API `patchListingsItem` | on demand |

Sales days use Amazon's Pacific time, like Seller Central.

## Develop & deploy

```bash
npm install
echo "SETUP_CODE=local-test-code" > .dev.vars
npm run dev          # http://localhost:8787
npm run check        # TypeScript
npm run deploy       # embeds public/ and deploys
```

Tests for report parsing, fee-change detection, analytics and repricer decisions run against real report files:

```bash
npx esbuild test/entry.ts --bundle --format=esm --platform=node --alias:cloudflare:sockets=./test/stub-sockets.mjs --outfile=test/.bundle.mjs
node test/harness.mjs <folder with orders.tsv, fees.tsv, planning.tsv>
```

## First-time setup

1. Open the site and create the admin account with the one-time **setup code** (Worker secret `SETUP_CODE`).
2. *Settings → Connections*: paste the commerce-mcp secret → **Test connection**.
3. *Settings → Connections*: add Gmail + App Password (or Resend) and your alert email → **Send test email**.
4. The system then loads products, inventory, fees and 2 years of sales history automatically (the history backfill takes a few hours).
5. *Settings → Products & costs*: check which products are Mr Miracle, and import unit costs for profit numbers.
6. *Repricer*: set min/max and a rule per product, watch the log in **test mode**, then switch it on.
