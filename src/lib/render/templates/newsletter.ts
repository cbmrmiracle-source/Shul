import type { DayInfo } from "@/lib/calendar/week";
import type { RenderData, RenderItem, ScheduleRow } from "../data";
import { bidi, formatInline, formatText, html, type HtmlValue, type SafeHtml } from "../html";
import { BH, COLORS, emoji } from "./shared";

/**
 * "The Shabbos Connection": one Letter sheet, printed double-sided.
 * Follows the Ki Savo 5786 PDF and the block library in NEWSLETTER_TEMPLATES.pub.
 *
 * Page 1: Weekly Schedule + Kids Corner | Farbrengen, Events, Birthdays, Mazal Tov, Yahrzeits
 * Page 2: Parsha, Haftorah, Calendar, Shiurim, Riddle, Community | Week in Jewish History
 *
 * Each column shrinks to fit (and is flagged) when there is too much content.
 */
export const WIDTH = 816;
export const HEIGHT = 1056;
export const PAGES = 2;

export const css = `
.page { background: #f7f1e3; }
.hdr { position: relative; height: 128px; color: #fff; text-align: center;
  background: linear-gradient(180deg, #3d6690 0%, ${COLORS.navy} 100%); }
.hdr .logo { position: absolute; left: 26px; top: 20px; width: 78px; filter: brightness(0) invert(1); }
.hdr .bh { color: ${COLORS.goldLight}; font-size: 16px; top: 10px; right: 20px; }
.hdr .org { padding-top: 16px; font: 700 18px/1 'Heebo'; letter-spacing: 1.5px; color: ${COLORS.goldLight}; }
.hdr h1 { margin: 6px 0 4px; font: 800 38px/1 'Roboto Slab', serif; letter-spacing: .3px; }
.hdr .parsha { font: 700 24px/1.1 'Frank Ruhl Libre', serif; color: ${COLORS.goldLight}; }
.goldbar { height: 9px; background: linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLight}, ${COLORS.gold}); }

.cols { position: absolute; left: 16px; right: 16px; display: flex; gap: 14px; }
.p1 .cols { top: 151px; bottom: 14px; }
.p2 .cols { top: 14px; bottom: 26px; }
.col { min-width: 0; overflow: hidden; }
.col > div { display: flex; flex-direction: column; gap: 10px; min-height: 100%; }
.col > div > .card:last-child { flex-grow: 1; }
.c-left { flex: 0 0 47%; } .c-right { flex: 1; }

.card { background: #fff; border: 1.5px solid #222; border-top: 6px solid ${COLORS.navy}; border-radius: 8px;
  padding: 8px 12px 10px; font: 400 12.2px/1.4 'Heebo'; color: #1c1917; }
.card h2 { margin: 0 0 5px; font: 800 20px/1.2 'Roboto Slab', serif; color: ${COLORS.navy}; }
.card h2 .emoji { width: 19px; height: 19px; margin-right: 6px; vertical-align: -2px; }
.card p { margin: 0 0 5px; }
.card p:last-child { margin-bottom: 0; }
.sub { color: ${COLORS.navy}; text-decoration: underline; text-underline-offset: 2px; }
.item { margin-bottom: 9px; } .item:last-child { margin-bottom: 0; }
.b { font-weight: 700; }
.muted { color: #555; }
.center { text-align: center; }
.he { font-family: 'Frank Ruhl Libre', serif; font-weight: 700; }

.sched h3 { margin: 7px 0 1px; font: 700 13px/1.3 'Libre Baskerville', serif; color: ${COLORS.navy};
  text-decoration: underline; text-underline-offset: 2px; }
.sched h3:first-of-type { margin-top: 0; }
.sched .r { display: flex; justify-content: space-between; gap: 10px; font: 400 12.6px/1.72 'Libre Baskerville', serif; }
.sched .r .t { white-space: nowrap; }
.sched .n { margin: -3px 0 1px 12px; font: italic 400 10.5px/1.25 'Libre Baskerville', serif; color: #555; }

.history .day { margin: 8px 0 2px; font: 400 15px/1.2 'Heebo'; color: ${COLORS.navy}; text-decoration: underline; text-underline-offset: 2px; }
.history .day:first-of-type { margin-top: 0; }
.history .ev { margin-bottom: 7px; font-size: 11.4px; line-height: 1.36; }
.history .ev .b { font-size: 11.8px; }

.answer { position: absolute; left: 16px; right: 16px; bottom: 6px; transform: rotate(180deg);
  text-align: center; font: italic 400 8.5px/1.2 'Heebo'; color: #444; }
`;

function card(icon: string, title: string, body: HtmlValue, cls = ""): SafeHtml {
  return html`<section class="card ${cls}"><h2>${emoji(icon)}${title}</h2>${body}</section>`;
}

const by = (items: RenderItem[], type: RenderItem["type"]) => items.filter((i) => i.type === type);
const text = (s: string) => formatText(s);
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

function scheduleGroup(heading: string, rows: ScheduleRow[]): SafeHtml {
  if (!rows.length) return html``;
  return html`<h3>${heading}</h3>${rows.map(
    (r) => html`<div class="r"><span>${r.label}</span><span class="t">${r.display}</span></div>${r.note ? html`<div class="n">${r.note}</div>` : ""}`,
  )}`;
}

const dayHeading = (d: DayInfo) => `${d.weekday}, ${d.hebrew.month} ${d.hebrew.day} — ${d.gregorianShort}`;

function shortDate(civil: string | null): string {
  if (!civil) return "";
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export function render(d: RenderData): SafeHtml {
  const items = d.items.newsletter ?? [];
  const [fri, sat, sun] = d.days;

  // ---- Page 1 ---------------------------------------------------------------
  const schedule = card(
    "📅",
    "Weekly Schedule",
    html`<div class="sched">
      ${scheduleGroup(dayHeading(fri), d.schedule.friday)}
      ${scheduleGroup(dayHeading(sat), d.schedule.shabbos)}
      ${scheduleGroup(dayHeading(sun), d.schedule.sunday)}
      ${scheduleGroup("Monday — Thursday", d.schedule.weekday)}
    </div>`,
  );

  const kids = by(items, "kids_program");
  const kidsCard = kids.length
    ? card(
        "👧",
        "Kids Corner",
        html`${kids.map((k) => {
          const line = [k.fields.ages || k.title, k.eventTime].filter(Boolean).join(" | ");
          return html`<div class="item">
            ${k.fields.ages ? html`<div class="sub">${k.title}</div>` : ""}
            <div>${line}${k.fields.status === "no_program" ? html` — <span class="b">NO PROGRAM</span>` : ""}${k.fields.status === "back" ? html` — <span class="b">We're back!</span>` : ""}</div>
            ${k.fields.location ? html`<div>Location: ${k.fields.location}</div>` : ""}
            ${k.body ? html`<div class="muted">${text(k.body)}</div>` : ""}
          </div>`;
        })}`,
      )
    : "";

  const sponsors = by(items, "sponsor");
  const sponsorCard = sponsors.length
    ? card(
        "🍷",
        "Farbrengen",
        html`<p class="b" style="text-decoration:underline">${sponsors.length > 1 ? "Co-Sponsored by:" : "Sponsored by:"}</p>
        ${sponsors.map(
          (s) => html`<div class="item"><div class="b">${s.title}</div>
            <div>${s.body ? formatInline(s.body) : ""}${s.fields.dedicationHe ? html` <bdi class="he" dir="rtl" lang="he">${s.fields.dedicationHe}</bdi>` : ""}</div></div>`,
        )}`,
      )
    : "";

  const events = by(items, "event");
  const eventsCard = events.length
    ? card(
        "🗓️",
        "Upcoming Events",
        html`${events.map((e) => {
          const when = [shortDate(e.eventDate), e.eventTime].filter(Boolean).join(" | ");
          return html`<div class="item">
            <div class="sub">${e.title}</div>
            ${when ? html`<div>${when}${e.fields.location ? ` | ${e.fields.location}` : ""}</div>` : ""}
            ${e.fields.speaker ? html`<div><i>${e.fields.speaker}</i></div>` : ""}
            ${e.fields.sponsoredBy ? html`<div>Sponsored by ${e.fields.sponsoredBy}</div>` : ""}
            ${e.body ? text(e.body) : ""}
          </div>`;
        })}`,
      )
    : "";

  const birthdays = by(items, "birthday");
  const birthdayCard = birthdays.length
    ? card("🎂", "Happy Birthday", html`<p class="center">${birthdays.map((b) => b.title).join(" • ")}</p>`)
    : "";

  const mazalTov = by(items, "mazal_tov");
  const mazalCard = mazalTov.length
    ? card(
        "🎉",
        "Mazal Tov",
        html`${mazalTov.map(
          (m) => html`<div class="item">${m.body ? text(m.body) : html`Mazal tov to <span class="b">${m.title}</span> ${m.fields.occasion ?? ""}`}</div>`,
        )}`,
      )
    : "";

  const yahrzeits = by(items, "yahrzeit");
  const yahrzeitCard = yahrzeits.length
    ? card(
        "🕯️",
        "Yartzeits",
        html`${yahrzeits.map(
          (y) => html`<div>${y.title || bidi(y.fields.nameHe ?? "")}${y.hebrewDate ? html` - ${bidi(y.hebrewDate)}` : ""}${y.fields.relation ? `, ${y.fields.relation}` : ""}</div>`,
        )}`,
      )
    : "";

  // ---- Page 2 ---------------------------------------------------------------
  const parsha = by(items, "parsha_nutshell").map((p) => card("📜", "Parsha in a Nutshell", text(p.body)));
  const haftorah = by(items, "haftorah").map((p) => card("📖", "Haftorah in a Nutshell", text(p.body)));

  const calEvents = calendarNotes(d);
  const calendarCard = calEvents.length
    ? card("🌙", "This Week", html`${calEvents.map((e) => html`<div>${e}</div>`)}`)
    : "";

  const shiurim = by(items, "shiur");
  const shiurCard = shiurim.length
    ? card(
        "📚",
        "Shiurim",
        html`${shiurim.map((s) => {
          const when = [s.fields.day || shortDate(s.eventDate), s.eventTime].filter(Boolean).join(" | ");
          return html`<div class="item">
            ${when ? html`<div style="color:#d2691e">${when}</div>` : ""}
            <div class="b">${s.title}</div>
            ${s.fields.speaker ? html`<div>${s.fields.speaker}</div>` : ""}
            ${s.fields.location ? html`<div>${s.fields.location}</div>` : ""}
            ${s.fields.audience ? html`<div>${s.fields.audience}</div>` : ""}
            ${s.body ? text(s.body) : ""}
          </div>`;
        })}`,
      )
    : "";

  const riddles = by(items, "riddle");
  const riddleCard = riddles.length ? card("🧩", "Parsha Riddle", html`${riddles.map((r) => text(r.body))}`) : "";
  const answers = riddles.map((r) => r.fields.answer).filter(Boolean);

  const custom = by(items, "custom");
  const communityCard = custom.length
    ? card(
        "📣",
        "Community Calendar",
        html`${custom.map(
          (c) => html`<div class="item">
            ${c.title ? html`<div class="sub">${c.title}</div>` : ""}
            ${c.body ? text(c.body) : ""}
            ${c.linkUrl ? html`<div class="sub">${shortUrl(c.linkUrl)}</div>` : ""}
          </div>`,
        )}`,
      )
    : "";

  const history = by(items, "jewish_history");
  const days: string[] = [];
  for (const h of history) if (!days.includes(h.fields.day ?? "")) days.push(h.fields.day ?? "");
  const historyCard = history.length
    ? card(
        "🕰️",
        "Week in Jewish History",
        html`<div class="history">${days.map(
          (day) => html`${day ? html`<div class="day">${day}</div>` : ""}${history
            .filter((h) => (h.fields.day ?? "") === day)
            .map((h) => html`<div class="ev"><div class="b">${h.title}</div>${text(h.body)}</div>`)}`,
        )}</div>`,
      )
    : "";

  return html`
  <div class="page p1">
    <header class="hdr">
      <img class="logo" src="${d.logo}" alt="">
      ${BH}
      <div class="org">${d.org.name.toUpperCase()}</div>
      <h1>${d.org.emailSettings.newsletterName || "The Shabbos Connection"}</h1>
      <div class="parsha he">${d.titleHe} ${d.yearHe}</div>
    </header>
    <div class="goldbar"></div>
    <div class="cols">
      <div class="col c-left" data-fit="Page 1, left column (schedule, kids)"><div>${schedule}${kidsCard}</div></div>
      <div class="col c-right" data-fit="Page 1, right column (farbrengen, events, birthdays, mazal tov, yahrzeits)"><div>
        ${sponsorCard}${eventsCard}${birthdayCard}${mazalCard}${yahrzeitCard}
      </div></div>
    </div>
  </div>
  <div class="page p2">
    <div class="cols">
      <div class="col c-left" data-fit="Page 2, left column (parsha, shiurim, riddle, community)"><div>
        ${parsha}${haftorah}${calendarCard}${shiurCard}${riddleCard}${communityCard}
      </div></div>
      <div class="col c-right" data-fit="Page 2, right column (Jewish history)"><div>${historyCard}</div></div>
    </div>
    ${answers.length ? html`<div class="answer">Answer: ${answers.join(" · ")}</div>` : ""}
  </div>`;
}

/** Rosh Chodesh, fasts, Mevorchim and the molad from the calendar, for a small "This Week" card. */
export function calendarNotes(d: Pick<RenderData, "days" | "events">): string[] {
  const kinds = new Set(["roshChodesh", "fast", "mevarchim", "molad", "holiday", "special"]);
  const byTitle = new Map<string, string[]>();
  for (const e of d.events) {
    if (!kinds.has(e.kind)) continue;
    const weekday = d.days.find((day) => day.date === e.date)?.weekday ?? "";
    const list = byTitle.get(e.title) ?? [];
    if (e.kind !== "molad" && weekday && !list.includes(weekday)) list.push(weekday);
    byTitle.set(e.title, list);
  }
  return [...byTitle].map(([title, days]) => (days.length ? `${title} — ${days.join(" & ")}` : title));
}
