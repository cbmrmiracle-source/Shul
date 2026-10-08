import { expect, it } from "vitest";
import { fontFaceCss } from "@/lib/render/fonts";

it("embeds the bundled fonts as data URLs", () => {
  const css = fontFaceCss();
  for (const family of ["Roboto Slab", "Frank Ruhl Libre", "Heebo", "Libre Baskerville", "Playfair Display"]) {
    expect(css).toContain(`font-family: '${family}'`);
  }
  expect(css).not.toMatch(/url\(\.\//);
  expect(css.length).toBeLessThan(3_000_000);
});
