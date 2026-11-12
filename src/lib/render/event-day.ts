/**
 * Day names for dated events. A Saturday event is "Shabbos", or "Motzei
 * Shabbos" when it starts once Shabbos is over (at or after that Saturday's
 * Shabbos-ends time).
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Minutes after midnight of the first time in text like "8:00PM" or "7:30-9:30 pm"; null if unclear. */
export function startMinutes(text: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(text);
  if (!m) return null;
  // "7:30-9:30PM": the first time takes the am/pm written later.
  const ampm = (m[3] ?? /(am|pm|a\.m\.|p\.m\.)/i.exec(text.slice(m.index))?.[1] ?? "").toLowerCase();
  if (!ampm) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return (hour % 12) * 60 + Number(m[2] ?? 0) + (ampm.startsWith("p") ? 720 : 0);
}

/**
 * "Monday" … "Friday", "Sunday", "Shabbos" or "Motzei Shabbos".
 * `shabbosEnds` is that Saturday's Shabbos-ends time in minutes (null if unknown).
 */
export function eventDayName(civilDate: string, time: string, shabbosEnds: number | null): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (weekday !== 6) return WEEKDAYS[weekday];
  if (/motzei|motzaei|motz"?sh/i.test(time)) return "Motzei Shabbos";
  const start = startMinutes(time);
  return start !== null && shabbosEnds !== null && start >= shabbosEnds ? "Motzei Shabbos" : "Shabbos";
}

/** "Motzei Shabbos, November 14" (month "long") or "Motzei Shabbos, Nov 14" ("short"). */
export function eventDateLabel(
  civilDate: string,
  dayName: string,
  month: "long" | "short",
): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const md = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month, day: "numeric", timeZone: "UTC" });
  return `${dayName}, ${md}`;
}
