import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fonts bundled from npm (@fontsource) and embedded into each rendered page
 * as data URLs, so output looks the same on any server with no network access.
 *
 * Substitutes for the Publisher fonts: Rockwell → Roboto Slab, the Hebrew
 * titles → Frank Ruhl Libre, body text → Heebo (Hebrew + Latin),
 * classic serif → Libre Baskerville, display serif → Playfair Display.
 */
const FONTS: { pkg: string; weights: number[] }[] = [
  { pkg: "roboto-slab", weights: [700, 800] },
  { pkg: "frank-ruhl-libre", weights: [500, 700, 900] },
  { pkg: "heebo", weights: [400, 500, 700, 800] },
  { pkg: "libre-baskerville", weights: [400, 700] },
  { pkg: "playfair-display", weights: [700, 800] },
  // Close to Bahnschrift (Farbrengen poster).
  { pkg: "barlow-semi-condensed", weights: [400, 600, 700] },
];
const SUBSETS = /-(latin|latin-ext|hebrew)-\d{3}-normal\.woff2/;

let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached) return cached;
  const parts: string[] = [];
  for (const { pkg, weights } of FONTS) {
    // A plain path (not require.resolve) so it survives Next.js bundling.
    const dir = path.join(process.cwd(), "node_modules", "@fontsource", pkg);
    for (const w of weights) {
      const css = readFileSync(path.join(dir, `${w}.css`), "utf8");
      for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
        if (!file || !SUBSETS.test(file)) continue;
        const data = readFileSync(path.join(dir, "files", file)).toString("base64");
        parts.push(
          block
            .replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${data}) format('woff2');`)
            .replace(/font-display:[^;]+;/, "font-display: block;"),
        );
      }
    }
  }
  cached = parts.join("\n");
  return cached;
}
