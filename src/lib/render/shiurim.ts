import type { RenderData, RenderItem } from "./data";

/** One line on the Shiurim poster. */
export interface ShiurEntry {
  title: string;
  day: string;
  time: string;
  speaker: string;
  location: string;
  audience: string;
  description: string;
}

export interface ShiurDay {
  day: string;
  shiurim: ShiurEntry[];
}

// Poster order follows the week as printed elsewhere: Friday, Shabbos, then Sunday–Thursday.
const DAY_ORDER = ["friday", "shabbos", "sunday", "monday", "tuesday", "wednesday", "thursday"];
const DAY_ALIASES: Record<string, string> = { saturday: "shabbos", shabbat: "shabbos", sat: "shabbos", fri: "friday", sun: "sunday", mon: "monday", tue: "tuesday", tues: "tuesday", wed: "wednesday", thu: "thursday", thurs: "thursday" };

function dayRank(day: string): number {
  const first = day.trim().toLowerCase().split(/[\s,–—-]+/)[0] ?? "";
  const key = DAY_ALIASES[first] ?? first;
  const i = DAY_ORDER.indexOf(key);
  return i === -1 ? DAY_ORDER.length : i;
}

function minutes(time: string): number {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(time);
  if (!m) return 24 * 60;
  return (Number(m[1]) % 12) * 60 + Number(m[2] ?? 0) + (m[3].toLowerCase() === "pm" ? 720 : 0);
}

function weekdayOf(civil: string | null): string {
  if (!civil) return "";
  const [y, mo, d] = civil.split("-").map(Number);
  const n = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbos"][n];
}

/** Day, then time: the automatic order for shiurim. */
export function sortShiurItems<T extends { fields: Record<string, string>; eventDate: string | null; eventTime: string }>(
  items: T[],
): T[] {
  const day = (i: T) => i.fields.day || weekdayOf(i.eventDate);
  return [...items].sort((a, b) => dayRank(day(a)) - dayRank(day(b)) || minutes(a.eventTime) - minutes(b.eventTime));
}

const isSichos = (s: string) => /sicha|sichos/i.test(s);

/**
 * The week's shiurim for the Shiurim poster: every Shiur item ticked for it,
 * plus the Likutei Sichos shiur from the davening schedule when no ticked
 * item already covers it. Grouped by day (Friday, Shabbos, Sunday…), by time,
 * unless the shiurim were put in order by hand: then that order is kept and
 * days appear in the order their first shiur does.
 */
export function collectShiurim(d: Pick<RenderData, "items" | "schedule" | "manualShiurOrder">): ShiurDay[] {
  const items: RenderItem[] = (d.items.poster_shiurim ?? []).filter((i) => i.type === "shiur");
  const entries: ShiurEntry[] = items.map((i) => ({
    title: i.title,
    day: i.fields.day || weekdayOf(i.eventDate),
    time: i.eventTime,
    speaker: i.fields.speaker ?? "",
    location: i.fields.location ?? "",
    audience: i.fields.audience ?? "",
    description: i.body,
  }));

  if (!entries.some((e) => isSichos(e.title))) {
    for (const [group, day] of [["friday", "Friday"], ["shabbos", "Shabbos"], ["sunday", "Sunday"], ["weekday", "Monday – Thursday"]] as const) {
      const row = d.schedule[group].find((r) => isSichos(r.label));
      if (row) {
        const sicha = { title: row.label, day, time: row.display, speaker: "", location: "", audience: "", description: row.note };
        // In a hand-set order, put it after the last shiur on the same day or earlier.
        const at = d.manualShiurOrder ? entries.findLastIndex((e) => dayRank(e.day) <= dayRank(day)) + 1 : entries.length;
        entries.splice(at, 0, sicha);
        break;
      }
    }
  }

  const ordered = d.manualShiurOrder
    ? entries
    : [...entries].sort((a, b) => dayRank(a.day) - dayRank(b.day) || minutes(a.time) - minutes(b.time));
  const days = new Map<string, ShiurEntry[]>();
  for (const e of ordered) {
    const key = e.day || "This Week";
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  return [...days].map(([day, shiurim]) => ({ day, shiurim }));
}
