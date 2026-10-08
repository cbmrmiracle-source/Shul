import { describe, expect, it } from "vitest";
import { computeWeek } from "@/lib/calendar/week";
import { DEFAULT_ZMANIM_SETTINGS } from "@/lib/calendar/zmanim";
import { addDays, isCivilDate, shabbosOnOrAfter } from "@/lib/calendar/dates";
import { formatTime } from "@/lib/time";

describe("dates", () => {
  it("finds the coming Shabbos", () => {
    expect(shabbosOnOrAfter("2026-08-25")).toBe("2026-08-29");
    expect(shabbosOnOrAfter("2026-08-29")).toBe("2026-08-29");
    expect(shabbosOnOrAfter("2026-08-30")).toBe("2026-09-05");
  });
  it("validates and adds", () => {
    expect(isCivilDate("2026-02-30")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("week of Ki Savo 5786 (the sample newsletter)", () => {
  const week = computeWeek("2026-08-29", DEFAULT_ZMANIM_SETTINGS);
  const friday = week.days[0];
  const shabbos = week.days[1];
  const sunday = week.days[2];

  it("has the right parsha and dates", () => {
    expect(week.shabbosTitle).toEqual({ en: "Parshas Ki Savo", he: "פרשת כי תבוא" });
    expect(week.hebrewYearHe).toBe("תשפ״ו");
    expect(friday.hebrew.en).toBe("15 Elul");
    expect(friday.gregorianShort).toBe("Aug 28");
    expect(shabbos.hebrew.he).toBe("ט״ז אלול");
    expect(week.days).toHaveLength(7);
  });

  it("matches the published zmanim to within a minute", () => {
    const near = (actual: number | null, expected: number) =>
      expect(Math.abs((actual ?? -999) - expected)).toBeLessThanOrEqual(1);
    near(friday.zmanim.candleLighting, 19 * 60 + 27); // 7:27PM
    near(shabbos.zmanim.shabbosEnds, 20 * 60 + 18); // 8:18PM
    near(sunday.zmanim.tzeis, 20 * 60 + 6); // Sunday Maariv 8:06PM
    expect(formatTime(friday.zmanim.candleLighting!)).toMatch(/^7:2[67]PM$/);
  });
});

describe("special weeks", () => {
  it("names a Yom Tov Shabbos and flags Yom Tov candle lighting", () => {
    const week = computeWeek("2026-10-03", DEFAULT_ZMANIM_SETTINGS);
    expect(week.parsha?.isChag).toBe(true);
    expect(week.shabbosTitle.en).toBe("Shemini Atzeres");
    // Simchas Torah ends Sunday night
    expect(week.days[2].holyDayEnds).toBe(true);
  });

  it("lists Rosh Chodesh, Mevorchim and the molad", () => {
    const week = computeWeek("2026-10-10", DEFAULT_ZMANIM_SETTINGS);
    expect(week.shabbosTitle.en).toBe("Parshas Bereishis");
    const kinds = week.events.map((e) => e.kind);
    expect(kinds).toContain("roshChodesh");
    expect(kinds).toContain("mevarchim");
    expect(week.molad).toMatch(/Molad Cheshvan/);
  });

  it("joins doubled parshiyos", () => {
    const week = computeWeek("2026-03-14", DEFAULT_ZMANIM_SETTINGS);
    expect(week.parsha?.en).toBe("Vayakhel-Pekudei");
    expect(week.parsha?.he).toBe("ויקהל-פקודי");
  });

  it("rejects non-Shabbos dates", () => {
    expect(() => computeWeek("2026-08-28", DEFAULT_ZMANIM_SETTINGS)).toThrow();
  });
});
