import type { RenderData, RenderItem } from "../data";
import { assetDataUrl } from "../assets";
import { html, type SafeHtml } from "../html";

/** Sicha Shiur poster (Weeklys p.2): parchment and candle background, the time in very large type. */
export const WIDTH = 816;
export const HEIGHT = 1056;

export const css = () => `
.page { background: url(${assetDataUrl("sichaBackground")}) center / 100% 100% no-repeat; text-align: center; color: #c0161d; }
.bhx { position: absolute; top: 36px; left: 0; right: 0; font: 700 22px/1 'Frank Ruhl Libre', serif; color: #222; }
.title { position: absolute; top: 70px; left: 60px; right: 60px; }
.title .en { font: 800 88px/1.02 'Heebo'; }
.title .heb { font: 900 118px/1.02 'Frank Ruhl Libre', serif; direction: rtl; }
.title .plain { font: 800 64px/1.1 'Heebo'; }
.where { margin-top: 14px; font: 400 30px/1.3 'Heebo'; }
.where .he { font-weight: 700; }
.time { position: absolute; top: 420px; left: 0; right: 0; font: 900 200px/1 'Heebo'; color: #111; letter-spacing: -6px; }
.time .ampm { font-size: 72px; letter-spacing: 0; margin-left: 6px; }
.when { position: absolute; bottom: 56px; left: 0; right: 0; font: 400 36px/1 'Heebo'; }
.empty { position: absolute; top: 420px; left: 80px; right: 80px; font: 400 26px/1.4 'Heebo'; color: #555; }
`;

/** The shiur for this poster: placed on it, else a davening row named like "Sichos". */
function pickShiur(d: RenderData): { title: string; time: string; day: string } | null {
  const item: RenderItem | undefined = d.items.poster_sicha?.find((i) => i.type === "shiur") ?? d.items.poster_sicha?.[0];
  if (item) return { title: item.title, time: item.eventTime, day: item.fields.day ?? "Shabbos" };
  const row = d.schedule.shabbos.find((r) => /sichos|sicha/i.test(r.label));
  return row ? { title: row.label, time: row.display, day: "Shabbos" } : null;
}

function partOfDay(time: string): string {
  const m = /(\d{1,2}):?(\d{2})?\s*(AM|PM)/i.exec(time);
  if (!m) return "";
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 19 ? "Afternoon" : "Evening";
}

export function render(d: RenderData): SafeHtml {
  const shiur = pickShiur(d);
  const bh = html`<div class="bhx" lang="he">ב״ה</div>`;
  if (!shiur) {
    return html`${bh}<div class="empty">No shiur is placed on this poster. Tick “Sicha” on a Shiur item.</div>`;
  }
  const isSichos = /likutei\s*sichos/i.test(shiur.title);
  const m = /^(.*?)(AM|PM)$/i.exec(shiur.time.trim());
  return html`
    ${bh}
    <div class="title">
      ${isSichos
        ? html`<div class="en">${shiur.title.replace(/likutei\s*sichos/i, "").trim() || "Shiur in"}</div><div class="heb">לקוטי שיחות</div>`
        : html`<div class="plain">${shiur.title}</div>`}
      <div class="where">This week <span class="he">${d.titleHe}</span> will be at:</div>
    </div>
    <div class="time">${m ? html`${m[1].trim()}<span class="ampm">${m[2].toUpperCase()}</span>` : shiur.time}</div>
    <div class="when">${[shiur.day, partOfDay(shiur.time)].filter(Boolean).join(" ")}</div>`;
}
