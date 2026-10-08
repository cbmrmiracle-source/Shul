import type { RenderData, ScheduleRow } from "../data";
import { html, type SafeHtml } from "../html";
import { BH, COLORS } from "./shared";

/** Shabbos square image (Weeklys p.6). Designed at 540px, exported at 1080px. */
export const WIDTH = 540;
export const HEIGHT = 540;

export const css = `
.page { background: radial-gradient(circle at 50% 35%, #fdfcf8 0%, ${COLORS.cream} 65%, #e9e3d0 100%); }
.frame { position: absolute; inset: 10px; border: 1.5px solid #8a7a45; }
.frame::before, .frame::after { content: "◆"; position: absolute; font-size: 10px; color: #6d5d2a; top: -8px; }
.frame::before { left: -6px; } .frame::after { right: -6px; }
.bh { font-size: 12px; top: 18px; right: 24px; color: #333; }
.content { position: absolute; inset: 20px 24px 16px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
.logo { width: 70px; }
.ribbon { position: relative; padding: 2px 34px 5px; border-top: 1.5px solid #6d5d2a; border-bottom: 1.5px solid #6d5d2a;
  font: 700 34px/1.15 'Frank Ruhl Libre', serif; color: #2a2418; }
.ribbon::before, .ribbon::after { content: "◆"; position: absolute; top: 50%; transform: translateY(-50%); font-size: 13px; color: #6d5d2a; }
.ribbon::before { left: -8px; } .ribbon::after { right: -8px; }
.times { padding: 5px 26px; border-radius: 5px; background: linear-gradient(180deg, #dcc068, #b8963a);
  font: 700 19px/1.3 'Heebo'; color: #1d1608; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.cols { display: flex; gap: 12px; width: 100%; }
.col { flex: 1; border: 1.5px solid #3a3a2e; border-radius: 5px; background: rgba(255,255,255,.6); display: flex; flex-direction: column; }
.col h2 { margin: 0; padding: 5px; text-align: center; font: 400 19px/1.2 'Libre Baskerville', serif; color: #fff; border-radius: 3px 3px 0 0; }
.col.fri h2 { background: ${COLORS.green}; } .col.sat h2 { background: ${COLORS.brown}; }
.rows { height: 168px; padding: 4px 10px 6px; }
.r { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0 4px; border-bottom: 1px solid #d9d2bd;
  font: 500 16.5px/1.25 'Heebo'; }
.r:last-child, .r.has-note { border-bottom: none; }
.r .t { white-space: nowrap; font-weight: 700; }
.n { margin: -3px 0 0; padding-bottom: 4px; border-bottom: 1px solid #d9d2bd; font: 400 13px/1.2 'Heebo'; color: #3d3a30; }
.eruv { width: 100%; padding: 6px; border-radius: 5px; text-align: center;
  font: 700 26px/1.15 'Roboto Slab', serif; color: #fff; background: linear-gradient(180deg, #a8892b, #8a6f1d); }
.eruv.down { background: linear-gradient(180deg, #a33b2b, #7d2a1e); }
.gs { font: 400 27px/1 'Libre Baskerville', serif; color: #3f3e22; }
`;

const isMorning = (r: ScheduleRow) => Boolean(r.value && "times" in r.value && r.value.times[0] < 12 * 60);

function rows(list: ScheduleRow[]): SafeHtml {
  return html`${list.map(
    (r) => html`<div class="r ${r.note ? "has-note" : ""}"><span>${r.label}</span><span class="t">${r.display}</span></div>
      ${r.note ? html`<div class="n">${r.note}</div>` : ""}`,
  )}`;
}

export function render(d: RenderData): SafeHtml {
  const fridayNight = d.schedule.friday.filter((r) => r.key !== "candle_lighting" && !isMorning(r));
  const shabbosDay = d.schedule.shabbos.filter((r) => r.key !== "shabbos_ends");
  const eruv = d.items.whatsapp_shabbos?.find((i) => i.type === "eruv");
  const eruvStatus = eruv?.fields.status;

  return html`
    <div class="frame"></div>
    ${BH}
    <div class="content">
      <img class="logo" src="${d.logo}" alt="">
      <div class="ribbon he">שבת ${d.titleHe}</div>
      <div class="times">
        ${d.candleLighting ? html`<div>Candle Lighting - ${d.candleLighting}</div>` : ""}
        ${d.shabbosEnds ? html`<div>Shabbos Ends - ${d.shabbosEnds}</div>` : ""}
      </div>
      <div class="cols">
        <div class="col fri"><h2>Friday Night</h2><div class="rows" data-fit="Friday Night"><div>${rows(fridayNight)}</div></div></div>
        <div class="col sat"><h2>Shabbos Day</h2><div class="rows" data-fit="Shabbos Day"><div>${rows(shabbosDay)}</div></div></div>
      </div>
      ${eruvStatus === "kosher" ? html`<div class="eruv">The Eruv is Kosher</div>` : ""}
      ${eruvStatus === "down" ? html`<div class="eruv down">The Eruv is Down This Shabbos</div>` : ""}
      <div class="gs">Good Shabbos!</div>
    </div>`;
}
