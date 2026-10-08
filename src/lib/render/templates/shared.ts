import { readFileSync } from "node:fs";
import path from "node:path";
import { html, raw, type HtmlValue, type SafeHtml } from "../html";

/** Brand colors from the newsletter, email and posters. */
export const COLORS = {
  navy: "#1f3a5f",
  navyLight: "#3a6188",
  gold: "#c6a43c",
  goldLight: "#f0d57a",
  cream: "#f6f3ea",
  ink: "#1c1917",
  olive: "#6b6a3a",
  green: "#2f4a2c",
  brown: "#3d2b1f",
};

export const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Heebo', sans-serif; color: ${COLORS.ink}; -webkit-font-smoothing: antialiased; }
p { margin: 0; }
.he { font-family: 'Frank Ruhl Libre', serif; direction: rtl; unicode-bidi: isolate; }
.emoji { display: inline-block; width: 1em; height: 1em; vertical-align: -0.12em; }
.bh { position: absolute; top: 14px; right: 18px; font-family: 'Frank Ruhl Libre', serif; font-weight: 700; }
[data-fit] { overflow: hidden; }
`;

/** A complete HTML document of a fixed pixel size. */
export function documentShell(opts: {
  width: number;
  height: number;
  /** Multi-page templates render their own <div class="page"> elements. */
  pages?: number;
  fonts: string;
  css: string;
  body: HtmlValue;
}): string {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${raw(opts.fonts)}</style>
<style>${raw(BASE_CSS)}
@page { size: ${opts.width}px ${opts.height}px; margin: 0; }
.page { position: relative; width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; break-after: page; }
.page:last-child { break-after: auto; }
${raw(opts.css)}</style>
</head>
<body>${(opts.pages ?? 1) > 1 ? opts.body : html`<div class="page">${opts.body}</div>`}</body>
</html>`.value;
}

export const BH = html`<div class="bh" lang="he">ב״ה</div>`;

/** Simple line-art calendar icon (emoji fonts aren't guaranteed on servers). */
export function calendarIcon(size: number, color = "#fff"): SafeHtml {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" aria-hidden="true" style="vertical-align:-0.12em"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`,
  );
}

/**
 * An emoji as a colour image (Twemoji SVG, embedded). Headless Chromium can't
 * draw colour emoji fonts reliably, so icons are pictures.
 */
export function emoji(e: string): SafeHtml {
  const svg = twemojiSvg(e);
  if (!svg) return html``;
  return html`<img class="emoji" alt="" src="data:image/svg+xml;base64,${svg}">`;
}

const emojiCache = new Map<string, string | null>();

function twemojiSvg(e: string): string | null {
  if (emojiCache.has(e)) return emojiCache.get(e)!;
  const points = [...e].map((c) => c.codePointAt(0)!.toString(16));
  // Twemoji file names drop the FE0F variation selector unless the emoji is a ZWJ sequence.
  const name = (points.includes("200d") ? points : points.filter((p) => p !== "fe0f")).join("-");
  let data: string | null = null;
  try {
    data = readFileSync(path.join(process.cwd(), "node_modules/@twemoji/svg", `${name}.svg`)).toString("base64");
  } catch {
    data = null;
  }
  emojiCache.set(e, data);
  return data;
}
