import type { PublicationKey } from "@/lib/content/types";
import type { RenderData } from "../data";
import type { SafeHtml } from "../html";
import * as daveningPoster from "./davening-poster";
import * as newsletter from "./newsletter";
import * as posterFarbrengen from "./poster-farbrengen";
import * as posterKids from "./poster-kids";
import * as posterSicha from "./poster-sicha";
import * as whatsappShabbos from "./whatsapp-shabbos";
import * as whatsappWeekly from "./whatsapp-weekly";

export interface OutputTemplate {
  /** CSS pixel size the template is designed at. */
  width: number;
  height: number;
  /** Device pixel ratio for PNG export (540 × 2 = 1080px WhatsApp image). */
  scale: number;
  /** Number of pages (default 1). Each page is width × height. */
  pages?: number;
  formats: ("png" | "pdf")[];
  /** CSS, or a function returning it (for CSS that embeds artwork, built on first use). */
  css: string | (() => string);
  render: (data: RenderData) => SafeHtml;
}

/** Publications that can be generated so far. Others are added in later phases. */
export const TEMPLATES: Partial<Record<PublicationKey, OutputTemplate>> = {
  newsletter: { ...newsletter, width: newsletter.WIDTH, height: newsletter.HEIGHT, pages: newsletter.PAGES, scale: 2, formats: ["pdf", "png"] },
  poster_davening: { ...daveningPoster, width: daveningPoster.WIDTH, height: daveningPoster.HEIGHT, scale: 2, formats: ["png", "pdf"] },
  poster_farbrengen: { ...posterFarbrengen, width: posterFarbrengen.WIDTH, height: posterFarbrengen.HEIGHT, scale: 2, formats: ["png", "pdf"] },
  poster_kids: { ...posterKids, width: posterKids.WIDTH, height: posterKids.HEIGHT, scale: 2, formats: ["png", "pdf"] },
  poster_sicha: { ...posterSicha, width: posterSicha.WIDTH, height: posterSicha.HEIGHT, scale: 2, formats: ["png", "pdf"] },
  whatsapp_shabbos: { ...whatsappShabbos, width: whatsappShabbos.WIDTH, height: whatsappShabbos.HEIGHT, scale: 2, formats: ["png"] },
  whatsapp_weekly: { ...whatsappWeekly, width: whatsappWeekly.WIDTH, height: whatsappWeekly.HEIGHT, scale: 2, formats: ["png"] },
};

export function hasTemplate(key: string): key is keyof typeof TEMPLATES {
  return Object.hasOwn(TEMPLATES, key);
}
