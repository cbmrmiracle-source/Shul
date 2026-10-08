import type { RenderData, ScheduleRow } from "../data";
import { html, type SafeHtml } from "../html";
import { BH, calendarIcon, COLORS } from "./shared";

/** The Weekly Schedule poster (Weeklys p.4), Letter size. Same layout as the newsletter's schedule card. */
export const WIDTH = 816; // 8.5in at 96dpi
export const HEIGHT = 1056; // 11in

export const css = `
.page { background: #fff; }
.hdr { position: relative; height: 210px; color: #fff; text-align: center;
  background: linear-gradient(180deg, ${COLORS.navyLight} 0%, ${COLORS.navy} 100%); }
.hdr .logo { position: absolute; left: 34px; top: 34px; width: 120px; filter: brightness(0) invert(1); }
.hdr .bh { color: ${COLORS.goldLight}; font-size: 20px; top: 16px; right: 26px; }
.hdr .org { padding-top: 46px; font: 700 22px/1 'Heebo'; letter-spacing: 2px; color: ${COLORS.goldLight}; }
.hdr h1 { margin: 12px 0 10px; font: 800 52px/1 'Roboto Slab', serif; letter-spacing: .5px; }
.hdr .parsha { font: 700 30px/1.1 'Frank Ruhl Libre', serif; color: ${COLORS.goldLight}; }
.goldbar { height: 14px; background: linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLight}, ${COLORS.gold}); }
.box { position: absolute; left: 30px; right: 30px; top: 252px; bottom: 30px;
  border: 3px solid #111; border-radius: 14px; padding: 18px 26px; }
.group h2 { margin: 14px 0 6px; font: 700 25px/1.2 'Libre Baskerville', serif; color: ${COLORS.navy};
  text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
.group:first-child h2 { margin-top: 0; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 20px;
  font: 400 24px/1.55 'Libre Baskerville', serif; }
.row .t { white-space: nowrap; font-size: 23px; }
.note { margin: -4px 0 4px 18px; font: italic 400 17px/1.3 'Libre Baskerville', serif; color: #555; }
`;

function group(heading: string, rows: ScheduleRow[]): SafeHtml {
  if (rows.length === 0) return html``;
  return html`<section class="group">
    <h2>${heading}</h2>
    ${rows.map(
      (r) => html`<div class="row"><span>${r.label}</span><span class="t">${r.display}</span></div>
        ${r.note ? html`<div class="note">${r.note}</div>` : ""}`,
    )}
  </section>`;
}

export function render(d: RenderData): SafeHtml {
  const [fri, sat, sun] = d.days;
  const dayHeading = (day: typeof fri) => `${day.weekday}, ${day.hebrew.month} ${day.hebrew.day} — ${day.gregorianShort}`;
  return html`
    <header class="hdr">
      <img class="logo" src="${d.logo}" alt="">
      ${BH}
      <div class="org">${d.org.name.toUpperCase()}</div>
      <h1>${calendarIcon(44)} Weekly Schedule</h1>
      <div class="parsha he">${d.titleHe} ${d.yearHe}</div>
    </header>
    <div class="goldbar"></div>
    <main class="box" data-fit="Schedule"><div>
      ${group(dayHeading(fri), d.schedule.friday)}
      ${group(dayHeading(sat), d.schedule.shabbos)}
      ${group(dayHeading(sun), d.schedule.sunday)}
      ${group("Monday — Thursday", d.schedule.weekday)}
    </div></main>`;
}
