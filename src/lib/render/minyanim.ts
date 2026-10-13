import type { ScheduleRow } from "./data";
import { dayRangeLabel, type DaySection } from "@/lib/schedule/days";
import { formatTimesLong, type TimeValue } from "@/lib/time";

/**
 * Weekday davening summarized for the "This Week's Minyanim" image:
 *   SHACHRIS: Sunday - 7:00, 8:15 & 9:00 am / Monday-Friday - 6:30 & 7:30 am
 *   MINCHA: 7:30 pm
 *   MAARIV: Sunday - 8:06 pm / Monday-Thursday - B'zman
 * Built from the week's day sections, so a Tuesday with a different Mincha
 * shows as "Sunday-Monday - 7:30 pm / Tuesday - 7:00 pm / Wednesday-Thursday - 7:30 pm".
 * Friday is folded in for morning rows (Shachris) when its time matches Thursday's.
 */
export interface MinyanSummary {
  label: string;
  lines: { days: string | null; text: string }[];
}

const normalize = (label: string) =>
  label
    .toLowerCase()
    .replace(/shacharis|shacharit/g, "shachris")
    .replace(/[^a-z]/g, "");

const valueText = (v: TimeValue | null) => (!v ? "" : "text" in v ? v.text : formatTimesLong(v.times));
const isMorning = (v: TimeValue | null) => Boolean(v && "times" in v && v.times[0] < 12 * 60);

export function summarizeMinyanim(sections: DaySection<ScheduleRow>[], friday: ScheduleRow[]): MinyanSummary[] {
  const labels: { key: string; label: string }[] = [];
  for (const sec of sections) {
    for (const r of sec.rows) {
      const key = normalize(r.label);
      if (!labels.some((l) => l.key === key)) labels.push({ key, label: r.label });
    }
  }

  return labels.map(({ key, label }) => {
    // Days and text for this label, merging neighbouring days with the same time.
    const segments: { days: number[]; text: string }[] = [];
    for (const sec of sections) {
      const row = sec.rows.find((r) => normalize(r.label) === key);
      if (!row) continue;
      const text = valueText(row.value);
      const prev = segments[segments.length - 1];
      if (prev && prev.text === text && prev.days[prev.days.length - 1] === sec.days[0] - 1) prev.days.push(...sec.days);
      else segments.push({ days: [...sec.days], text });
    }
    const fri = friday.find((r) => normalize(r.label) === key && isMorning(r.value));
    const last = segments[segments.length - 1];
    const friFolded = Boolean(fri && last && last.days[last.days.length - 1] === 4 && valueText(fri.value) === last.text);
    if (friFolded) last.days.push(5);

    const allDays = segments.flatMap((s) => s.days);
    const coversWeek = [0, 1, 2, 3, 4].every((d) => allDays.includes(d));
    if (segments.length === 1 && coversWeek && (friFolded || !fri)) {
      return { label, lines: [{ days: null, text: segments[0].text }] };
    }
    return { label, lines: segments.map((s) => ({ days: dayRangeLabel(s.days, "-"), text: s.text })) };
  });
}
