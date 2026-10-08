# Shul Communications

Weekly content management and publishing for Chabad of Inverrary: enter information once,
choose where it appears, and generate the email, print newsletter, posters and WhatsApp images
from the same source.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and roadmap.

## Status

| Phase | | |
|---|---|---|
| 0 — Foundation | ✅ | Next.js app, PostgreSQL + migrations, single-user login, settings |
| 1 — Calendar & davening | ✅ | Parsha, Hebrew dates, holidays, zmanim; davening profiles with rules; per-week overrides |
| 2 — Content core | ✅ | Content items for every type, per-publication placement & wording, recurring items, images, review status, placement grid |
| 7 — Yahrzeits & birthdays | ✅ (paste-in) | Paste the spreadsheet; each week lists matches for review |
| 3 — Render engine | ⏳ next | Davening poster + WhatsApp images |

## Running locally

Requires Node 22 and PostgreSQL 16.

```bash
cp .env.example .env          # then set APP_PASSWORD and SESSION_SECRET
npm install
npm run db:migrate            # create tables
npm run db:seed               # shul settings + "Summer 5786" davening profile
npm run dev                   # http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                                            # unit tests
TEST_DATABASE_URL=postgres://…/shul_test npm test   # + database tests (the database is wiped)
```

## How davening times work

- A **davening profile** (Summer, Winter, …) holds one rule per row: a fixed time, a zman ± minutes,
  another row ± minutes (e.g. Shiur = Mincha − 60), or text such as "B'zman".
- Opening a week evaluates the rules against that week's zmanim. These are **AUTO** values.
- Typing a time on the week screen stores an **OVERRIDE** next to the auto value. Recalculating never
  touches overrides, and rows that depend on an overridden row follow it.
- Zmanim are computed locally (Hebcal) using Chabad's opinions: Alter Rebbe zmanim, candle lighting
  18 minutes before shkiah, Shabbos ends at 8.5°. All are adjustable in Settings.

## How content works

- Every item (sponsor, event, mazal tov, custom block…) has **placement chips**: one per publication.
  Click to include or exclude. In the editor, "Customize for …" sets a shorter title/text per publication.
- Shiurim, kids programs, the Eruv and custom blocks can **repeat every week** until a date; *Hide* skips one week.
- **Yahrzeits & Birthdays**: paste the sheet (with its heading row) on that page. Columns are matched
  automatically and remembered. Pasting replaces the list. Each week then adds everyone whose Hebrew date falls
  Shabbos–Friday as **needs review**. Approved or edited items are never removed by a later paste.
- Images are stored under `UPLOAD_DIR` (default `./uploads`) and only served to the signed-in user.

## Project layout

```
src/lib/calendar/   Hebrew calendar, parsha, zmanim (pure functions, unit tested)
src/lib/schedule/   davening rule engine
src/lib/weeks.ts    week service: create, sync (never overwrites overrides)
src/lib/content/    content types registry and content service
src/lib/people/     spreadsheet paste parsing and yahrzeit/birthday lists
src/db/             Drizzle schema and client; migrations live in drizzle/
src/app/            pages and server actions
```

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`.
