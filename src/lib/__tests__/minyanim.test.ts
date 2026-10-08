import { describe, expect, it } from "vitest";
import { summarizeMinyanim } from "@/lib/render/minyanim";
import type { ScheduleRow } from "@/lib/render/data";
import { formatTimesLong } from "@/lib/time";

const row = (label: string, value: ScheduleRow["value"]): ScheduleRow => ({ key: label, label, note: "", display: "", value });

it("formats spoken time lists", () => {
  expect(formatTimesLong([420, 495, 540])).toBe("7:00, 8:15 & 9:00 am");
  expect(formatTimesLong([390, 450])).toBe("6:30 & 7:30 am");
  expect(formatTimesLong([1170])).toBe("7:30 pm");
  expect(formatTimesLong([690, 810])).toBe("11:30 am & 1:30 pm");
});

describe("summarizeMinyanim", () => {
  it("reproduces the sample WhatsApp image", () => {
    const s = summarizeMinyanim(
      [row("Shacharis", { times: [420, 495, 540] }), row("Mincha", { times: [1170] }), row("Maariv", { times: [1206] })],
      [row("Shacharis", { times: [390, 450] }), row("Mincha", { times: [1170] }), row("Maariv", { text: "B'zman" })],
      [row("Shacharis", { times: [390, 450] }), row("Candle Lighting", { times: [1167] }), row("Mincha", { times: [1175] })],
    );
    expect(s).toEqual([
      {
        label: "Shacharis",
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

  it("matches labels spelled differently", () => {
    const s = summarizeMinyanim([row("Shachris", { times: [420] })], [row("Shacharis", { times: [420] })], []);
    expect(s).toEqual([{ label: "Shachris", lines: [{ days: null, text: "7:00 am" }] }]);
  });
});
