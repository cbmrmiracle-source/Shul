import { describe, expect, it } from "vitest";
import { computeWeek } from "@/lib/calendar/week";
import { DEFAULT_ZMANIM_SETTINGS } from "@/lib/calendar/zmanim";
import { scheduleTimeFor } from "@/lib/render/schedule-match";
import { formatText } from "@/lib/render/html";
import { buildHtml, renderOutput } from "@/lib/render/renderer";
import { TEMPLATES } from "@/lib/render/templates";
import { calendarNotes } from "@/lib/render/templates/newsletter";
import { fixture, item } from "./fixtures";

const T = TEMPLATES.newsletter!;

describe("print newsletter", () => {
  const data = fixture({
    items: {
      newsletter: [
        item("sponsor", { title: "Rabbi Ellie & Chaya Rochel Estrin", body: "In honor of the wedding of **Shayna to Shmuli Andrusier**" }),
        item("birthday", { title: "Chani Goldman" }),
        item("birthday", { title: "Shneur Stern" }),
        item("yahrzeit", { title: "Avraham Bachar", hebrewDate: "כ״א אלול תשפ״ד", fields: { relation: "Father of Roei Bachar" } }),
        item("parsha_nutshell", { body: "Moshe instructs the Bnei Yisrael…" }),
        item("riddle", { body: "Which four verses…?", fields: { answer: "Arami Oved Avi" } }),
        item("jewish_history", { title: "Birth of the Baal Shem Tov (1698)", body: "Elul 18…", fields: { day: "Monday" } }),
        item("jewish_history", { title: "Birth of the Alter Rebbe (1745)", body: "Elul 18, 5505…", fields: { day: "Monday" } }),
      ],
    },
  });
  const out = buildHtml(T, data);

  it("puts content on the right page", () => {
    const [p1, p2] = out.split('<div class="page p2">');
    expect(p1).toContain("Weekly Schedule");
    expect(p1).toContain("Sponsored by:");
    expect(p1).toContain("<strong>Shayna to Shmuli Andrusier</strong>");
    expect(p1).toContain("Chani Goldman • Shneur Stern");
    expect(p1).toContain("Father of Roei Bachar");
    expect(p2).toContain("Parsha in a Nutshell");
    expect(p2).toContain("Week in Jewish History");
    // one Monday heading for both Monday events
    expect(p2.match(/<div class="day">Monday<\/div>/g)).toHaveLength(1);
    expect(p2).toContain('<div class="answer">Answer: Arami Oved Avi</div>');
  });

  it("leaves out empty sections", () => {
    const empty = buildHtml(T, fixture());
    expect(empty).not.toContain("Mazal Tov");
    expect(empty).not.toContain("Kids Corner");
    expect(empty).toContain("Weekly Schedule");
  });

  it("prints a two-page PDF and one PNG per page", async () => {
    const pdf = await renderOutput(T, data, "pdf");
    expect(pdf.data.toString("latin1").match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
    const p2 = await renderOutput(T, data, "png", 2);
    expect([p2.data.readUInt32BE(16), p2.data.readUInt32BE(20)]).toEqual([1632, 2112]);
    expect(pdf.warnings).toEqual([]);
  }, 60_000);

  it("flags a column with too much content", async () => {
    const long = fixture({
      items: {
        newsletter: Array.from({ length: 40 }, (_, i) =>
          item("jewish_history", { title: `Event ${i}`, body: "A long paragraph of history. ".repeat(8), fields: { day: "Sunday" } }),
        ),
      },
    });
    const r = await renderOutput(T, long, "pdf");
    expect(r.warnings.join(" ")).toMatch(/Page 2, right column/);
  }, 60_000);
});

it("merges multi-day calendar events into one line", () => {
  const cal = computeWeek("2026-10-10", DEFAULT_ZMANIM_SETTINGS);
  const notes = calendarNotes(cal);
  expect(notes).toContain("Rosh Chodesh Cheshvan — Sunday & Monday");
  expect(notes.some((n) => n.startsWith("Molad Cheshvan"))).toBe(true);
});

it("takes a shiur's time from the matching davening row", () => {
  const { schedule } = fixture({});
  schedule.shabbos.push({ key: "sicha", label: "Shiur in Likutei Sichos", note: "", display: "6:25PM", value: { times: [1105] } });
  expect(scheduleTimeFor(schedule, "Shiur in Likutei Sichos")).toBe("6:25PM");
  expect(scheduleTimeFor(schedule, "Chassidus")).toBe("9:15AM");
  expect(scheduleTimeFor(schedule, "Gemara shiur before Mincha")).toBe("");
});

it("isolates Hebrew inside typed text", () => {
  expect(formatText("joy and אהבת ישראל, teaching").value).toBe(
    '<p>joy and <bdi dir="rtl" lang="he" class="he">אהבת ישראל</bdi>, teaching</p>',
  );
});
