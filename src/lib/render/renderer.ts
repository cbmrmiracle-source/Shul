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
    pages: template.pages ?? 1,
    fonts: fontFaceCss(),
    css: template.css,
    body: template.render(data),
  });
}

/**
 * Render a template. PNG renders one page (`page`, 1-based) of a multi-page
 * template; PDF renders all pages.
 */
export async function renderOutput(
  template: OutputTemplate,
  data: RenderData,
  format: "png" | "pdf",
  page = 1,
): Promise<RenderResult> {
  const pages = template.pages ?? 1;
  if (page < 1 || page > pages) throw new Error(`Page ${page} doesn't exist`);
  const html = buildHtml(template, data);
  const key = createHash("sha1").update(`${format}:${page}:${template.scale}`).update(html).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;

  const tab = await (await browser()).newPage({
    viewport: { width: template.width, height: template.height },
    deviceScaleFactor: format === "png" ? template.scale : 1,
  });
  try {
    // Everything a page needs is embedded; block any network access.
    await tab.route("**/*", (route) => route.abort());
    await tab.setContent(html, { waitUntil: "load" });
    await tab.evaluate(() => document.fonts.ready);
    const warnings = (await tab.evaluate(FIT_SCRIPT)) as string[];
    const result: RenderResult =
      format === "png"
        ? {
            data: await tab.screenshot({
              type: "png",
              fullPage: pages > 1,
              clip: { x: 0, y: (page - 1) * template.height, width: template.width, height: template.height },
            }),
            contentType: "image/png",
            warnings,
          }
        : {
            data: await tab.pdf({ width: `${template.width}px`, height: `${template.height}px`, printBackground: true, preferCSSPageSize: true }),
            contentType: "application/pdf",
            warnings,
          };
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    return result;
  } finally {
    await tab.close();
  }
}
