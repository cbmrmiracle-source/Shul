# Amazon Review Requester

A Cloudflare Worker that automatically sends Amazon's official **Request a Review** email for
every shipped order of the products (ASINs) you select, a set number of days after purchase,
and tracks whether it is working.

Live dashboard: https://review-requester.cb-mrmiracle.workers.dev

## How it works

Every 5 minutes (Cron Trigger) the Worker:

1. **Syncs orders.** Requests the `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL`
   report (first run: last 30 days, in 5-day chunks; then hourly) and stores orders and
   items in a SQLite Durable Object. No names, emails or addresses are stored, only state/country.
2. **Plans.** Every non-cancelled order containing a selected ASIN gets a send date:
   `purchase date + delay` (global delay, or a per-ASIN override, 5 to 30 days).
3. **Sends.** Up to 40 due orders per run via the Solicitations API
   (`createProductReviewAndSellerFeedbackSolicitation`, 1 request/second).
   * Accepted: `sent`
   * Not eligible yet: retried daily (up to 4 times, while under 30 days old)
   * Already requested / returned / outside the window: recorded with Amazon's reason
4. **Collects customer feedback.** Weekly snapshot of Amazon Customer Feedback review topics
   (what reviewers like and dislike, with quotes) for each selected ASIN.

Each order is only ever requested once.

## Dashboard

* **Overview**: sent, queued, coverage (sent ÷ orders of selected ASINs), acceptance rate, daily chart, upcoming sends, activity log
* **Products**: search, filter, select all / bulk enable / disable, per-ASIN delay, paste ASINs
* **Requests**: every order with status and Amazon's response, CSV export
* **Customer insights**: AOV, units per order, B2B share, top states, weekdays, request outcomes, review topics and trends
* **Settings**: on/off switch, delay days, skip B2B orders, start date

> The Request a Review email is a fixed Amazon template. Amazon does not allow custom text
> through this API. You control which products, timing and which orders are included.

## Connecting Amazon (required once)

Add **one** of these as a Worker secret (Cloudflare dashboard, then Workers & Pages,
then review-requester, then Settings, then Variables and Secrets, then Add, type *Secret*):

**Option A (easiest):** reuse the Amazon login already in your `commerce-mcp` Worker.

| Name | Value |
|---|---|
| `COMMERCE_MCP_SECRET` | the secret at the end of your commerce-mcp connector URL (`.../mcp/<this part>`) |

**Option B:** your SP-API app credentials directly.

| Name | Value |
|---|---|
| `LWA_CLIENT_ID` | SP-API app client ID |
| `LWA_CLIENT_SECRET` | SP-API app client secret |
| `SP_REFRESH_TOKEN` | the seller authorization refresh token |

`ADMIN_PASSWORD` (dashboard login) is already set.

## Deploy

```bash
npm install
npx wrangler deploy
```
