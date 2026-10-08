import { describe, expect, it } from "vitest";
import {
  anniversariesBetween,
  formatHebrewDateEn,
  formatHebrewDateHe,
  hebrewFromGregorian,
  parseHebrewDate,
} from "@/lib/calendar/hebrew-dates";

describe("parseHebrewDate", () => {
  it.each([
    ["16 Elul", { day: 16, month: 6 }],
    ["Elul 16", { day: 16, month: 6 }],
    ["Elul 16, 5784", { day: 16, month: 6, year: 5784 }],
    ["21 Elul 5784", { day: 21, month: 6, year: 5784 }],
    ["ט״ז אלול", { day: 16, month: 6 }],
    ['כ"א אלול התשפ"ד', { day: 21, month: 6, year: 5784 }],
    ["י\"ט אלול ה'תשפ\"ב", { day: 19, month: 6, year: 5782 }],
    ["3 Tammuz", { day: 3, month: 4 }],
    ["10 Teves", { day: 10, month: 10 }],
    ["15 Adar", { day: 15, month: 12 }],
    ["14 Adar II 5784", { day: 14, month: 13, year: 5784 }],
    ["14 Adar 5784", { day: 14, month: 13, year: 5784 }], // leap year: Adar → Adar II
    ["1 Marcheshvan", { day: 1, month: 8 }],
  ])("%s", (input, expected) => {
    expect(parseHebrewDate(input)).toEqual(expected);
  });

  it.each(["", "Elul", "32 Elul", "hello world", "2024-09-01"])("rejects %s", (input) => {
    expect(parseHebrewDate(input)).toBeNull();
  });
});

describe("anniversaries", () => {
  it("finds the sample week's yahrzeits (Shabbos 16 Elul – Friday 22 Elul 5786)", () => {
    const window = ["2026-08-29", "2026-09-04"] as const;
    const hits = anniversariesBetween("yahrzeit", { day: 21, month: 6, year: 5784 }, ...window);
    expect(hits.map((h) => h.toString())).toEqual(["21 Elul 5786"]);
    expect(anniversariesBetween("yahrzeit", { day: 23, month: 6 }, ...window)).toEqual([]);
  });

  it("does not list a yahrzeit before the first year", () => {
    expect(anniversariesBetween("yahrzeit", { day: 21, month: 6, year: 5786 }, "2026-08-29", "2026-09-04")).toEqual([]);
  });

  it("handles a window that crosses Rosh Hashanah", () => {
    // 23 Elul 5786 (Sep 5) through 3 Tishrei 5787 (Sep 14)
    const hits = anniversariesBetween("birthday", { day: 2, month: 7 }, "2026-09-05", "2026-09-14");
    expect(hits.map((h) => h.toString())).toEqual(["2 Tishrei 5787"]);
  });

  it("converts Gregorian dates, respecting after-sunset", () => {
    expect(hebrewFromGregorian("2026-08-29")).toEqual({ day: 16, month: 6, year: 5786 });
    expect(hebrewFromGregorian("2026-08-29", true)).toEqual({ day: 17, month: 6, year: 5786 });
  });

  it("formats", () => {
    expect(formatHebrewDateEn({ day: 21, month: 6, year: 5784 })).toBe("21 Elul 5784");
    expect(formatHebrewDateHe({ day: 21, month: 6, year: 5784 })).toBe("כ״א אלול תשפ״ד");
    expect(formatHebrewDateEn({ day: 10, month: 10 })).toBe("10 Teves");
  });
});
