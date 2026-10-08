import type { PublicationKey } from "@/lib/content/types";
import type { RenderData } from "../data";
import type { SafeHtml } from "../html";
import * as daveningPoster from "./davening-poster";
import * as whatsappShabbos from "./whatsapp-shabbos";
import * as whatsappWeekly from "./whatsapp-weekly";

export interface OutputTemplate {
  /** CSS pixel size the template is designed at. */
  width: number;
  height: number;
  /** Device pixel ratio for PNG export (540 × 2 = 1080px WhatsApp image). */
  scale: number;
  formats: ("png" | "pdf")[];
  css: string;
  render: (data: RenderData) => SafeHtml;
}

/** Publications that can be generated so far. Others are added in later phases. */
export const TEMPLATES: Partial<Record<PublicationKey, OutputTemplate>> = {
  poster_davening: { ...daveningPoster, width: daveningPoster.WIDTH, height: daveningPoster.HEIGHT, scale: 2, formats: ["png", "pdf"] },
  whatsapp_shabbos: { ...whatsappShabbos, width: whatsappShabbos.WIDTH, height: whatsappShabbos.HEIGHT, scale: 2, formats: ["png"] },
  whatsapp_weekly: { ...whatsappWeekly, width: whatsappWeekly.WIDTH, height: whatsappWeekly.HEIGHT, scale: 2, formats: ["png"] },
};

export function hasTemplate(key: string): key is keyof typeof TEMPLATES {
  return Object.hasOwn(TEMPLATES, key);
}
