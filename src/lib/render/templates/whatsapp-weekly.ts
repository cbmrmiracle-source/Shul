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
.sec { margin: 9px 0; }
.label { font: 700 24px/1.2 'Libre Baskerville', serif; text-transform: uppercase; color: #1a1611; }
.line { font: 700 21px/1.38 'Libre Baskerville', serif; color: #1a1611; letter-spacing: -.2px; }
`;

export function render(d: RenderData): SafeHtml {
  const summary = summarizeMinyanim(d.weekdaySections, d.schedule.friday);
  return html`
    <div class="frame"></div>
    ${BH}
    <div class="content">
      <img class="logo" src="${d.logo}" alt="">
      <h1>THIS WEEK’S MINYANIM</h1>
      <div class="body" data-fit="Minyanim"><div>
        ${summary.map(
          (s) => html`<div class="sec">
            <div class="label">${s.label}:</div>
            ${s.lines.map((l) => html`<div class="line">${l.days ? `${l.days} - ` : ""}${l.text}</div>`)}
          </div>`,
        )}
      </div></div>
    </div>`;
}
