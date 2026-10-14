import { describe, expect, it } from "vitest";
import { buildHtml, renderOutput } from "@/lib/render/renderer";
import { collectShiurim } from "@/lib/render/shiurim";
import { TEMPLATES } from "@/lib/render/templates";
import { fixture, item, row } from "./fixtures";

const week = () => {
  const d = fixture({
    items: {
      poster_shiurim: [
        item("shiur", { title: "Gemara Shiur", eventTime: "8:00PM", fields: { day: "Tuesday", speaker: "Rabbi Lieberman", location: "Main Shul" } }),
        item("shiur", { title: "Tanya", eventTime: "6:45AM", fields: { day: "Sunday" } }),
        item("shiur", { title: "Chassidus", eventTime: "9:15AM", fields: { day: "Shabbos", audience: "For Men" } }),
        item("shiur", { title: "Women's Parsha Class", eventTime: "11:00AM", fields: { day: "Tuesday" } }),
      ],
    },
  });
  d.schedule.shabbos.push(row("sicha_shiur", "Shiur in Likutei Sichos", "6:25PM", [1105], "", "shabbos"));
  return d;
};

describe("Shiurim poster", () => {
  it("adds the Sicha shiur from the schedule and orders by day and time", () => {
    const days = collectShiurim(week());
    expect(days.map((g) => g.day)).toEqual(["Shabbos", "Sunday", "Tuesday"]);
    expect(days[0].shiurim.map((s) => `${s.time} ${s.title}`)).toEqual(["9:15AM Chassidus", "6:25PM Shiur in Likutei Sichos"]);
    expect(days[2].shiurim.map((s) => s.title)).toEqual(["Women's Parsha Class", "Gemara Shiur"]);
  });

  it("doesn't add the Sicha shiur twice when it is ticked as an item", () => {
    const d = week();
    d.items.poster_shiurim!.push(item("shiur", { title: "Shiur in Likutei Sichos", eventTime: "6:25PM", fields: { day: "Shabbos" } }));
    const titles = collectShiurim(d).flatMap((g) => g.shiurim.map((s) => s.title));
    expect(titles.filter((t) => /Sichos/.test(t))).toHaveLength(1);
  });

  it("renders a Letter poster", async () => {
    const out = buildHtml(TEMPLATES.poster_shiurim!, week());
    expect(out).toContain("Weekly Shiurim");
    expect(out).toContain("Rabbi Lieberman · Main Shul");
    const r = await renderOutput(TEMPLATES.poster_shiurim!, week(), "png");
    expect([r.data.readUInt32BE(16), r.data.readUInt32BE(20)]).toEqual([1632, 2112]);
    expect(r.warnings).toEqual([]);
    const { writeFileSync } = await import("node:fs");
    if (process.env.RENDER_SAMPLE_DIR) writeFileSync(`${process.env.RENDER_SAMPLE_DIR}/shiurim.png`, r.data);
  }, 60_000);
});
