import { describe, expect, it } from "vitest";
import { fixture, row } from "./fixtures";
import { buildHtml, renderOutput } from "@/lib/render/renderer";
import { TEMPLATES } from "@/lib/render/templates";

describe("templates (HTML)", () => {
  it("davening poster lists every group with dates", () => {
    const out = buildHtml(TEMPLATES.poster_davening!, fixture());
    expect(out).toContain("Friday, Elul 15 — Aug 28");
    expect(out).toContain("Shabbos, Elul 16 — Aug 29");
    expect(out).toContain("Followed by Farbrengen");
    expect(out).toContain("פרשת כי תבוא תשפ״ו");
    expect(out).toContain("B&#39;zman");
  });

  it("weekly WhatsApp summarizes the weekday minyanim", () => {
    const out = buildHtml(TEMPLATES.whatsapp_weekly!, fixture());
    expect(out).toContain("Sunday - 7:00, 8:15 &amp; 9:00 am");
    expect(out).toContain("Monday-Friday - 6:30 &amp; 7:30 am");
  });

  it("Shabbos WhatsApp shows candle lighting, the eruv, and leaves morning rows out of Friday night", () => {
    const eruv = { id: 1, type: "eruv" as const, title: "", body: "", fields: { status: "kosher" }, eventDate: null, eventTime: "", hebrewDate: "", linkUrl: "", linkLabel: "", image: null, imageKey: null };
    const out = buildHtml(TEMPLATES.whatsapp_shabbos!, fixture({ items: { whatsapp_shabbos: [eruv] } }));
    expect(out).toContain("Candle Lighting - 7:27PM");
    expect(out).toContain("The Eruv is Kosher");
    const friday = out.slice(out.indexOf("Friday Night"), out.indexOf("Shabbos Day"));
    expect(friday).not.toContain("6:30");
    expect(friday).toContain("Kabolas Shabbos");
  });

  it("escapes text people type", () => {
    const d = fixture();
    d.schedule.friday[0] = row("x", "<img src=x onerror=alert(1)>", "1", [60]);
    expect(buildHtml(TEMPLATES.poster_davening!, d)).not.toContain("<img src=x");
  });
});

describe("renderer (headless Chromium)", () => {
  const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

  it("renders WhatsApp images at 1080×1080 and the poster as a one-page PDF", async () => {
    const wa = await renderOutput(TEMPLATES.whatsapp_shabbos!, fixture(), "png");
    expect(pngSize(wa.data)).toEqual([1080, 1080]);
    expect(wa.warnings).toEqual([]);

    const poster = await renderOutput(TEMPLATES.poster_davening!, fixture(), "png");
    expect(pngSize(poster.data)).toEqual([1632, 2112]);

    const pdf = await renderOutput(TEMPLATES.poster_davening!, fixture(), "pdf");
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.data.toString("latin1").match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
  }, 60_000);

  it("shrinks or flags content that doesn't fit", async () => {
    const d = fixture();
    d.schedule.shabbos = Array.from({ length: 30 }, (_, i) => row(`r${i}`, `Shiur number ${i}`, "9:00PM", [1260]));
    const r = await renderOutput(TEMPLATES.whatsapp_shabbos!, d, "png");
    expect(r.warnings.join(" ")).toMatch(/Shabbos Day/);
  }, 60_000);
});
