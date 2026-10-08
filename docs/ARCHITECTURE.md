# Shul Communications Platform — Architecture Proposal

**Status:** APPROVED (Oct 8, 2026). Phases 0–6 and the paste-in part of 7 are built. See "Decisions" below.
**Reference week:** Parshas Ki Savo 5786 (Shabbos 16 Elul / Aug 29, 2026)


## Decisions (Oct 8, 2026)

| Topic | Decision |
|---|---|
| Users | Just the communications director, so login is **one password** (`APP_PASSWORD`) rather than Google sign-in. Roles can be added later |
| Zmanim | Chabad.org's regular opinion: Alter Rebbe zmanim, candle lighting 18 min before shkiah, Shabbos ends at 8.5°. Computed locally for the shul's coordinates. Verified against the Ki Savo sample: 7:27PM candle lighting, 8:18PM Shabbos ends, 8:06PM Sunday Maariv (6° tzeis) |
| Chabad.org articles | Paste-the-source: the director pastes the Parsha / Jewish History text, and the AI rewrites it |
| Budget | $15–25/month hosting is acceptable |
| WhatsApp images | `Weeklys.pdf` pages 5–6 are treated as the Weekly and Shabbos WhatsApp images |
| Yahrzeits sheet | `https://docs.google.com/spreadsheets/d/1_YLvoMIp1YxPuQvhptD8MlfzvUlZnx-VlklVpoYZd6E` |
| Birthdays sheet | `https://docs.google.com/spreadsheets/d/1DP49PNV6viOC4VtQmwNUxeJhb0VufBddSbWsX4L2ms8` |

| Yahrzeit/birthday input | **Paste-in instead of a live Google Sheets connection** (director's choice). Copy the sheet, paste it on the Yahrzeits & Birthdays page, confirm the column matching once (it's remembered) |
| Templates | Plain TypeScript functions using a small auto-escaping `html` helper (Next.js blocks `react-dom/server` in route handlers). Rendered to PNG/PDF by headless Chromium with bundled fonts |
| Email images | Uploaded images are served at public, unguessable `/media/<uuid>` links so the pasted email works in Mailchimp and inboxes; everything else stays behind the login. Phase 9 can upload to Mailchimp's file manager instead |
| Content types | Defined in code (`src/lib/content/types.ts`) rather than a database table, so each type's form and template stay in sync. New ad-hoc blocks use the **Custom Block** type, which needs no developer |

> The two sheet URLs above are given in the order provided. Phase 7 will confirm which is which,
> and the column layout, by reading the header rows. The simplest connection is for each sheet to
> be shared as "Anyone with the link can view". The app then reads it as CSV with no Google account
> setup. A Google service account is the alternative if the sheets must stay private.

---

## 0. The core idea in one paragraph

You enter each piece of information **once**, as a *content item*. Every content item has a
**placement list**: the publications it goes in. Each publication (Email, Print Newsletter,
Davening Poster, Shabbos WhatsApp, …) is a **template**. A template is a layout with named
**slots** ("schedule", "sponsor", "events", …), and each slot knows how to render a content
type *in that publication's style*. Generating a publication means: take this week's items,
filter by placement, sort them, and render through the template. The output is HTML for
Mailchimp, a PDF for print, or PNGs for posters and WhatsApp.

Publications, content types, and custom blocks are **data, not code**. You can add a new
custom block or turn a block on or off for a publication without a developer.

---

## 1. What I found in your sample files

| File | What it is | Notes |
|---|---|---|
| `HTML` | Mailchimp email, 600px, table layout | Black header, gold divider, gold pill buttons, alternating white/#fafafa sections, emoji section icons |
| `Ki_Savo.pdf` / `.pub` | 2-page Letter newsletter, "The Shabbos Connection" | Navy gradient header, gold bar, cream background, rounded cards with a navy top border, icon and bold navy heading on each card |
| `NEWSLETTER_TEMPLATES.pub` | Library of newsletter blocks | Also contains **Haftorah in a Nutshell**, **Rosh Chodesh / Molad**, **Shabbos Hachana**, and a **Parsha Riddle** block (answer printed upside down at the foot of page 2) |
| `Weeklys.pdf` p1 | Kids "שבת Programming" poster | Colored cards with illustrations; **"WE'RE BACK" / "NO PROGRAM"** status badges |
| `Weeklys.pdf` p2 | Shiur in Likutei Sichos poster | Big time ("6:25PM") on parchment/candle background |
| `Weeklys.pdf` p3 | Farbrengen poster | Sponsor text over a fixed photo background |
| `Weeklys.pdf` p4 | Weekly Schedule poster | **Same layout as the schedule card on newsletter page 1** |
| `Weeklys.pdf` p5 | "This Week's Minyanim" square | I assume this is the **Weekly WhatsApp** image |
| `Weeklys.pdf` p6 | "שבת פרשת כי תבוא" square, Friday Night / Shabbos Day, "The Eruv is Kosher" | I assume this is the **Shabbos WhatsApp** image |

> The separate "Shabbos WhatsApp" and "Weekly WhatsApp" files were not attached. I am treating
> Weeklys pages 5–6 as those images. Please correct me if that's wrong.

### Where the same information repeats (the duplicated work this removes)

| Information | Email | Newsletter | Posters | WhatsApp |
|---|:-:|:-:|:-:|:-:|
| Parsha name (Hebrew) + year | ✔ | ✔ | Kids, Shiur, Schedule | Shabbos |
| Candle lighting / Shabbos ends | ✔ | ✔ | Schedule | Shabbos |
| Shabbos davening times | ✔ | ✔ | Schedule | Shabbos |
| Weekday davening times | ✔ | ✔ | Schedule | Weekly |
| Shiur time | ✔ | ✔ | Shiur poster | Shabbos |
| Farbrengen sponsor | ✔ | ✔ | Farbrengen poster | — |
| Kids programs | image | text | Kids poster | — |
| Eruv status | ✔ | — | — | Shabbos |
| Birthdays / Yahrzeits / Mazal Tov | ✔ | ✔ | — | — |
| Community Calendar / Shana Tova card | long + buttons | short + URL | — | — |

The davening times alone are typed **5–6 times a week** today.

### Things the samples show the system must handle

1. **One item, different rendering per output.** Birthdays are grouped by Hebrew date in the
   email ("🎉16 Elul – …") and a flat bulleted list in print. Community Calendar is long with
   buttons in the email and three short lines in print. So each placement needs an optional
   **per-publication variant** (short title, short text, image or no image).
2. **Selection really differs per output.** The newsletter has a Mazal Tov (Posner) that the
   email doesn't. The email has Eruv and Community Resources blocks that print doesn't.
3. **Yahrzeits need both Hebrew and English names.** The email uses
   `יוסף חיים בן חנוך העניך הכהן`, the newsletter uses `Yosef Chaim Rosenfeld`.
4. **Mixed Hebrew/English (bidi) bugs.** The printed Yahrzeit line renders as
   `Avraham Bachar - , כ"א אלול התשפ"ד Father of…`. The punctuation is scrambled by right-to-left
   text. Generated output will wrap Hebrew in proper bidi isolation, which fixes this.
5. **Inconsistent labels.** "Shachris" vs "Shacharis", "Yartzeit" vs "Yahrzeit", "B'zman" vs
   "B'izmano", "Kabolas" vs "Kabolas Shabbos". A single label dictionary makes every output
   consistent.
6. **Kids programs have a status** (running / no program / we're back) that changes the poster
   badge.
7. **Print has a hard one-page-per-side limit.** Today you fix overflow by hand in Publisher.
   The system must **detect overflow** and tell you which card is too long.

---

## 2. Major components

```
┌───────────────────────────── Web App (browser) ───────────────────────────────┐
│  Week Dashboard  │  Content Editor  │  Review Queue  │  Previews  │  Settings  │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │
┌──────────────────────────────── Server ───────────────────────────────────────┐
│  1. Calendar Engine     Hebrew date, parsha, holidays, zmanim, molad (Hebcal)  │
│  2. Schedule Engine     davening times = rule + auto value + override          │
│  3. Content Store       content items, placements, variants, recurring items  │
│  4. Importers           Google Sheets (yahrzeits, birthdays), source text      │
│  5. AI Pipeline         Parsha / Haftorah / Jewish History rewrites + glossary │
│  6. Render Engine       templates → HTML / PDF / PNG (headless Chromium)       │
│  7. Publishers          Mailchimp API, file downloads, (later) WhatsApp share  │
│  8. Jobs                sync, render, AI calls run in the background           │
└───────────────┬──────────────────────────────┬────────────────────────────────┘
                │                              │
        PostgreSQL database             File storage (images, PDFs, PNGs)
```

---

## 3. Data sources: automatic, manual, editable

| Data | Source | Notes |
|---|---|---|
| Hebrew date, parsha, holidays, Rosh Chodesh, molad, fast days | **Automatic** (Hebcal, computed) | Overridable (e.g. combined parshiyos, Shabbos Mevorchim label) |
| Candle lighting, sunset, Shabbos ends, other zmanim | **Automatic** (computed for ZIP 33319) | See §6 on Chabad.org. Every value is overridable and an override is never overwritten by a re-sync |
| Davening times | **Rule-based + manual** | E.g. "Mincha = candle lighting + 8 min", "Maariv = Shabbos ends", or a fixed "7:30PM". Rules come from a **schedule profile** (Summer, Winter, Yom Tov), so most weeks need no typing |
| Yahrzeits, birthdays | **Automatic import** (Google Sheets) | Always arrive as *Pending review*. Editable and hideable. Manual additions allowed |
| Parsha in a Nutshell, Haftorah, Jewish History | **Source text + AI rewrite** | Always *Pending review*. Fully editable |
| Sponsor, events, Mazal Tov, shiurim, kids, Eruv, riddle, custom blocks | **Manual** | Can be **recurring** (carries over automatically until an end date) |
| Logo, colors, fonts, contact info, footer, address | **Settings** | Entered once |

**Everything is editable after generation.** Each field stores provenance (`auto` / `override` /
`manual` / `ai`). The UI shows a badge (AUTO 7:27PM → **OVERRIDE 7:30PM**). A *revert to
automatic* button is always there.

**Nothing auto-imported publishes without review.** Imported and AI items start as
`pending`. A publication shows a warning, and by default **won't finalize**, while any item
placed in it is still pending.

---

## 4. Proposed technology stack

Chosen for long-term maintainability by a small team (or one person plus an AI assistant).
That means one language end to end, mainstream libraries, and boring infrastructure.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language for UI, server, and templates. Types catch errors early |
| Web framework | **Next.js** (App Router) | UI and API in one app, large ecosystem, easy hosting |
| UI | React + Tailwind + shadcn/ui | Fast to build clean forms. Accessible components |
| Database | **PostgreSQL** | Relational data plus JSONB for flexible per-type fields |
| ORM / migrations | **Drizzle ORM** | Typed schema in code, plain SQL migrations kept in git |
| Validation | **Zod** | One schema per content type, shared by forms, API, and templates |
| Calendar | **@hebcal/core** (+ @hebcal/learning) | Hebrew dates, parsha (Diaspora), holidays, molad, zmanim. Runs locally, no API dependency |
| Templates | **React components** rendered to HTML | Email: table layout with CSS inlined by `juice` (Gmail/Outlook-safe). Print and posters: HTML/CSS |
| PDF / PNG | **Playwright (headless Chromium)** | Pixel-accurate PDF (Letter) and PNG (posters, 1080×1080 WhatsApp) from the same HTML |
| AI | **Claude API** (Anthropic) | Summarizing and rewriting with your glossary and style rules |
| Background jobs | **pg-boss** (queue inside Postgres) | No extra infrastructure. Retries for syncs, renders, and AI |
| File storage | S3-compatible (Cloudflare R2 or AWS S3) | Images, generated PDFs and PNGs |
| Auth | Single password + signed HTTP-only cookie (see Decisions) | One user. Can move to Auth.js later if more people need access |
| Hosting | One Docker container (Railway / Render / Fly.io) + managed Postgres | Playwright needs a real server, not serverless. About $10–25/month |
| Tests | Vitest (logic), Playwright (visual snapshots of each template) | Visual tests catch a template change that breaks the newsletter layout |

---

## 5. Database schema (proposed)

```
organization            id, name, logo_asset_id, address, zip (33319), lat, lon, timezone,
                        candle_lighting_offset_min, havdalah_rule, brand (colors/fonts JSON)

week                    id, shabbos_date (key), hebrew_date, parsha, parsha_hebrew,
                        holiday_flags JSON, overrides JSON, status (draft|review|final)

-- Davening ------------------------------------------------------------------------------
schedule_profile        id, name ("Summer 5786"), active_from, active_to
schedule_slot           id, profile_id, group (friday|shabbos|sunday|weekday), label_key,
                        rule JSON  -- {type:"fixed",time:"7:30PM"} | {type:"zman",zman:"candles",
                                   --  offset:8,round:"down5"} | {type:"text",value:"B'zman"}
                        sort_order
schedule_entry          id, week_id, slot_id?, group, label, auto_value, override_value,
                        display_value (computed), source (auto|rule|manual), sort_order, hidden
label_dictionary        key, english ("Shacharis"), hebrew, short

-- Content -------------------------------------------------------------------------------
content_type            id, key (sponsor|event|mazal_tov|shiur|kids_program|yahrzeit|birthday|
                        parsha_nutshell|haftorah|jewish_history|eruv|riddle|custom|…),
                        name, field_schema JSON, default_placements, icon
content_item            id, week_id (null if recurring), type_id, title, body (rich text JSON),
                        fields JSON (type-specific: speaker, location, start_at, hebrew_text…),
                        image_asset_id, link_url, cta_label, event_date, hebrew_date,
                        source (manual|import|ai|auto), source_ref,
                        review_status (pending|approved|rejected), publish (bool), sort_order,
                        recurring_from, recurring_until, created_by, updated_at
content_revision        id, content_item_id, snapshot JSON, changed_by, changed_at

-- Publications --------------------------------------------------------------------------
publication             id, key (email|newsletter|poster_davening|poster_farbrengen|
                        poster_kids|poster_sicha|whatsapp_shabbos|whatsapp_weekly|…),
                        name, format (email_html|pdf_letter|png), template_key, size, active
publication_slot        id, publication_id, key ("schedule","sponsor","events"…),
                        accepts_types [], max_items, sort_order
placement               id, content_item_id, publication_id, slot_key?, included (bool),
                        sort_order, variant JSON  -- {short_title, short_body, hide_image…}

publication_run         id, week_id, publication_id, status (draft|approved|sent),
                        rendered_asset_id, html_snapshot, overflow_report JSON,
                        mailchimp_campaign_id, approved_by, approved_at

-- Imports & AI --------------------------------------------------------------------------
person_date             id, kind (yahrzeit|birthday), external_key (sheet row id),
                        name_english, name_hebrew, relation ("Father of Roei Bachar"),
                        hebrew_day, hebrew_month, hebrew_year?, gregorian_date?,
                        active, last_synced_at, raw JSON
import_run              id, source, started_at, finished_at, rows_read, rows_changed, errors
source_document         id, week_id, kind (parsha|haftorah|history), url, raw_text, fetched_at
ai_generation           id, content_item_id, source_document_id, model, prompt_version,
                        output, glossary_version, created_at
glossary_term           id, from ("Moses"), to ("Moshe"), case_sensitive, notes, active

asset                   id, storage_key, mime, width, height, alt, uploaded_by
user                    id, email, name, role (admin|editor)
audit_log               id, user_id, action, entity, entity_id, diff JSON, at
```

Key design decisions:
- **Yahrzeits and birthdays sync into `person_date`** (the master list). The week view then
  *generates* `content_item`s for the matching ones. Your edits to a week's item (spelling,
  hide) are kept separate from the master. You can choose "also fix it in the master list".
- **Overrides live beside auto values**, never in place of them, so re-syncing is always safe.
- **Recurring items** (kids programs, weekly shiur, Community Calendar ad) live once with a
  date range. They appear every week until they expire, with a per-week hide.
- **`fields` JSON + a Zod schema per content type** let us add a new content type without a
  database migration. Custom blocks use the generic `custom` type.

---

## 6. Technical and legal limitations (please read)

1. **Chabad.org has no public API, and its terms of use restrict copying and automated
   scraping.**
   - **Zmanim and candle lighting:** I recommend **computing them locally** (Hebcal / the
     KosherZmanim algorithms) for 33319. We configure them to match Chabad.org's conventions
     (18-minute candle lighting, and its Shabbos-ends opinion). For the first few weeks we
     check them against Chabad.org side by side. The numbers are astronomical facts, not
     Chabad.org content, so there's no legal issue and nothing breaks if their site changes.
   - **Parsha in a Nutshell / Jewish History:** These are copyrighted Chabad.org articles. The
     safest design: **you paste in the source text (or give its URL)**, and the AI produces a
     substantially rewritten, shortened version. A one-click fetch of a URL *you* supply can
     be a convenience feature. Treat it as fragile and possibly against Chabad.org's terms. I
     won't build an automatic crawler. Optionally we can use **Sefaria's open API** (actual
     Torah text, openly licensed) as a grounding source for the AI.
2. **Microsoft Publisher files can't be generated.** `.pub` is a closed format, and Microsoft is
   retiring Publisher in October 2026. The newsletter and posters will be **rebuilt as HTML/CSS
   templates** that match your current designs, and output as **print-ready PDF**. Background
   art (the parchment, the farbrengen table, the kids illustrations) will be exported once as
   images and reused.
3. **Fonts.** The templates use Rockwell Extra Bold, Bahnschrift, Aptos and Aharoni. Some of
   these are Microsoft-licensed and may not be embeddable on a server. We'll either upload
   your licensed font files or pick close web-font matches (e.g. Roboto Slab for Rockwell,
   Frank Ruhl Libre or Heebo for Hebrew).
4. **One-page print fit.** Content length varies week to week. The renderer measures every
   card. If a side overflows, it reports which card and by how much, and offers to shrink fonts
   within limits, swap in the short variant, or drop low-priority items. Fully automatic
   "perfect" fitting isn't realistic. Previewing and adjusting will stay a human step.
5. **Mailchimp.** The Marketing API *can* create a campaign, set its HTML, upload images and
   PDFs to the Mailchimp file manager, send a test email, and schedule or send. Your current
   copy-paste step becomes a "Push to Mailchimp (draft)" button. Sending stays a deliberate
   click.
6. **WhatsApp.** Sending images automatically to groups isn't supported by WhatsApp's official
   API (it's for business-to-customer messaging, not groups or communities). The app will
   produce the PNG and caption text, with **Download** and, on a phone, a **Share** button that
   opens WhatsApp directly.
7. **Hebrew calendar edge cases** for yahrzeits and birthdays: Adar in leap years, 30 Cheshvan
   or Kislev in short years, and *aveilus* custom (first-year yahrzeit). These are handled by
   Hebcal's rules and are configurable. They'll have unit tests.
8. **Email client limits.** Gradients, border-radius and `<style>` blocks aren't supported
   everywhere (mostly Outlook). We inline the CSS and keep solid-color fallbacks so it degrades
   gracefully.
9. **AI accuracy.** The AI is told to use only facts in the source. Each output is shown next
   to its source for review, and the glossary is applied and checked after generation.
   It is still a draft that needs your review, and the workflow enforces that.

---

## 7. Proposed weekly workflow

| When | You do | The system does |
|---|---|---|
| **Sun / Mon** | Click **"Start week of Ki Savo"** (or pick a date on the calendar) | Creates the week. Fills parsha, Hebrew/Gregorian dates, zmanim, davening times from the active profile, recurring items, yahrzeits and birthdays for the week (pending) |
| **Mon – Wed** | Add sponsor, events, Mazal Tovs, shiurim, kids updates. Paste or confirm the parsha and history sources | Runs the AI rewrites in the background and flags them as pending review |
| **Wed / Thu** | Open the **Review Queue**: approve, edit or hide each auto/AI item. Tick placements | Shows one checklist of what's left: "3 pending, 1 overflow in Newsletter side 2" |
| **Thu** | Open **Previews**: all 8 outputs side by side. Fix overflow. Approve each | Renders PDF and PNGs and stores a snapshot of each |
| **Thu / Fri** | **Push to Mailchimp** → test email → schedule. Download the print PDF. Share the WhatsApp images | Uploads the printable PDF to Mailchimp and links it from the email automatically |

The week dashboard is one screen: the date header at the top, then collapsible category
sections. Every item row shows **[source badge] [review status] Title … ☑Email ☑Print ☑Poster
☑WhatsApp**, with a grid for bulk-ticking placements.

---

## 8. Development phases

Each phase ends with something you can actually use, so you get value long before it's
"finished".

| Phase | Scope | You can now… |
|---|---|---|
| **0 — Foundation** | Repo, database, migrations, auth, deployment, settings (org, logo, ZIP), CI | Log in to a hosted app |
| **1 — Calendar & Davening** | Calendar engine, week creation, zmanim, schedule profiles and rules, override UI | Create a week and see correct times with AUTO/OVERRIDE badges |
| **2 — Content core** | Content types, content items, placements and variants, recurring items, images, review status, custom blocks | Enter all of a week's content in one place |
| **3 — Render engine + first outputs** | Template system, Playwright rendering, **Weekly Schedule poster** and **Weekly/Shabbos WhatsApp** images | Stop typing davening times. Get 3 outputs automatically |
| **4 — Email** | Email template matching your HTML, preview, copy-HTML button | Paste generated HTML into Mailchimp |
| **5 — Print newsletter** | Two-sided Letter template, overflow detection and fit tools | Print The Shabbos Connection from the app |
| **6 — Remaining posters** | Farbrengen, Kids (with status badges), Sicha Shiur | All 8 outputs generated |
| **7 — Google Sheets** | Yahrzeit and birthday sync, matching for the week, review UI | Stop copying names from the sheet |
| **8 — AI content** | Parsha, Haftorah, Jewish History, glossary manager, side-by-side review | Get first drafts of the long text sections |
| **9 — Mailchimp integration** | API connection, push draft, test send, schedule, upload PDF | One-click email |
| **10 — Polish** | History, duplicate last week, template settings UI, multiple users and roles, backups | Long-term operation |

Phases 3–6 could be reordered if a particular output is the most painful today.

---

## 9. Open questions for you

1. **Your message was cut off** in section 18 (Email Newsletter), right after
   "Create HTML → copy/paste into Mailchimp →". Please send the rest. There may be more
   sections (print, posters, WhatsApp, users…) I haven't seen.
2. **Google Sheet URLs and column layout** for yahrzeits and birthdays: which columns hold
   the English name, Hebrew name, Hebrew date, and relation? Are birthdays by Hebrew date
   (as in the samples)?
3. **Week window**: which days count for "this week's" yahrzeits and birthdays? The sample
   uses Shabbos through Friday (16–22 Elul).
4. **Shabbos-ends opinion**: what does the shul use (e.g. the Chabad.org time, a fixed minutes
   offset, 8.5°)?
5. Is it OK to use the **paste-the-source approach** for Chabad.org text (§6.1)?
6. **Hosting / budget**: is about $15–25/month for hosting plus AI usage acceptable? Do you
   want the Mailchimp and Claude API keys under the shul's accounts?
7. **Users**: only you, or also helpers or the Rabbi (approve-only)?
8. Are Weeklys **pages 5–6 the WhatsApp images**?
9. **Fonts**: do you have the font files, or should I pick close web-font matches?
10. Should the **Parsha Riddle**, **Haftorah in a Nutshell**, **Rosh Chodesh / Molad**,
    **Eruv**, and **Community Resources** blocks be standard content types? (They appear in
    your templates and email.)

Once you approve this (with any changes), I'll start Phase 0.
