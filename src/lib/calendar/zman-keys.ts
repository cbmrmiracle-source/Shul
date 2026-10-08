// Kept free of @hebcal/core so client components can import it cheaply.

/**
 * Zmanim we compute. Where Chabad follows the Alter Rebbe (Baal HaTanya), the
 * Baal HaTanya variant is used so values line up with Chabad.org.
 */
export const ZMAN_KEYS = [
  "alos",
  "sunrise",
  "sofZmanShma",
  "sofZmanTefillah",
  "chatzos",
  "minchaGedola",
  "minchaKetana",
  "plagHamincha",
  "sunset",
  "candleLighting",
  "tzeis",
  "shabbosEnds",
] as const;
export type ZmanKey = (typeof ZMAN_KEYS)[number];

export const ZMAN_LABELS: Record<ZmanKey, string> = {
  alos: "Alos HaShachar",
  sunrise: "Sunrise (Netz)",
  sofZmanShma: "Latest Shema",
  sofZmanTefillah: "Latest Shacharis",
  chatzos: "Chatzos",
  minchaGedola: "Mincha Gedolah",
  minchaKetana: "Mincha Ketanah",
  plagHamincha: "Plag HaMincha",
  sunset: "Sunset (Shkiah)",
  candleLighting: "Candle Lighting",
  tzeis: "Nightfall (Tzeis)",
  shabbosEnds: "Shabbos Ends",
};

/** Local minutes after midnight per zman; null when it does not occur (e.g. polar latitudes). */
export type DayZmanim = Record<ZmanKey, number | null>;
