import { describe, expect, it } from "vitest";
import { emailPreheader, emailSubject, renderEmail } from "@/lib/render/email";
import { fixture, item } from "./fixtures";

const opts = {
  imageUrl: (k: string) => `https://shul.example.org/media/${k}`,
  placeholderLogoUrl: "https://shul.example.org/brand/logo-placeholder.png",
};

describe("email newsletter", () => {
  const data = fixture({
    org: {
      name: "Chabad of Inverrary",
      address: "6700 NW 44th St, Lauderhill, FL 33319-4001",
      phone: "",
      email: "info@chabadofinverrary.com",
      website: "",
      emailSettings: { newsletterName: "The Shabbos Connection", sponsorNote: "To sponsor a kiddush, call Sholom Katz." },
    },
    items: {
      email: [
        item("eruv", { fields: { status: "kosher" }, linkUrl: "https://example.org/eruv" }),
        item("sponsor", { title: "Rabbi Yitzchok & Mimi Rosenfeld", body: "In honor of the Yartzeit of", fields: { dedicationHe: "יוסף חיים בן חנוך העניך הכהן" } }),
        item("sponsor", { title: "Rabbi Ellie & Chaya Rochel Estrin", body: "In honor of the upcoming wedding" }),
        item("event", { title: "Chai Elul Farbrengen", eventDate: "2026-08-31", eventTime: "8:30PM", imageKey: "images/2026/08/abc.jpg", linkUrl: "https://example.org/rsvp" }),
        item("mazal_tov", { title: "Yitzi and Sara Leah Field", fields: { occasion: "on the birth of a boy!" } }),
        item("birthday", { title: "Moshe Azra Drihem", hebrewDate: "16 Elul" }),
        item("birthday", { title: "Yisroel Isser Goldman", hebrewDate: "16 Elul" }),
        item("birthday", { title: "Shneur Stern", hebrewDate: "17 Elul" }),
        item("yahrzeit", { title: "Avraham Bachar", hebrewDate: "כ״א אלול תשפ״ד", fields: { nameHe: "אברהם בן רחמים", relation: "Father of Roei Bachar" } }),
        item("custom", { title: "📅 5787 Community Calendar", body: "Our annual **Community Calendar** is in preparation!", linkUrl: "https://chabadftlauderdale.com/calendar5787", linkLabel: "Reserve Your Space" }),
      ],
    },
  });
  const out = renderEmail(data, opts);

  it("has the header, schedule and footer", () => {
    expect(out).toContain("פרשת כי תבוא");
    expect(out).toContain("Candle Lighting: 7:27PM");
    expect(out).toContain("Shabbos Ends: 8:18PM");
    expect(out).toContain("Kabolas Shabbos – 7:55PM");
    expect(out).toContain("Followed by Farbrengen");
    expect(out).toContain("Shacharis: 7 / 8:15 / 9AM");
    expect(out).toContain("6700 NW 44th St");
  });

  it("keeps Friday morning out of the Shabbos section and lists it with weekdays", () => {
    const shabbos = out.slice(out.indexOf("Shabbos Schedule"), out.indexOf("Weekday Schedule"));
    expect(shabbos).not.toContain("6:30 / 7:30AM");
    expect(out.slice(out.indexOf("Weekday Schedule"))).toContain("<strong>Friday:</strong>");
  });

  it("renders content sections like the current email", () => {
    expect(out).toContain("The Eruv has been checked and is Kosher");
    expect(out).toContain("Co-Sponsored By");
    expect(out).toContain('<bdi dir="rtl" lang="he">יוסף חיים בן חנוך העניך הכהן</bdi>');
    expect(out).toContain("To sponsor a kiddush, call Sholom Katz.");
    expect(out).toContain("Monday, August 31 · 8:30PM");
    expect(out).toContain("Mazal tov to <strong>Yitzi and Sara Leah Field</strong> on the birth of a boy!");
    expect(out).toContain("🎉16 Elul - Moshe Azra Drihem, Yisroel Isser Goldman<br>");
    expect(out).toContain("🎉17 Elul - Shneur Stern<br>");
    expect(out).toContain("Father of Roei Bachar");
    expect(out).toContain("Our annual <strong>Community Calendar</strong> is in preparation!");
    expect(out).toContain('href="https://chabadftlauderdale.com/calendar5787"');
  });

  it("uses public image URLs, never embedded data", () => {
    expect(out).toContain('src="https://shul.example.org/media/images/2026/08/abc.jpg"');
    expect(out).toContain('src="https://shul.example.org/brand/logo-placeholder.png"');
    expect(out).not.toContain("data:image");
    expect(out).not.toMatch(/<script/i);
  });

  it("escapes what people type", () => {
    const evil = renderEmail(fixture({ items: { email: [item("mazal_tov", { title: '<img src=x onerror="alert(1)">' })] } }), opts);
    expect(evil).not.toContain("<img src=x");
  });

  it("omits empty sections", () => {
    const plain = renderEmail(fixture(), opts);
    expect(plain).not.toContain("Mazal Tov");
    expect(plain).not.toContain("Birthdays");
  });

  it("builds a subject and preview line", () => {
    expect(emailSubject(data)).toBe("The Shabbos Connection – Parshas Ki Savo");
    expect(emailPreheader(data)).toBe("Candle Lighting 7:27PM · Shabbos Ends 8:18PM");
  });
});
