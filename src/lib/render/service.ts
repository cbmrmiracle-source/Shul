import "server-only";
import type { Week } from "@/db/schema";
import type { PublicationKey } from "@/lib/content/types";
import { buildRenderData } from "./data";
import { renderOutput, type RenderResult } from "./renderer";
import { TEMPLATES } from "./templates";

/** Render one publication for a week. Throws if the publication has no template yet. */
export async function renderPublication(week: Week, key: PublicationKey, format: "png" | "pdf"): Promise<RenderResult> {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`No template for ${key} yet`);
  if (!template.formats.includes(format)) throw new Error(`${key} isn't available as ${format.toUpperCase()}`);
  const data = await buildRenderData(week);
  const result = await renderOutput(template, data, format);
  const pending = data.pendingCount[key] ?? 0;
  return pending
    ? {
        ...result,
        warnings: [
          `${pending} item${pending === 1 ? " is" : "s are"} placed here but not reviewed yet, so ${pending === 1 ? "it is" : "they are"} left out.`,
          ...result.warnings,
        ],
      }
    : result;
}

/** File name like "Ki-Savo-5786-whatsapp_shabbos.png". */
export function outputFileName(week: Week, key: string, format: string): string {
  const title = (week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en)
    .replace(/^Parshas\s+/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${title || week.shabbosDate}-${week.calendarAuto.hebrewYear}-${key}.${format}`;
}
