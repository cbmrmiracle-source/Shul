import type { RenderData } from "../data";
import { formatText, html, type SafeHtml } from "../html";
import { collectShiurim } from "../shiurim";
import { BH, COLORS, emoji } from "./shared";

/** Weekly Shiurim poster: every shiur of the week, by day. Letter size, same header as the Weekly Schedule poster. */
export const WIDTH = 816;
export const HEIGHT = 1056;

export const css = `
.page { background: #fff; }
.hdr { position: relative; height: 210px; color: #fff; text-align: center;
  background: linear-gradient(180deg, ${COLORS.navyLight} 0%, ${COLORS.navy} 100%); }
.hdr .logo { position: absolute; left: 34px; top: 34px; width: 120px; filter: brightness(0) invert(1); }
.hdr .bh { color: ${COLORS.goldLight}; font-size: 20px; top: 16px; right: 26px; }
.hdr .org { padding-top: 46px; font: 700 22px/1 'Heebo'; letter-spacing: 2px; color: ${COLORS.goldLight}; }
.hdr h1 { margin: 12px 0 10px; font: 800 52px/1 'Roboto Slab', serif; letter-spacing: .5px; }
.hdr h1 .emoji { width: 44px; height: 44px; vertical-align: -4px; margin-right: 8px; }
.hdr .parsha { font: 700 30px/1.1 'Frank Ruhl Libre', serif; color: ${COLORS.goldLight}; }
.goldbar { height: 14px; background: linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLight}, ${COLORS.gold}); }
.box { position: absolute; left: 30px; right: 30px; top: 252px; bottom: 30px;
  border: 3px solid #111; border-radius: 14px; padding: 18px 28px; }
.day { margin: 16px 0 6px; font: 700 25px/1.2 'Libre Baskerville', serif; color: ${COLORS.navy};
  text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
.day:first-child { margin-top: 0; }
.shiur { display: flex; gap: 22px; padding: 8px 0 10px; border-bottom: 1px solid #e3ddcc; }
.shiur:last-child { border-bottom: none; }
.shiur .t { flex: 0 0 130px; font: 700 23px/1.35 'Heebo'; color: #b0151d; white-space: nowrap; }
.shiur .main { flex: 1; min-width: 0; }
.shiur .title { font: 700 24px/1.3 'Libre Baskerville', serif; color: #111; }
.shiur .meta { font: 400 18px/1.4 'Heebo'; color: #333; }
.shiur .desc { margin-top: 2px; font: 400 16px/1.4 'Heebo'; color: #555; }
.shiur .desc p { margin: 0; }
.empty { padding: 40px; text-align: center; font: 400 24px/1.4 'Heebo'; color: #666; }
`;

export function render(d: RenderData): SafeHtml {
  const days = collectShiurim(d);
  return html`
    <header class="hdr">
      <img class="logo" src="${d.logo}" alt="">
      ${BH}
      <div class="org">${d.org.name.toUpperCase()}</div>
      <h1>${emoji("📚")}Weekly Shiurim</h1>
      <div class="parsha he">${d.titleHe} ${d.yearHe}</div>
    </header>
    <div class="goldbar"></div>
    <main class="box" data-fit="Shiurim"><div>
      ${
        days.length
          ? days.map(
              (g) => html`<div class="day">${g.day}</div>
              ${g.shiurim.map(
                (s) => html`<div class="shiur">
                  <div class="t">${s.time}</div>
                  <div class="main">
                    <div class="title">${s.title}</div>
                    ${[s.speaker, s.location, s.audience].some(Boolean) ? html`<div class="meta">${[s.speaker, s.location, s.audience].filter(Boolean).join(" · ")}</div>` : ""}
                    ${s.description ? html`<div class="desc">${formatText(s.description)}</div>` : ""}
                  </div>
                </div>`,
              )}`,
            )
          : html`<div class="empty">No shiurim are placed on this poster. Tick “Shiurim” on each Shiur item.</div>`
      }
    </div></main>`;
}
