import { describe, expect, it } from "vitest";
import { eventDateLabel, eventDayName, startMinutes } from "@/lib/render/event-day";

const ENDS = 18 * 60 + 11; // 6:11PM

describe("event day names", () => {
  it("reads the start time", () => {
    expect(startMinutes("8:00PM")).toBe(20 * 60);
    expect(startMinutes("7:30-9:30 pm")).toBe(19 * 60 + 30);
    expect(startMinutes("10:30 AM")).toBe(10 * 60 + 30);
    expect(startMinutes("12:00 pm")).toBe(12 * 60);
    expect(startMinutes("after Mincha")).toBeNull();
  });

  it("says Shabbos or Motzei Shabbos on a Saturday", () => {
    expect(eventDayName("2026-11-14", "10:30AM", ENDS)).toBe("Shabbos");
    expect(eventDayName("2026-11-14", "5:00PM", ENDS)).toBe("Shabbos");
    expect(eventDayName("2026-11-14", "8:00PM", ENDS)).toBe("Motzei Shabbos");
    expect(eventDayName("2026-11-14", "6:11PM", ENDS)).toBe("Motzei Shabbos");
    expect(eventDayName("2026-11-14", "Motzei Shabbos, 30 min after Shabbos", ENDS)).toBe("Motzei Shabbos");
    expect(eventDayName("2026-11-14", "", ENDS)).toBe("Shabbos");
  });

  it("uses the plain weekday on other days", () => {
    expect(eventDayName("2026-11-15", "8:00PM", ENDS)).toBe("Sunday");
    expect(eventDateLabel("2026-11-14", "Motzei Shabbos", "long")).toBe("Motzei Shabbos, November 14");
    expect(eventDateLabel("2026-11-15", "Sunday", "short")).toBe("Sunday, Nov 15");
  });
});
