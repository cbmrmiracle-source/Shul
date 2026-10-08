import type { ScheduleGroup } from "@/lib/schedule/rules";
import type { ScheduleRow } from "./data";

/** A shiur with no time of its own uses the davening row with the same name (e.g. "Shiur in Likutei Sichos"). */
export function scheduleTimeFor(schedule: Record<ScheduleGroup, ScheduleRow[]>, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const t = norm(title);
  if (!t) return "";
  const rows = Object.values(schedule).flat();
  // Partial matches only for long labels, so "Mincha" never matches "Shiur before Mincha".
  const row =
    rows.find((r) => norm(r.label) === t) ??
    rows.find((r) => {
      const l = norm(r.label);
      return l.length >= 8 && t.length >= 8 && (l.includes(t) || t.includes(l));
    });
  return row?.display ?? "";
}
