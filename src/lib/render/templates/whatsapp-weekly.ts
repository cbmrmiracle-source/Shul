import type { RenderData } from "../data";
import { html, raw, type SafeHtml } from "../html";
import { summarizeMinyanim } from "../minyanim";
import { BH } from "./shared";

/**
 * "This Week's Minyanim" WhatsApp image: cream card with a double gold frame,
 * green leaf sprigs in two corners, and one panel per tefillah (Shachris,
 * Mincha, Maariv…). Designed at 720×485, exported at 2×.
 */
export const WIDTH = 720;
export const HEIGHT = 485;

const GREEN = "#1d4a2c";
const GOLD = "#c9a45c";
const GOLD_LIGHT = "#e3cf9f";

export const css = `
.page { background: radial-gradient(ellipse at 50% 45%, #fffdf7 0%, #faf5e9 60%, #f1e9d6 100%); }
.frame { position: absolute; inset: 12px; border: 1.5px solid ${GOLD}; }
.frame::after { content: ""; position: absolute; inset: 5px; border: 1px solid ${GOLD_LIGHT}; }
.sprig { position: absolute; width: 175px; height: 175px; }
.sprig.tl { left: -8px; top: -6px; }
.sprig.br { right: -8px; bottom: -6px; transform: rotate(180deg); }
.bh { font-size: 13px; top: 22px; right: 30px; color: #333; }
.content { position: absolute; inset: 24px 28px 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.logo { height: 66px; max-width: 200px; object-fit: contain; }
h1 { margin: 6px 0 0; text-align: center; color: ${GREEN}; font-family: 'Playfair Display', serif; font-weight: 800; line-height: .92; }
h1 .small { display: block; font-size: 40px; letter-spacing: .5px; }
h1 .big { display: block; font-size: 76px; letter-spacing: 1px; }
.rule { display: flex; align-items: center; gap: 8px; width: 74%; margin: 8px 0 12px; }
.rule::before, .rule::after { content: ""; flex: 1; height: 1.5px; background: linear-gradient(90deg, transparent, ${GOLD}); }
.rule::after { background: linear-gradient(90deg, ${GOLD}, transparent); }
.diamond { width: 9px; height: 9px; background: ${GOLD}; transform: rotate(45deg); flex: none; }
.panels { flex: 0 1 auto; width: 100%; min-height: 0; }
.panels > div { display: flex; gap: 10px; align-items: stretch; }
.panel { flex: 1 1 auto; min-width: 0; min-height: 148px; display: flex; flex-direction: column; align-items: center; padding: 12px 8px 10px;
  border: 1.5px solid ${GOLD_LIGHT}; border-radius: 12px; background: rgba(255, 255, 255, .45); }
.pill { padding: 5px 20px 4px; margin: 0 6px; border-radius: 999px; background: ${GREEN}; border: 1.5px solid ${GOLD};
  color: #fff; font: 700 18px/1.15 'Libre Baskerville', serif; text-transform: uppercase; letter-spacing: .3px; white-space: nowrap; }
.lines { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 8px 0 6px; text-align: center; }
.line { font: 400 14.2px/1.45 'Libre Baskerville', serif; color: #22261f; }
.line + .line { margin-top: 3px; }
.nb { white-space: nowrap; }
.panel .rule { width: 70%; margin: 2px 0 0; }
.panel .diamond { width: 7px; height: 7px; }
`;

/** One leaf: a pointed oval along +x with a midrib. */
const leaf = (x: number, y: number, angle: number, len: number, fill: string) =>
  `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${len / 50})">
    <path d="M0 0C10-13 36-13 50 0C36 13 10 13 0 0Z" fill="${fill}"/>
    <path d="M2 0Q25 -1.5 47 0" stroke="#e8efe0" stroke-opacity=".45" stroke-width="1" fill="none"/>
  </g>`;
const goldLeaf = (x: number, y: number, angle: number, len: number) =>
  `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${len / 50})">
    <path d="M0 0C10-12 36-12 50 0C36 12 10 12 0 0Z" fill="${GOLD_LIGHT}" fill-opacity=".55" stroke="${GOLD}" stroke-width="1.2"/>
  </g>`;

/** Leaf sprig growing out of the top-left corner. */
function sprig(): SafeHtml {
  return raw(`<svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f5e33"/><stop offset="1" stop-color="#6f9a5a"/></linearGradient>
    <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f7040"/><stop offset="1" stop-color="#93b67c"/></linearGradient>
  </defs>
  <path d="M4 26C40 30 70 44 104 30" stroke="#5c7a45" stroke-width="2" fill="none"/>
  <path d="M8 18C22 50 30 80 26 116" stroke="#5c7a45" stroke-width="1.8" fill="none"/>
  <path d="M30 40C52 48 66 66 80 74" stroke="${GOLD}" stroke-width="1.2" fill="none"/>
  ${goldLeaf(56, 32, -30, 30)}
  ${goldLeaf(86, 34, 10, 26)}
  ${goldLeaf(60, 60, 40, 24)}
  ${leaf(20, 28, -20, 44, "url(#lg1)")}
  ${leaf(44, 33, 25, 40, "url(#lg2)")}
  ${leaf(72, 34, -35, 38, "url(#lg1)")}
  ${leaf(96, 30, -5, 34, "url(#lg2)")}
  ${leaf(18, 40, 75, 40, "url(#lg2)")}
  ${leaf(24, 70, 50, 36, "url(#lg1)")}
  ${leaf(26, 92, 95, 30, "url(#lg2)")}
  ${leaf(10, 54, 115, 34, "url(#lg1)")}
  ${leaf(4, 10, 10, 36, "url(#lg2)")}
  ${leaf(34, 22, -50, 32, "url(#lg2)")}
  ${leaf(16, 104, 120, 26, "url(#lg1)")}
  ${leaf(118, 28, 15, 24, "url(#lg1)")}
  <circle cx="82" cy="75" r="2.6" fill="${GOLD}"/><circle cx="88" cy="70" r="2" fill="${GOLD}"/>
  <circle cx="77" cy="81" r="1.8" fill="${GOLD}"/><circle cx="112" cy="27" r="2.2" fill="${GOLD}"/>
</svg>`);
}

const divider = html`<div class="rule"><span class="diamond"></span></div>`;

export function render(d: RenderData): SafeHtml {
  const summary = summarizeMinyanim(d.weekdaySections, d.schedule.friday);
  return html`
    <div class="frame"></div>
    <div class="sprig tl">${sprig()}</div>
    <div class="sprig br">${sprig()}</div>
    ${BH}
    <div class="content">
      <img class="logo" src="${d.logo}" alt="">
      <h1><span class="small">THIS WEEK’S</span><span class="big">MINYANIM</span></h1>
      ${divider}
      <div class="panels" data-fit="Minyanim"><div>
        ${summary.map((s) => {
          // Lines break only between the days and the times.
          const lines = s.lines.map((l) =>
            l.days ? html`<span class="nb">${l.days} -</span> <span class="nb">${l.text}</span>` : html`<span class="nb">${l.text}</span>`,
          );
          return html`<div class="panel">
            <div class="pill">${s.label}</div>
            <div class="lines">${lines.map((l) => html`<div class="line">${l}</div>`)}</div>
            ${divider}
          </div>`;
        })}
      </div></div>
    </div>`;
}
