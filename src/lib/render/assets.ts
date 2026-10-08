import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Artwork taken from the shul's existing poster designs (Weeklys.pdf),
 * embedded into templates as data URLs.
 */
export const TEMPLATE_ASSETS = {
  sichaBackground: "sicha-bg.jpg",
  farbrengenBackground: "farbrengen-bg.jpg",
  kidsLogo: "kids-logo.png",
  kidsGirls: "kids-girls.png",
  kidsToddlers: "kids-toddlers.png",
  kidsGirlsDavening: "kids-girls-davening.png",
  kidsFatherSon: "kids-father-son.png",
  badgeBack: "badge-back.png",
} as const;
export type TemplateAsset = keyof typeof TEMPLATE_ASSETS;

const cache = new Map<string, string>();

export function assetDataUrl(name: TemplateAsset): string {
  const file = TEMPLATE_ASSETS[name];
  const hit = cache.get(file);
  if (hit) return hit;
  const data = readFileSync(path.join(process.cwd(), "assets/templates", file)).toString("base64");
  const url = `data:${file.endsWith(".jpg") ? "image/jpeg" : "image/png"};base64,${data}`;
  cache.set(file, url);
  return url;
}
