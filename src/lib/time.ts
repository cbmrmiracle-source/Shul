/**
 * Clock times are stored as minutes after local midnight (0–1439), so they are
 * timezone-free once computed and easy to add offsets to.
 */

export type RoundMode = "nearest" | "floor" | "ceil";
export type Round5Mode = "none" | "down5" | "up5" | "nearest5";

/** A value shown in a davening/zmanim slot: one or more clock times, or free text ("B'zman"). */
export type TimeValue = { times: number[] } | { text: string };

/** Convert a Date to local minutes-after-midnight in `timeZone`, rounding seconds per `mode`. */
export function toLocalMinutes(date: Date, timeZone: string, mode: RoundMode = "nearest"): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const totalSeconds = get("hour") * 3600 + get("minute") * 60 + get("second");
  const exact = totalSeconds / 60;
  const rounded =
    mode === "floor" ? Math.floor(exact) : mode === "ceil" ? Math.ceil(exact) : Math.round(exact);
  return ((rounded % 1440) + 1440) % 1440;
}

export function roundTo5(minutes: number, mode: Round5Mode): number {
  switch (mode) {
    case "down5":
      return Math.floor(minutes / 5) * 5;
    case "up5":
      return Math.ceil(minutes / 5) * 5;
    case "nearest5":
      return Math.round(minutes / 5) * 5;
    default:
      return minutes;
  }
}

function split(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return { h12: h24 % 12 === 0 ? 12 : h24 % 12, m, pm: h24 >= 12 };
}

/** "7:27PM" — the house style used in the newsletter and posters. */
export function formatTime(minutes: number): string {
  const { h12, m, pm } = split(minutes);
  return `${h12}:${String(m).padStart(2, "0")}${pm ? "PM" : "AM"}`;
}

/**
 * Format several times compactly, sharing the AM/PM suffix when all match:
 *   [390, 450]      → "6:30 / 7:30AM"
 *   [420, 495, 540] → "7 / 8:15 / 9AM"
 */
export function formatTimes(times: number[]): string {
  if (times.length === 0) return "";
  if (times.length === 1) return formatTime(times[0]);
  const parts = times.map(split);
  const samePeriod = parts.every((p) => p.pm === parts[0].pm);
  const short = (p: ReturnType<typeof split>) =>
    p.m === 0 ? `${p.h12}` : `${p.h12}:${String(p.m).padStart(2, "0")}`;
  if (samePeriod) {
    return parts.map(short).join(" / ") + (parts[0].pm ? "PM" : "AM");
  }
  return parts.map((p) => short(p) + (p.pm ? "PM" : "AM")).join(" / ");
}

export function formatTimeValue(value: TimeValue | null | undefined): string {
  if (!value) return "";
  return "text" in value ? value.text : formatTimes(value.times);
}

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i;

/**
 * Parse what a person types into an override box. Accepts "6:50 PM", "6:50pm",
 * "7 / 8:15 / 9AM", "6:30, 7:30 am". A trailing AM/PM applies to earlier parts
 * that lack one. Anything unparseable is kept as free text.
 */
export function parseTimeValue(input: string): TimeValue | null {
  const raw = input.trim();
  if (!raw) return null;
  const pieces = raw.split(/\s*(?:\/|,|&|\band\b)\s*/i).filter(Boolean);
  const parsed: { h: number; m: number; period?: "am" | "pm" }[] = [];
  for (const piece of pieces) {
    const match = TIME_RE.exec(piece.replace(/\./g, "").trim());
    if (!match) return { text: raw };
    const h = Number(match[1]);
    const m = Number(match[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return { text: raw };
    const p = match[3]?.toLowerCase();
    parsed.push({ h, m, period: p ? (p.startsWith("p") ? "pm" : "am") : undefined });
  }
  let trailing: "am" | "pm" | undefined;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].period) trailing = parsed[i].period;
    else parsed[i].period = trailing;
  }
  if (parsed.some((p) => !p.period)) return { text: raw };
  return {
    times: parsed.map(({ h, m, period }) => (h % 12) * 60 + m + (period === "pm" ? 720 : 0)),
  };
}
