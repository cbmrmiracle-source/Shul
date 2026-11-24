# Indian Craft Supply CRM

A customer relationship management system for a wholesale jute, burlap and cotton business. It runs entirely on Cloudflare: a Worker serves the app, and a Durable Object holds the SQLite database. The front-end files in `public/` are bundled into the Worker, so there is no separate asset upload.

Live: https://ics-crm.cb-mrmiracle.workers.dev

## What's inside

| Area | Features |
|---|---|
| **Customers** | Contact profiles (leads → prospects → customers), companies/accounts, products of interest, ratings, lead source & score, tags, owners, CSV import/export, bulk actions, global search |
| **Relationships** | Link people and companies (reports to, referred by, decision maker, distributor for, parent company…), interactive network map |
| **Sales** | Drag-and-drop pipeline (Lead → Qualified → Sample Sent → Quote Sent → Negotiation → Won/Lost), deals with product line items from the catalog, one-click emailed quotes, lost-reason tracking, stage history |
| **Activities & tasks** | Log calls, emails, meetings, WhatsApp, visits, samples and orders; follow-up tasks with due dates, priorities and assignment; complete timeline per contact, company and deal |
| **Forecast** | Monthly commit / weighted / best-case forecast vs. target, 12-month won history, run rate, forecast by stage, salesperson and product category, overdue deals |
| **Gmail inboxes** | Each user connects their own Gmail (Google sign-in) and gets a private inbox in the CRM, synced every 10 minutes. When sending, pick which account it comes from. Accounts can be shared with the team (e.g. a sales@ address). Emails with saved contacts are logged on their timeline; unknown senders can be added as contacts in one click |
| **Email design** | Three styles: personal letter, branded (logo header/footer) and full designs. Five ready-made designs (new arrivals, price list, promotion, sample kit, newsletter) in your brand color, image upload/hosting, buttons, colors, live desktop/phone preview, paste-your-own HTML |
| **Tracking** | Opens, link clicks, replies (detected in the sending Gmail) and bounces, for one-to-one emails and campaigns. Email tracking page with live activity feed and most-engaged contacts; badges on every timeline entry |
| **Marketing** | Email campaigns sent from a chosen Gmail or company account, with audience builder (type, rating, products, industry, tags, source, country, owner, last-contacted), templates, test sends, unsubscribe handling, “follow up non-openers” |
| **Customer service** | Tickets with categories, priorities, SLA due times, assignment, conversation thread, internal notes, emailed replies, satisfaction score |
| **Analytics** | Win rate, deal size, sales cycle, funnel, lead sources, activity mix, lost reasons, team leaderboard, top customers, best-selling products, ticket SLA & CSAT, campaign performance |
| **Admin** | You (admin) create every user with a temporary password; they must change it at first sign-in. Roles: admin, manager, sales, support, viewer. Reset passwords, deactivate users, audit log of every change |

## Security

- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations), and each password has its own random salt.
- Sessions are random 256-bit tokens. Only a hash of each token is stored. The session cookie is `HttpOnly`, `Secure` and `SameSite=Strict`, and it expires after 14 days of inactivity.
- Login is locked for 15 minutes after 8 failed attempts.
- Cross-site requests can't change data: writes require JSON and a matching `Origin`.
- There is no default account. The first person to open a fresh install creates the admin account. If the `SETUP_CODE` secret is set, they must also enter that code.

## Deploy

```bash
cd crm
npm install
npx wrangler login            # or set CLOUDFLARE_API_TOKEN
npx wrangler deploy --var SETUP_CODE:CHOOSE-A-CODE   # the code is required to create the admin account
```

Open the URL Wrangler prints, then create your admin account using that code. After the admin account exists, the setup page is closed for good, so later deploys don't need `--var`.

### Connect Gmail (one-time, admin)

**Settings → Gmail** in the CRM walks you through this step by step:

1. Create a Google Cloud project, then enable the **Gmail API**.
2. Under **Google Auth Platform**, set up the app. Add the scopes `gmail.send` and `gmail.readonly`.
3. Create an OAuth client of type **Web application**. Set its redirect URI to `https://<your-crm>/api/gmail/callback`. Settings shows the exact URI with a copy button.
4. Paste the Client ID and Client secret into Settings.
5. **Publish** the app. Apps left in "Testing" are disconnected by Google every 7 days. Users will see an "unverified app" screen; they click *Advanced → Go to …* to continue. If you use Google Workspace, choose *Internal* instead and you won't see that screen.

After that, each user opens **Inbox → Connect Gmail**. Gmail allows about 500 emails a day per account, or 2,000 with Workspace.

### Optional: company sending via Resend

This is for campaigns larger than Gmail's daily limit. Create a [resend.com](https://resend.com) account, verify your domain, then paste the API key and *From* address into **Settings → Email** (or run `npx wrangler secret put RESEND_API_KEY`). It then appears as an extra *From* option.

### Receive email (optional, Cloudflare Email Routing)

1. In the Cloudflare dashboard, open your domain → **Email → Email Routing** and enable it.
2. Create a routing rule for an address such as `crm@yourdomain.com`, with the action **Send to a Worker** → `ics-crm`.
3. In CRM Settings, use that address as the *Reply-to*. Optionally, set a *Support address* so that new mail to it opens tickets.
4. Optional: to also receive copies in a normal inbox, run `npx wrangler secret put FORWARD_TO`. The address must be a verified Email Routing destination.

## Develop & test

```bash
npx wrangler dev          # http://localhost:8787
npm test                  # API smoke test against the dev server (use a fresh .wrangler/state)
```

To test Gmail without a real Google account, run `node test/mock-google.mjs` and create `.dev.vars` with the following:

```
GMAIL_API_BASE=http://127.0.0.1:9900
GOOGLE_TOKEN_URL=http://127.0.0.1:9900/token
GOOGLE_AUTH_URL=http://127.0.0.1:9900/auth
OPEN_GRACE_MS=0
```

Then run `node test/gmail.mjs` against a fresh dev server.

The front end is plain JavaScript with no build step: `public/js/*.js` and `public/app.css`. The back end is `src/index.js` (API and data), plus `src/mail.js` (Gmail, sending, layouts, tracking and inbox sync). The database schema is created automatically the first time the database starts.

## Backups

All data lives in one Durable Object called `main`, and Cloudflare stores it durably. Use the **Export** buttons on Contacts, Companies and Products for spreadsheet copies.
