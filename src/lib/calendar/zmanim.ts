import { GeoLocation, Zmanim } from "@hebcal/core";
import { toLocalMinutes, type RoundMode } from "@/lib/time";
import { civilToLocalNoon } from "./dates";
import { ZMAN_KEYS, type DayZmanim, type ZmanKey } from "./zman-keys";

export { ZMAN_KEYS, ZMAN_LABELS, type DayZmanim, type ZmanKey } from "./zman-keys";

export interface ZmanimSettings {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  /** Minutes before sunset. Chabad.org uses 18 for most places. */
  candleLightingMinutes: number;
  /** Solar depression for Shabbos/Yom Tov end. Chabad.org's regular time matches 8.5°. */
  shabbosEndsDegrees: number;
  /** Solar depression for weekday nightfall. 6° matched the sample's Sunday Maariv. */
  tzeisDegrees: number;
  /** How seconds are rounded per zman; defaults to nearest minute. */
  rounding: Partial<Record<ZmanKey, RoundMode>>;
}

export const DEFAULT_ZMANIM_SETTINGS: ZmanimSettings = {
  // Chabad of Inverrary, 6700 NW 44th St, Lauderhill FL 33319
  latitude: 26.1789,
  longitude: -80.2286,
  elevation: 0,
  timezone: "America/New_York",
  candleLightingMinutes: 18,
  shabbosEndsDegrees: 8.5,
  tzeisDegrees: 6,
  rounding: {},
};


/** Compute zmanim for a civil date ("YYYY-MM-DD") as local minutes after midnight. */
export function computeZmanim(civilDate: string, settings: ZmanimSettings): DayZmanim {
  const gloc = new GeoLocation(
    null,
    settings.latitude,
    settings.longitude,
    settings.elevation,
    settings.timezone,
  );
  const z = new Zmanim(gloc, civilToLocalNoon(civilDate), false);
  const sunset = z.sunset();

  const raw: Record<ZmanKey, Date> = {
    alos: z.alosBaalHatanya(),
    sunrise: z.sunrise(),
    sofZmanShma: z.sofZmanShmaBaalHatanya(),
    sofZmanTefillah: z.sofZmanTfilaBaalHatanya(),
    chatzos: z.chatzot(),
    minchaGedola: z.minchaGedolaBaalHatanya(),
    minchaKetana: z.minchaKetanaBaalHatanya(),
    plagHamincha: z.plagHaminchaBaalHatanya(),
    sunset,
    candleLighting: new Date(sunset.getTime() - settings.candleLightingMinutes * 60_000),
    tzeis: z.tzeit(settings.tzeisDegrees),
    shabbosEnds: z.tzeit(settings.shabbosEndsDegrees),
  };

  const out = {} as DayZmanim;
  for (const key of ZMAN_KEYS) {
    const d = raw[key];
    out[key] =
      d instanceof Date && !Number.isNaN(d.getTime())
        ? toLocalMinutes(d, settings.timezone, settings.rounding[key] ?? "nearest")
        : null;
  }
  return out;
}
