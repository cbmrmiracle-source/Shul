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
| **Marketing** | Email campaigns with audience builder (type, rating, products, industry, tags, source, country, owner, last-contacted), merge fields, templates, test sends, open & click tracking, unsubscribe handling, “follow up non-openers” |
| **Email** | Send one-to-one email from any contact, deal or ticket (logged automatically, opens tracked). Optional inbound: replies are logged on the contact's timeline, unknown senders become leads, `[Ticket #N]` replies go to the ticket, mail to the support address opens a ticket |
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

### Connect email sending (Resend)

1. Create an account at [resend.com](https://resend.com). The free plan allows 3,000 emails a month.
2. Add and verify your business domain in Resend, using the DNS records it gives you.
3. Create an API key, then paste it into **Settings → Email** in the CRM. Alternatively, run `npx wrangler secret put RESEND_API_KEY`.
4. Set the *From* address (for example `sales@yourdomain.com`), then click **Send test email**.

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

The front end is plain JavaScript with no build step: `public/js/*.js` and `public/app.css`. The whole back end is in `src/index.js`. The database schema is created automatically the first time the database starts.

## Backups

All data lives in one Durable Object called `main`, and Cloudflare stores it durably. Use the **Export** buttons on Contacts, Companies and Products for spreadsheet copies.
