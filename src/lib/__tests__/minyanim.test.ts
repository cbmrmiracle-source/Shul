import { describe, expect, it } from "vitest";
import { summarizeMinyanim } from "@/lib/render/minyanim";
import { formatTimesLong } from "@/lib/time";
import { row, sectionsOf } from "./fixtures";

it("formats spoken time lists", () => {
  expect(formatTimesLong([420, 495, 540])).toBe("7:00, 8:15 & 9:00 am");
  expect(formatTimesLong([390, 450])).toBe("6:30 & 7:30 am");
  expect(formatTimesLong([1170])).toBe("7:30 pm");
  expect(formatTimesLong([690, 810])).toBe("11:30 am & 1:30 pm");
});

const schedule = (sunday: ReturnType<typeof row>[], weekday: ReturnType<typeof row>[]) =>
  sectionsOf({ friday: [], shabbos: [], sunday, weekday });

describe("summarizeMinyanim", () => {
  it("reproduces the sample WhatsApp image", () => {
    const s = summarizeMinyanim(
      schedule(
        [
          row("a", "Shachris", "", [420, 495, 540], "", "sunday"),
          row("b", "Mincha", "", [1170], "", "sunday"),
          row("c", "Maariv", "", [1206], "", "sunday"),
        ],
        [
          row("d", "Shachris", "", [390, 450], "", "weekday"),
          row("e", "Mincha", "", [1170], "", "weekday"),
          row("f", "Maariv", "B'zman", null, "", "weekday"),
        ],
      ),
      [row("g", "Shachris", "", [390, 450], "", "friday"), row("h", "Mincha", "", [1175], "", "friday")],
    );
    expect(s).toEqual([
      {
        label: "Shachris",
        lines: [
          { days: "Sunday", text: "7:00, 8:15 & 9:00 am" },
          { days: "Monday-Friday", text: "6:30 & 7:30 am" },
        ],
      },
      { label: "Mincha", lines: [{ days: null, text: "7:30 pm" }] },
      {
        label: "Maariv",
        lines: [
          { days: "Sunday", text: "8:06 pm" },
          { days: "Monday-Thursday", text: "B'zman" },
        ],
      },
    ]);
  });

  it("splits out a Tuesday with a different Mincha", () => {
    const s = summarizeMinyanim(
      schedule(
        [row("a", "Mincha", "7:30PM", [1170], "", "sunday")],
        [
          row("b", "Mincha", "7:30PM", [1170], "", "weekday", [1, 3, 4]),
          row("c", "Mincha", "7:00PM", [1140], "", "weekday", [2]),
        ],
      ),
      [],
    );
    expect(s).toEqual([
      {
        label: "Mincha",
        lines: [
          { days: "Sunday-Monday", text: "7:30 pm" },
          { days: "Tuesday", text: "7:00 pm" },
          { days: "Wednesday-Thursday", text: "7:30 pm" },
        ],
      },
    ]);
  });

  it("matches labels spelled differently", () => {
    const s = summarizeMinyanim(
      schedule([row("a", "Shacharis", "", [420], "", "sunday")], [row("b", "Shachris", "", [420], "", "weekday")]),
      [],
    );
    expect(s).toEqual([{ label: "Shacharis", lines: [{ days: null, text: "7:00 am" }] }]);
  });
});
