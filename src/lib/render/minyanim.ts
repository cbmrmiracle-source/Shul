import type { ScheduleRow } from "./data";
import { formatTimesLong, type TimeValue } from "@/lib/time";

/**
 * Weekday davening summarized for the "This Week's Minyanim" image:
 *   SHACHRIS: Sunday - 7:00, 8:15 & 9:00 am / Monday-Friday - 6:30 & 7:30 am
 *   MINCHA: 7:30 pm
 *   MAARIV: Sunday - 8:06 pm / Monday-Thursday - B'zman
 * Rows are matched across days by label. Friday is folded in for morning
 * rows (Shacharis) when its time matches Monday–Thursday.
 */
export interface MinyanSummary {
  label: string;
  lines: { days: string | null; text: string }[];
}

const normalize = (label: string) =>
  label
    .toLowerCase()
    .replace(/shachris|shacharit/g, "shacharis")
    .replace(/[^a-z]/g, "");

const valueText = (v: TimeValue | null) => (!v ? "" : "text" in v ? v.text : formatTimesLong(v.times));
const isMorning = (v: TimeValue | null) => Boolean(v && "times" in v && v.times[0] < 12 * 60);

export function summarizeMinyanim(sunday: ScheduleRow[], weekday: ScheduleRow[], friday: ScheduleRow[]): MinyanSummary[] {
  const labels: { key: string; label: string }[] = [];
  for (const r of [...sunday, ...weekday]) {
    const key = normalize(r.label);
    if (!labels.some((l) => l.key === key)) labels.push({ key, label: r.label });
  }

  return labels.map(({ key, label }) => {
    const sun = sunday.find((r) => normalize(r.label) === key);
    const wk = weekday.find((r) => normalize(r.label) === key);
    const fri = friday.find((r) => normalize(r.label) === key && isMorning(r.value));
    const wkText = valueText(wk?.value ?? null);
    const friMatches = Boolean(fri && wk && valueText(fri.value) === wkText);
    const weekdayDays = friMatches ? "Monday-Friday" : "Monday-Thursday";

    const sunText = valueText(sun?.value ?? null);
    if (sun && wk && sunText === wkText) {
      return { label, lines: [{ days: friMatches || !fri ? null : "Sunday-Thursday", text: wkText }] };
    }
    const lines: MinyanSummary["lines"] = [];
    if (sun) lines.push({ days: "Sunday", text: sunText });
    if (wk) lines.push({ days: weekdayDays, text: wkText });
    return { label, lines };
  });
}
