import type { RenderData, RenderItem } from "../data";
import { assetDataUrl, type TemplateAsset } from "../assets";
import { html, type SafeHtml } from "../html";

/** Children's programs poster (Weeklys p.1): one colourful card per program with an illustration. */
export const WIDTH = 816;
export const HEIGHT = 1056;

const CARD_COLORS = ["#fbd3bd", "#fdf0b3", "#cfe0f6", "#d4efc2", "#ead6f3"];

export const css = () => `
.page { background: #f7f7f5; }
.bhx { position: absolute; top: 22px; right: 34px; font: 700 22px/1 'Frank Ruhl Libre', serif; color: #222; }
.top { position: absolute; top: 16px; left: 0; right: 0; text-align: center; }
.top img { height: 150px; }
.top h1 { margin: 0; font: 400 46px/1.15 'Heebo'; color: #1c1917; }
.top h1 .he { font-family: 'Frank Ruhl Libre', serif; font-weight: 700; }
.top .parsha { font: 700 48px/1.1 'Frank Ruhl Libre', serif; direction: rtl; }
.list { position: absolute; top: 330px; left: 30px; right: 30px; bottom: 24px; }
.list > div { display: flex; flex-direction: column; gap: 16px; min-height: 100%; }
.card { position: relative; flex: 1 1 0; max-height: 200px; display: flex; align-items: center; gap: 14px; min-height: 140px; padding: 8px 24px 8px 4px;
  border-radius: 18px; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
.card .pic { flex: 0 0 180px; height: 170px; display: flex; align-items: center; justify-content: center; }
.card .pic img { max-width: 180px; max-height: 170px; }
.card .txt { font: 400 29px/1.45 'Libre Baskerville', serif; color: #1c1917; }
.card .txt .np { font-weight: 700; color: #b3261e; }
.badge-img { position: absolute; top: 10px; right: -8px; width: 170px; transform: rotate(-2deg); }
.badge-no { position: absolute; top: 14px; right: -8px; padding: 6px 14px; background: #d42020; color: #fff;
  font: 800 22px/1 'Heebo'; transform: rotate(-3deg); box-shadow: 0 2px 4px rgba(0,0,0,.2); }
.empty { padding: 40px; text-align: center; font: 400 24px/1.4 'Heebo'; color: #666; }
`;

/** Pick an illustration from the program's name, unless the item has its own image. */
function illustration(item: RenderItem, index: number): string {
  if (item.image) return item.image;
  const t = `${item.title} ${item.fields.ages ?? ""}`.toLowerCase();
  const pick: TemplateAsset = /father|son|boys|minyan/.test(t)
    ? "kidsFatherSon"
    : /0-5|toddler|baby|babies|pre-?school|tots/.test(t)
      ? "kidsToddlers"
      : /grade|teen|women|davening|tefill/.test(t)
        ? "kidsGirlsDavening"
        : /girl/.test(t)
          ? "kidsGirls"
          : (["kidsToddlers", "kidsGirls", "kidsGirlsDavening", "kidsFatherSon"] as const)[index % 4];
  return assetDataUrl(pick);
}

export function render(d: RenderData): SafeHtml {
  const kids = (d.items.poster_kids ?? []).filter((i) => i.type === "kids_program");
  return html`
    <div class="bhx" lang="he">ב״ה</div>
    <div class="top">
      <img src="${assetDataUrl("kidsLogo")}" alt="">
      <h1><span class="he">שבת</span> Programming</h1>
      <div class="parsha">${d.titleHe}</div>
    </div>
    <div class="list" data-fit="Programs"><div>
      ${
        kids.length
          ? kids.map((k, i) => {
              const status = k.fields.status;
              return html`<div class="card" style="background: linear-gradient(90deg, ${CARD_COLORS[i % CARD_COLORS.length]} 0%, ${CARD_COLORS[i % CARD_COLORS.length]}cc 55%, #ffffff00 100%)">
                <div class="pic"><img src="${illustration(k, i)}" alt=""></div>
                <div class="txt">
                  <div>${k.fields.ages ? `Age: ${k.fields.ages}` : k.title}</div>
                  ${k.fields.ages ? html`<div>${k.title}</div>` : ""}
                  ${status === "no_program" ? html`<div class="np">NO PROGRAM this week</div>` : k.eventTime ? html`<div>${k.eventTime}</div>` : ""}
                  ${k.fields.location ? html`<div>Location: ${k.fields.location}</div>` : ""}
                </div>
                ${status === "back" ? html`<img class="badge-img" src="${assetDataUrl("badgeBack")}" alt="We're back">` : ""}
                ${status === "no_program" ? html`<div class="badge-no">NO PROGRAM</div>` : ""}
              </div>`;
            })
          : html`<div class="empty">No programs are placed on this poster. Tick “Kids” on a Kids Program item.</div>`
      }
    </div></div>`;
}
