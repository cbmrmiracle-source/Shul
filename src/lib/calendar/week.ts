import { HDate, HebrewCalendar, Locale, Location, Sedra, flags, gematriya } from "@hebcal/core";
import { addDays, civilToLocalNoon, formatGregorianShort, weekday, weekdayName } from "./dates";
import { computeZmanim, type DayZmanim, type ZmanimSettings } from "./zmanim";

/**
 * House spellings applied on top of Hebcal's Ashkenazi transliteration.
 * Kept small on purpose; editable per organization in settings.
 */
export const DEFAULT_HOUSE_SPELLINGS: Record<string, string> = {
  Bereshis: "Bereishis",
  "Lech-Lecha": "Lech Lecha",
  "Chayei Sara": "Chayei Sarah",
  Vayetzei: "Vayeitzei",
  Miketz: "Mikeitz",
  Shmini: "Shemini",
  "Achrei Mos": "Acharei Mos",
  "Sh'lach": "Shelach",
  "Ha'Azinu": "Haazinu",
  "Vezos Haberakhah": "V'zos HaBrachah",
};

export type CalendarEventKind =
  | "holiday"
  | "roshChodesh"
  | "fast"
  | "special"
  | "mevarchim"
  | "molad"
  | "minor"
  | "omer"
  | "other";

export interface CalendarEvent {
  date: string;
  kind: CalendarEventKind;
  title: string;
  titleHe: string;
}

export interface HebrewDateInfo {
  day: number;
  month: string;
  year: number;
  /** "16 Elul" */
  en: string;
  /** "ט״ז אלול" */
  he: string;
}

export interface DayInfo {
  date: string;
  weekday: string;
  gregorianShort: string;
  hebrew: HebrewDateInfo;
  zmanim: DayZmanim;
  /** Candles are lit this evening (Erev Shabbos / Erev Yom Tov). */
  lightsCandles: boolean;
  /** Shabbos or Yom Tov ends this evening. */
  holyDayEnds: boolean;
}

export interface WeekCalendar {
  shabbosDate: string;
  /** Friday through the following Thursday. */
  days: DayInfo[];
  parsha: { en: string; he: string; isChag: boolean } | null;
  /** "Parshas Ki Savo" / "פרשת כי תבוא" (or the Yom Tov name). */
  shabbosTitle: { en: string; he: string };
  hebrewYear: number;
  /** "תשפ״ו" */
  hebrewYearHe: string;
  events: CalendarEvent[];
  molad: string | null;
}

function stripNikud(s: string): string {
  // Maqaf (U+05BE) falls inside the nikud range, so turn it into a space first.
  return s.replace(/־/g, " ").replace(/[֑-ׇ]/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applySpellings(name: string, spellings: Record<string, string>): string {
  let out = name;
  const entries = Object.entries(spellings).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    out = out.replace(new RegExp(`(?<![\\w'])${escapeRegExp(from)}(?![\\w'])`, "g"), to);
  }
  return out;
}

function hebrewDateInfo(hd: HDate): HebrewDateInfo {
  const month = Locale.gettext(hd.getMonthName(), "ashkenazi");
  const monthHe = Locale.gettext(hd.getMonthName(), "he-x-NoNikud");
  return {
    day: hd.getDate(),
    month,
    year: hd.getFullYear(),
    en: `${hd.getDate()} ${month}`,
    he: `${gematriya(hd.getDate())} ${monthHe}`,
  };
}

function classify(mask: number): CalendarEventKind | null {
  if (mask & (flags.DAF_YOMI | flags.MISHNA_YOMI | flags.NACH_YOMI | flags.YERUSHALMI_YOMI))
    return null;
  if (mask & (flags.DAILY_LEARNING | flags.HEBREW_DATE | flags.USER_EVENT | flags.MODERN_HOLIDAY))
    return null;
  if (mask & (flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS | flags.YOM_TOV_ENDS)) return null;
  if (mask & (flags.PARSHA_HASHAVUA | flags.YOM_KIPPUR_KATAN | flags.KIDDUSH_LEVANA)) return null;
  if (mask & flags.CHANUKAH_CANDLES) return null;
  if (mask & flags.MOLAD) return "molad";
  if (mask & flags.SHABBAT_MEVARCHIM) return "mevarchim";
  if (mask & flags.ROSH_CHODESH) return "roshChodesh";
  if (mask & (flags.MAJOR_FAST | flags.MINOR_FAST)) return "fast";
  if (mask & flags.SPECIAL_SHABBAT) return "special";
  if (mask & flags.OMER_COUNT) return "omer";
  if (mask & (flags.CHAG | flags.CHOL_HAMOED | flags.EREV)) return "holiday";
  if (mask & flags.MINOR_HOLIDAY) return "minor";
  return "other";
}

/**
 * Everything the calendar knows about the week of a given Shabbos
 * (Friday through the following Thursday), for a diaspora location.
 */
export function computeWeek(
  shabbosDate: string,
  zmanimSettings: ZmanimSettings,
  spellings: Record<string, string> = DEFAULT_HOUSE_SPELLINGS,
): WeekCalendar {
  if (weekday(shabbosDate) !== 6) throw new Error(`${shabbosDate} is not a Shabbos`);

  const friday = addDays(shabbosDate, -1);
  const thursday = addDays(shabbosDate, 5);
  const location = new Location(
    zmanimSettings.latitude,
    zmanimSettings.longitude,
    false,
    zmanimSettings.timezone,
  );

  const hebcalEvents = HebrewCalendar.calendar({
    start: civilToLocalNoon(friday),
    end: civilToLocalNoon(thursday),
    location,
    il: false,
    candlelighting: true,
    sedrot: false,
    molad: true,
    shabbatMevarchim: true,
    omer: true,
    locale: "ashkenazi",
  });

  const days: DayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(friday, i);
    days.push({
      date,
      weekday: weekdayName(date),
      gregorianShort: formatGregorianShort(date),
      hebrew: hebrewDateInfo(new HDate(civilToLocalNoon(date))),
      zmanim: computeZmanim(date, zmanimSettings),
      lightsCandles: false,
      holyDayEnds: false,
    });
  }
  const dayByDate = new Map(days.map((d) => [d.date, d]));

  const events: CalendarEvent[] = [];
  let molad: string | null = null;
  for (const ev of hebcalEvents) {
    const date = ev.getDate().greg().toLocaleDateString("en-CA");
    const day = dayByDate.get(date);
    const mask = ev.getFlags();
    if (day && mask & (flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS)) day.lightsCandles = true;
    if (day && mask & flags.YOM_TOV_ENDS) day.holyDayEnds = true;
    const kind = classify(mask);
    if (!kind) continue;
    const title = applySpellings(ev.render("ashkenazi"), spellings);
    if (kind === "molad") molad = title;
    events.push({ date, kind, title, titleHe: stripNikud(ev.render("he-x-NoNikud")) });
  }
  // Hebcal reports Havdalah only via YOM_TOV_ENDS for Yom Tov; regular Shabbos always ends.
  dayByDate.get(shabbosDate)!.holyDayEnds = true;
  dayByDate.get(friday)!.lightsCandles = true;

  const hdShabbos = new HDate(civilToLocalNoon(shabbosDate));
  const sedra = new Sedra(hdShabbos.getFullYear(), false).lookup(hdShabbos);
  const names = sedra.parsha ?? [];
  const en = applySpellings(names.map((n) => Locale.gettext(n, "ashkenazi")).join("-"), spellings);
  const he = stripNikud(names.map((n) => Locale.gettext(n, "he-x-NoNikud")).join("-"));
  const parsha = names.length ? { en, he, isChag: Boolean(sedra.chag) } : null;

  const shabbosTitle = !parsha
    ? { en: "Shabbos", he: "שבת" }
    : parsha.isChag
      ? { en, he }
      : { en: `Parshas ${en}`, he: `פרשת ${he}` };

  return {
    shabbosDate,
    days,
    parsha,
    shabbosTitle,
    hebrewYear: hdShabbos.getFullYear(),
    hebrewYearHe: gematriya(hdShabbos.getFullYear() % 1000),
    events,
    molad,
  };
}
