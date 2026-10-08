import { HDate, HebrewCalendar, Locale, gematriya, gematriyaStrToNum } from "@hebcal/core";
import { civilToLocalNoon, isCivilDate } from "./dates";

/**
 * A Hebrew date as typed in a spreadsheet. The year is optional (many lists
 * only record day and month). `month` uses Hebcal's numbering: Nisan = 1 …
 * Adar I = 12, Adar II = 13 (plain "Adar" in a non-leap year is 12).
 */
export interface HebrewDateParts {
  day: number;
  month: number;
  year?: number;
}

const MONTH_ALIASES: Record<string, string> = {
  marcheshvan: "Cheshvan",
  "mar cheshvan": "Cheshvan",
  "menachem av": "Av",
  tamuz: "Tamuz",
  tammuz: "Tamuz",
  teves: "Tevet",
  shevat: "Shvat",
  "adar 1": "Adar I",
  "adar 2": "Adar II",
  "adar a": "Adar I",
  "adar b": "Adar II",
  "adar rishon": "Adar I",
  "adar sheni": "Adar II",
  מרחשון: "Cheshvan",
  "מר חשון": "Cheshvan",
  "מנחם אב": "Av",
  "אדר א": "Adar I",
  "אדר ב": "Adar II",
  "אדר ראשון": "Adar I",
  "אדר שני": "Adar II",
};

const HEBREW_LETTERS = /[א-ת]/;

function cleanHebrew(s: string): string {
  return s.replace(/[֑-ׇ]/g, "").replace(/[׳״'"`]/g, "").trim();
}

/** Month name (English or Hebrew, many spellings) → Hebcal month number, or null. */
export function parseMonthName(raw: string): { month: number; plainAdar: boolean } | null {
  const name = cleanHebrew(raw).replace(/\s+/g, " ").replace(/[.,]/g, "").trim();
  if (!name) return null;
  const alias = MONTH_ALIASES[name.toLowerCase()] ?? MONTH_ALIASES[name];
  const candidate = alias ?? name;
  const plainAdar = /^(adar|אדר)$/i.test(candidate);
  try {
    const month = HDate.monthFromName(candidate);
    // Hebcal maps plain "Adar" to Adar II; in a non-leap year that's month 12.
    return { month: plainAdar ? 12 : month, plainAdar };
  } catch {
    return null;
  }
}

function parseHebrewNumber(token: string): number | null {
  const t = cleanHebrew(token);
  if (!t || !HEBREW_LETTERS.test(t)) return null;
  const n = gematriyaStrToNum(t);
  return n > 0 ? n : null;
}

function parseYear(token: string): number | null {
  const t = token.trim();
  if (/^\d{4}$/.test(t)) {
    const n = Number(t);
    return n >= 5000 && n < 6000 ? n : null;
  }
  let h = cleanHebrew(t);
  // "התשפד" / "ה'תשפ"ד": leading ה is the thousands (5000).
  if (h.length >= 3 && h.startsWith("ה") && h[1] === "ת") h = h.slice(1);
  const n = parseHebrewNumber(h);
  return n !== null && n >= 100 ? 5000 + n : null;
}

/**
 * Parse a Hebrew date written in any of the common ways:
 *   "16 Elul", "Elul 16", "16 Elul 5784", "Elul 16, 5784",
 *   "ט״ז אלול", "כ"א אלול התשפ"ד", "21 אלול"
 * Returns null if it can't be read with confidence.
 */
export function parseHebrewDate(input: string): HebrewDateParts | null {
  const text = input.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  const tokens = text.split(" ");

  // Try every split into [day][month…][year?] or [month…][day][year?].
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j <= tokens.length; j++) {
      const monthInfo = parseMonthName(tokens.slice(i, j).join(" "));
      if (!monthInfo) continue;
      const before = tokens.slice(0, i);
      const after = tokens.slice(j);
      const dayTok = before.length === 1 ? before[0] : before.length === 0 ? after[0] : undefined;
      const rest = before.length === 1 ? after : after.slice(1);
      if (dayTok === undefined || rest.length > 1) continue;
      const day = /^\d{1,2}$/.test(dayTok) ? Number(dayTok) : parseHebrewNumber(dayTok);
      if (!day || day < 1 || day > 30) continue;
      let year: number | undefined;
      if (rest.length === 1) {
        const y = parseYear(rest[0]);
        if (y === null) continue;
        year = y;
      }
      let month = monthInfo.month;
      // Plain "Adar" with a leap year is ambiguous; follow Hebcal and treat it as Adar II.
      if (monthInfo.plainAdar && year && HDate.isLeapYear(year)) month = 13;
      if (month === 13 && year && !HDate.isLeapYear(year)) month = 12;
      return { day, month, year };
    }
  }
  return null;
}

/** Convert a Gregorian birth/death date to Hebrew, moving to the next day if after sunset. */
export function hebrewFromGregorian(civil: string, afterSunset = false): HebrewDateParts {
  if (!isCivilDate(civil)) throw new Error(`Invalid date ${civil}`);
  let hd = new HDate(civilToLocalNoon(civil));
  if (afterSunset) hd = hd.next();
  return { day: hd.getDate(), month: hd.getMonth(), year: hd.getFullYear() };
}

/**
 * A year in which this day/month exists, used when the original year is
 * unknown: a leap year for Adar II, otherwise a regular year. (For Adar I vs
 * plain Adar the anniversary rules give the same result either way.)
 */
function referenceYear(parts: HebrewDateParts): number {
  const leap = parts.month === 13;
  for (let y = 5780; y < 5800; y++) {
    if (HDate.isLeapYear(y) === leap && parts.day <= HDate.daysInMonth(parts.month, y)) return y;
  }
  return 5785;
}

/**
 * When this yahrzeit or Hebrew birthday falls in `hebrewYear`, following the
 * standard rules for Adar in leap years and 30 Cheshvan/Kislev (via Hebcal).
 */
export function anniversaryInYear(
  kind: "yahrzeit" | "birthday",
  parts: HebrewDateParts,
  hebrewYear: number,
): HDate | null {
  const original = new HDate(parts.day, parts.month, parts.year ?? referenceYear(parts));
  if (parts.year && hebrewYear <= parts.year) return null;
  const result =
    kind === "yahrzeit"
      ? HebrewCalendar.getYahrzeit(hebrewYear, original)
      : HebrewCalendar.getBirthdayOrAnniversary(hebrewYear, original);
  return result ?? null;
}

/** Hebrew-date occurrences within [start, end] (civil dates, inclusive). */
export function anniversariesBetween(
  kind: "yahrzeit" | "birthday",
  parts: HebrewDateParts,
  start: string,
  end: string,
): HDate[] {
  const s = new HDate(civilToLocalNoon(start));
  const e = new HDate(civilToLocalNoon(end));
  const out: HDate[] = [];
  for (const y of new Set([s.getFullYear(), e.getFullYear()])) {
    const hd = anniversaryInYear(kind, parts, y);
    if (hd && hd.abs() >= s.abs() && hd.abs() <= e.abs()) out.push(hd);
  }
  return out;
}

/** "16 Elul" or "16 Elul 5784" */
export function formatHebrewDateEn(parts: HebrewDateParts): string {
  const name = Locale.gettext(monthName(parts), "ashkenazi");
  return `${parts.day} ${name}${parts.year ? ` ${parts.year}` : ""}`;
}

/** "ט״ז אלול" or "כ״א אלול תשפ״ד" */
export function formatHebrewDateHe(parts: HebrewDateParts): string {
  const name = Locale.gettext(monthName(parts), "he-x-NoNikud");
  return `${gematriya(parts.day)} ${name}${parts.year ? ` ${gematriya(parts.year % 1000)}` : ""}`;
}

function monthName(parts: HebrewDateParts): string {
  const year = parts.year ?? referenceYear(parts);
  return new HDate(1, parts.month, year).getMonthName();
}
