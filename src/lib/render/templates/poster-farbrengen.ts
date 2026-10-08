import type { RenderData } from "../data";
import { assetDataUrl } from "../assets";
import { formatInline, html, type SafeHtml } from "../html";

/** Farbrengen poster (Weeklys p.3): the sponsors over the "Farbrengen This Week" artwork. */
export const WIDTH = 816;
export const HEIGHT = 1056;

export const css = () => `
.page { background: url(${assetDataUrl("farbrengenBackground")}) center / 100% 100% no-repeat; }
.bhx { position: absolute; top: 18px; left: 0; right: 0; text-align: center; font: 700 18px/1 'Frank Ruhl Libre', serif; color: #3a2a12; }
.text { position: absolute; top: 214px; left: 86px; right: 86px; height: 420px; text-align: center; color: #1d1a14; }
.text > div { font: 500 31px/1.28 'Barlow Semi Condensed', sans-serif; }
.label { font-weight: 600; text-decoration: underline; text-underline-offset: 4px; margin-bottom: 4px; }
.sponsor { margin-bottom: 26px; }
.sponsor:last-child { margin-bottom: 0; }
.name { font-weight: 600; font-size: 34px; }
.he { font-family: 'Frank Ruhl Libre', serif; font-weight: 700; }
.note { margin-top: 40px; font-size: 24px; }
`;

export function render(d: RenderData): SafeHtml {
  const sponsors = (d.items.poster_farbrengen ?? []).filter((i) => i.type === "sponsor");
  return html`
    <div class="bhx" lang="he">ב״ה</div>
    <div class="text" data-fit="Sponsors"><div>
      ${
        sponsors.length
          ? html`<div class="label">${sponsors.length > 1 ? "Co-Sponsored by:" : "Sponsored by:"}</div>
            ${sponsors.map(
              (s) => html`<div class="sponsor"><div class="name">${s.title}</div>
                ${s.body ? html`<div>${formatInline(s.body)}${s.fields.dedicationHe ? html` <bdi class="he" dir="rtl" lang="he">${s.fields.dedicationHe}</bdi>` : ""}</div>` : s.fields.dedicationHe ? html`<div><bdi class="he" dir="rtl" lang="he">${s.fields.dedicationHe}</bdi></div>` : ""}
              </div>`,
            )}`
          : html`<div class="note">${d.org.emailSettings.sponsorNote || "This week’s Farbrengen is available for sponsorship."}</div>`
      }
    </div></div>`;
}
