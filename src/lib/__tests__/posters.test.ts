import { describe, expect, it } from "vitest";
import { buildHtml, renderOutput } from "@/lib/render/renderer";
import { TEMPLATES } from "@/lib/render/templates";
import { fixture, item, row } from "./fixtures";

describe("Sicha shiur poster", () => {
  it("uses a shiur placed on the poster", () => {
    const out = buildHtml(
      TEMPLATES.poster_sicha!,
      fixture({ items: { poster_sicha: [item("shiur", { title: "Shiur in Likutei Sichos", eventTime: "6:25PM", fields: { day: "Shabbos" } })] } }),
    );
    expect(out).toContain("לקוטי שיחות");
    expect(out).toContain('6:25<span class="ampm">PM</span>');
    expect(out).toContain("Shabbos Afternoon");
  });

  it("falls back to the davening row for the Sichos shiur", () => {
    const d = fixture();
    d.schedule.shabbos.push(row("sicha_shiur", "Shiur in Likutei Sichos", "6:25PM", [1105]));
    expect(buildHtml(TEMPLATES.poster_sicha!, d)).toContain('6:25<span class="ampm">PM</span>');
  });

  it("explains what to do when there is no shiur", () => {
    expect(buildHtml(TEMPLATES.poster_sicha!, fixture())).toContain("Tick “Sicha” on a Shiur item");
  });
});

describe("Farbrengen poster", () => {
  it("lists co-sponsors with their dedications", () => {
    const out = buildHtml(
      TEMPLATES.poster_farbrengen!,
      fixture({
        items: {
          poster_farbrengen: [
            item("sponsor", { title: "Rabbi Ellie & Chaya Rochel Estrin", body: "In honor of **Shayna**" }),
            item("sponsor", { title: "Rabbi Yitzchok & Mimi Rosenfeld", body: "In honor of the Yartzeit of", fields: { dedicationHe: "יוסף חיים" } }),
          ],
        },
      }),
    );
    expect(out).toContain("Co-Sponsored by:");
    expect(out).toContain("<strong>Shayna</strong>");
    expect(out).toContain("יוסף חיים");
  });

  it("shows the sponsorship note when nobody has sponsored", () => {
    const d = fixture();
    d.org.emailSettings = { sponsorNote: "To sponsor, call Sholom Katz" };
    expect(buildHtml(TEMPLATES.poster_farbrengen!, d)).toContain("To sponsor, call Sholom Katz");
  });
});

describe("Kids poster", () => {
  const d = fixture({
    items: {
      poster_kids: [
        item("kids_program", { title: "0-5 Year old program", eventTime: "10:30-12:00", fields: { location: "EC3 Classroom", status: "running" } }),
        item("kids_program", { title: "Father & Son Minyan", eventTime: "10:00AM", fields: { status: "back" } }),
        item("kids_program", { title: "Girls grades 5-8", eventTime: "10:00AM", fields: { status: "no_program" } }),
      ],
    },
  });
  const out = buildHtml(TEMPLATES.poster_kids!, d);

  it("shows each program with its status", () => {
    expect(out).toContain("Location: EC3 Classroom");
    expect(out).toContain('alt="We\'re back"');
    expect(out).toContain('<div class="badge-no">NO PROGRAM</div>');
    // a program that isn't running doesn't show its usual time
    const girls = out.slice(out.indexOf("Girls grades 5-8"));
    expect(girls.slice(0, 300)).not.toContain("10:00AM");
  });

  it("renders as a Letter page", async () => {
    const r = await renderOutput(TEMPLATES.poster_kids!, d, "png");
    expect([r.data.readUInt32BE(16), r.data.readUInt32BE(20)]).toEqual([1632, 2112]);
    expect(r.warnings).toEqual([]);
  }, 60_000);
});
