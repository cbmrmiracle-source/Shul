import { describe, expect, it } from "vitest";
import { formatTime, formatTimes, parseTimeValue, roundTo5 } from "@/lib/time";

describe("formatting", () => {
  it("formats single times in house style", () => {
    expect(formatTime(19 * 60 + 27)).toBe("7:27PM");
    expect(formatTime(10 * 60)).toBe("10:00AM");
    expect(formatTime(0)).toBe("12:00AM");
    expect(formatTime(12 * 60 + 5)).toBe("12:05PM");
  });

  it("formats lists like the newsletter", () => {
    expect(formatTimes([390, 450])).toBe("6:30 / 7:30AM");
    expect(formatTimes([420, 495, 540])).toBe("7 / 8:15 / 9AM");
    expect(formatTimes([600, 780])).toBe("10AM / 1PM");
  });
});

describe("parseTimeValue", () => {
  it("parses common inputs", () => {
    expect(parseTimeValue("6:50 PM")).toEqual({ times: [18 * 60 + 50] });
    expect(parseTimeValue("6:50pm")).toEqual({ times: [18 * 60 + 50] });
    expect(parseTimeValue("7 / 8:15 / 9AM")).toEqual({ times: [420, 495, 540] });
    expect(parseTimeValue("6:30 & 7:30 am")).toEqual({ times: [390, 450] });
    expect(parseTimeValue("12:15pm")).toEqual({ times: [735] });
  });

  it("keeps anything else as text", () => {
    expect(parseTimeValue("B'zman")).toEqual({ text: "B'zman" });
    expect(parseTimeValue("6:30")).toEqual({ text: "6:30" });
    expect(parseTimeValue("  ")).toBeNull();
  });

  it("round-trips through formatting", () => {
    for (const s of ["6:30 / 7:30AM", "7 / 8:15 / 9AM", "7:27PM"]) {
      const v = parseTimeValue(s);
      expect(v && "times" in v && formatTimes(v.times)).toBe(s);
    }
  });
});

it("rounds to 5 minutes", () => {
  expect(roundTo5(453, "down5")).toBe(450);
  expect(roundTo5(453, "up5")).toBe(455);
  expect(roundTo5(453, "nearest5")).toBe(455);
  expect(roundTo5(453, "none")).toBe(453);
});
