/**
 * Render every available output for a week to files, for checking templates.
 *   npm run render -- 2026-08-29 ./out
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildRenderData } from "@/lib/render/data";
import { renderOutput } from "@/lib/render/renderer";
import { TEMPLATES } from "@/lib/render/templates";
import { createWeek } from "@/lib/weeks";

async function main() {
  const [date, outDir = "./out"] = process.argv.slice(2);
  if (!date) throw new Error("Usage: npm run render -- YYYY-MM-DD [outDir]");
  const week = await createWeek(date);
  const data = await buildRenderData(week);
  await mkdir(outDir, { recursive: true });
  for (const [key, template] of Object.entries(TEMPLATES)) {
    for (const format of template!.formats) {
      const pages = format === "png" ? (template!.pages ?? 1) : 1;
      for (let page = 1; page <= pages; page++) {
        const result = await renderOutput(template!, data, format, page);
        const suffix = pages > 1 ? `-p${page}` : "";
        const file = path.join(outDir, `${date}-${key}${suffix}.${format}`);
        await writeFile(file, result.data);
        console.log(file, result.warnings.length ? result.warnings : "");
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
