import { describe, expect, it } from "vitest";
import { buildDaySections, dayRangeLabel, effectiveDays, normalizeDays } from "@/lib/schedule/days";
import { row } from "./fixtures";

describe("day sections", () => {
  const sig = (r: ReturnType<typeof row>) => `${r.label}=${r.display}`;

  it("keeps the usual Sunday / Monday–Thursday split", () => {
    const secs = buildDaySections(
      [row("a", "Shachris", "7AM", [420], "", "sunday"), row("b", "Shachris", "6:30AM", [390], "", "weekday")],
      sig,
    );
    expect(secs.map((s) => dayRangeLabel(s.days))).toEqual(["Sunday", "Monday – Thursday"]);
  });

  it("splits a week where Tuesday is different", () => {
    const secs = buildDaySections(
      [
        row("a", "Shachris", "7AM", [420], "", "sunday"),
        row("b", "Shachris", "6:30AM", [390], "", "weekday"),
        row("c", "Mincha", "7:30PM", [1170], "", "weekday", [1, 3, 4]),
        row("d", "Mincha", "7PM", [1140], "", "weekday", [2]),
      ],
      sig,
    );
    expect(secs.map((s) => dayRangeLabel(s.days))).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday – Thursday"]);
    expect(secs[2].rows.map((r) => r.display)).toEqual(["6:30AM", "7PM"]);
  });

  it("merges Sunday into the weekdays when identical", () => {
    const secs = buildDaySections([row("b", "Mincha", "7:30PM", [1170], "", "weekday", [0, 1, 2, 3, 4])], sig);
    expect(secs.map((s) => dayRangeLabel(s.days))).toEqual(["Sunday – Thursday"]);
  });

  it("labels and normalizes days", () => {
    expect(dayRangeLabel([0, 2], "-")).toBe("Sunday & Tuesday");
    expect(dayRangeLabel([1, 2, 3, 4], "-")).toBe("Monday-Thursday");
    expect(normalizeDays("weekday", [4, 3, 2, 1])).toBeNull();
    expect(normalizeDays("weekday", [2])).toEqual([2]);
    expect(effectiveDays({ group: "friday" })).toBeNull();
    expect(effectiveDays({ group: "sunday", days: null })).toEqual([0]);
  });
});
