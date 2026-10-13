/**
 * Sunday–Thursday davening rows can apply to any set of days (0 = Sunday …
 * 4 = Thursday). Outputs split the weekdays into sections where consecutive
 * days with identical rows are merged:
 *   normal week           → "Sunday", "Monday – Thursday"
 *   Tuesday Mincha differs → "Sunday", "Monday", "Tuesday", "Wednesday – Thursday"
 * Client-safe.
 */
import type { ScheduleGroup } from "./rules";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbos"];
export const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th"];
/** Days a Sunday–Thursday row can be set to. */
export const SELECTABLE_DAYS = [0, 1, 2, 3, 4];

/** The days a group covers when a row has no explicit days. Null for Friday/Shabbos. */
export function defaultDays(group: ScheduleGroup): number[] | null {
  if (group === "sunday") return [0];
  if (group === "weekday") return [1, 2, 3, 4];
  return null;
}

export function effectiveDays(row: { group: ScheduleGroup; days?: number[] | null }): number[] | null {
  const d = row.days?.length ? row.days : defaultDays(row.group);
  return d ? [...new Set(d)].sort((a, b) => a - b) : null;
}

/** Store null when the days are the group's usual ones. */
export function normalizeDays(group: ScheduleGroup, days: number[]): number[] | null {
  const sorted = [...new Set(days)].filter((d) => SELECTABLE_DAYS.includes(d)).sort((a, b) => a - b);
  const def = defaultDays(group);
  return def && def.length === sorted.length && def.every((d, i) => d === sorted[i]) ? null : sorted;
}

/** Split days into runs of consecutive days: [0,1,3,4] → [[0,1],[3,4]]. */
function runs(days: number[]): number[][] {
  const out: number[][] = [];
  for (const d of [...days].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else out.push([d]);
  }
  return out;
}

/**
 * "Monday – Thursday", "Tuesday", "Sunday & Tuesday".
 * `dash` is the separator inside a range (" – " for headings, "-" for WhatsApp).
 */
export function dayRangeLabel(days: number[], dash = " – "): string {
  return runs(days)
    .map((r) => (r.length === 1 ? WEEKDAY_NAMES[r[0]] : `${WEEKDAY_NAMES[r[0]]}${dash}${WEEKDAY_NAMES[r[r.length - 1]]}`))
    .join(" & ");
}

export interface DaySection<R> {
  days: number[];
  rows: R[];
}

/**
 * Group Sunday–Thursday rows (already in display order) into day sections.
 * `signature` decides when two days are "the same" (label + value).
 */
export function buildDaySections<R extends { group: ScheduleGroup; days?: number[] | null }>(
  rows: R[],
  signature: (row: R) => string,
): DaySection<R>[] {
  const weekdayRows = rows.filter((r) => r.group === "sunday" || r.group === "weekday");
  const perDay = SELECTABLE_DAYS.map((day) => weekdayRows.filter((r) => effectiveDays(r)?.includes(day)));
  const sections: DaySection<R>[] = [];
  perDay.forEach((dayRows, day) => {
    if (dayRows.length === 0) return;
    const sig = dayRows.map(signature).join("|");
    const prev = sections[sections.length - 1];
    const prevSig = prev?.rows.map(signature).join("|");
    if (prev && prev.days[prev.days.length - 1] === day - 1 && prevSig === sig) prev.days.push(day);
    else sections.push({ days: [day], rows: dayRows });
  });
  return sections;
}
