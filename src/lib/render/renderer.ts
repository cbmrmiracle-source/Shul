import "server-only";
import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright-core";
import type { RenderData } from "./data";
import { fontFaceCss } from "./fonts";
import { documentShell } from "./templates/shared";
import type { OutputTemplate } from "./templates";

export interface RenderResult {
  data: Buffer;
  contentType: string;
  /** Problems a person should look at, e.g. text that doesn't fit. */
  warnings: string[];
}

let browserPromise: Promise<Browser> | null = null;

/** One shared headless Chromium for the whole server process. */
function browser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--font-render-hinting=none"] })
      .then((b) => {
        b.on("disconnected", () => (browserPromise = null));
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

/**
 * Shrink each [data-fit] region (via CSS zoom on its first child) until its
 * content fits, down to 62%. Returns warnings for regions that were shrunk a
 * lot or still overflow.
 */
const FIT_SCRIPT = `(() => {
  const out = [];
  for (const el of document.querySelectorAll("[data-fit]")) {
    const inner = el.firstElementChild;
    if (!inner) continue;
    let z = 1;
    while (el.scrollHeight > el.clientHeight + 1 && z > 0.62) { z -= 0.02; inner.style.zoom = String(z); }
    const name = el.getAttribute("data-fit");
    if (el.scrollHeight > el.clientHeight + 1) out.push(name + " is too long to fit. Shorten it or remove something.");
    else if (z < 0.85) out.push(name + " was shrunk to " + Math.round(z * 100) + "% to fit.");
  }
  return out;
})()`;

const cache = new Map<string, RenderResult>();
const CACHE_SIZE = 40;

export function buildHtml(template: OutputTemplate, data: RenderData): string {
  return documentShell({
    width: template.width,
    height: template.height,
    fonts: fontFaceCss(),
    css: template.css,
    body: template.render(data),
  });
}

export async function renderOutput(template: OutputTemplate, data: RenderData, format: "png" | "pdf"): Promise<RenderResult> {
  const html = buildHtml(template, data);
  const key = createHash("sha1").update(format).update(String(template.scale)).update(html).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;

  const page = await (await browser()).newPage({
    viewport: { width: template.width, height: template.height },
    deviceScaleFactor: format === "png" ? template.scale : 1,
  });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const warnings = (await page.evaluate(FIT_SCRIPT)) as string[];
    const result: RenderResult =
      format === "png"
        ? { data: await page.screenshot({ type: "png", fullPage: false }), contentType: "image/png", warnings }
        : {
            data: await page.pdf({ width: `${template.width}px`, height: `${template.height}px`, printBackground: true, preferCSSPageSize: true }),
            contentType: "application/pdf",
            warnings,
          };
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    return result;
  } finally {
    await page.close();
  }
}
