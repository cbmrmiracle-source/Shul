import type { RenderData } from "../data";
import { html, type SafeHtml } from "../html";
import { summarizeMinyanim } from "../minyanim";
import { BH, COLORS } from "./shared";

/** "This Week's Minyanim" square image (Weeklys p.5). Designed at 540px, exported at 1080px. */
export const WIDTH = 540;
export const HEIGHT = 540;

export const css = `
.page { background: radial-gradient(circle at 50% 40%, #fbfaf6 0%, ${COLORS.cream} 70%, #ebe6d6 100%); }
.frame { position: absolute; inset: 12px; border: 2px solid #3a3a2e; }
.frame::after { content: ""; position: absolute; inset: 5px; border: 1px solid ${COLORS.olive}; }
.bh { font-size: 13px; top: 22px; right: 28px; color: #333; }
.content { position: absolute; inset: 26px 30px 30px; display: flex; flex-direction: column; align-items: center; }
.logo { width: 96px; margin-top: 2px; }
h1 { margin: 8px 0 4px; font: 800 33px/1.05 'Playfair Display', serif; letter-spacing: .2px; color: #1a1611; text-align: center; }
.body { flex: 1; width: 100%; text-align: center; display: flex; flex-direction: column; justify-content: center; }
.sec { margin: 7px 0; }
.label { font: 700 23px/1.2 'Libre Baskerville', serif; text-transform: uppercase; color: #1a1611; }
.line { font: 700 20px/1.35 'Libre Baskerville', serif; color: #1a1611; letter-spacing: -.2px; }
.sec.big .label { font-size: 31px; }
.sec.big .line { font: 800 58px/1.02 'Libre Baskerville', serif; letter-spacing: -1px; text-shadow: 0 2px 6px rgba(120,100,40,.35); }
`;

const looksLikeTime = (s: string) => /^\d{1,2}:\d{2}/.test(s);

export function render(d: RenderData): SafeHtml {
  const summary = summarizeMinyanim(d.schedule.sunday, d.schedule.weekday, d.schedule.friday);
  return html`
    <div class="frame"></div>
    ${BH}
    <div class="content">
      <img class="logo" src="${d.logo}" alt="">
      <h1>THIS WEEK’S MINYANIM</h1>
      <div class="body" data-fit="Minyanim"><div>
        ${summary.map((s) => {
          const big = s.lines.length === 1 && looksLikeTime(s.lines[0].text);
          return html`<div class="sec ${big ? "big" : ""}">
            <div class="label">${s.label}:</div>
            ${s.lines.map((l) => html`<div class="line">${l.days ? `${l.days} - ` : ""}${l.text}</div>`)}
          </div>`;
        })}
      </div></div>
    </div>`;
}
