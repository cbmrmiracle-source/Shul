import { describe, expect, it } from "vitest";
import { emailPreheader, emailSubject, renderEmail } from "@/lib/render/email";
import { fixture, item, row, sectionsOf } from "./fixtures";

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
    expect(out).toContain("Shachris: 7 / 8:15 / 9AM");
    expect(out).toContain("6700 NW 44th St");
  });

  it("keeps Friday morning out of the Shabbos section and lists it with weekdays", () => {
    const shabbos = out.slice(out.indexOf("Shabbos Schedule"), out.indexOf("Weekday Schedule"));
    expect(shabbos).not.toContain("6:30 / 7:30AM");
    expect(out.slice(out.indexOf("Weekday Schedule"))).toContain("<strong>Friday:</strong>");
  });

  it("renders content sections like the current email", () => {
    expect(out).toContain("The Eruv has been checked and is Kosher");
    expect(out).toContain("Co-Sponsored by");
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

describe("email additions (October 2026)", () => {
  const base = {
    imageUrl: (k: string) => `https://shul.example.org/media/${k}`,
    placeholderLogoUrl: "https://shul.example.org/brand/logo-placeholder.png",
  };

  it("lists sponsors before co-sponsors", () => {
    const out = renderEmail(
      fixture({
        items: {
          email: [
            item("sponsor", { title: "Co One", fields: { level: "co_sponsor" } }),
            item("sponsor", { title: "Main Sponsor", fields: { level: "sponsor" } }),
            item("sponsor", { title: "Co Two", fields: { level: "co_sponsor" } }),
          ],
        },
      }),
      base,
    );
    const iSponsored = out.indexOf("Sponsored by<");
    const iMain = out.indexOf("Main Sponsor");
    const iCo = out.indexOf("Co-Sponsored by");
    expect(iSponsored).toBeGreaterThan(0);
    expect(iMain).toBeGreaterThan(iSponsored);
    expect(iCo).toBeGreaterThan(iMain);
    expect(out.indexOf("Co One")).toBeGreaterThan(iCo);
    expect(out.indexOf("Co Two")).toBeGreaterThan(iCo);
  });

  it("always includes the Eruv map link", () => {
    const out = renderEmail(fixture(), base);
    expect(out).toContain("🕍 Eruv Status");
    expect(out).toContain('href="https://www.chabadftlauderdale.com/templates/articlecco_cdo/aid/114576/jewish/Eiruv.htm"');
    expect(out).toContain("For a detailed map of the Inverrary Eruv");
    expect(out).not.toContain("Kosher for this Shabbos");
    const off = fixture();
    off.org.emailSettings = { eruvMapUrl: "" };
    expect(renderEmail(off, base)).not.toContain("Eruv Status");
  });

  it("adds Community Resources with the printable newsletter and schedule", () => {
    const out = renderEmail(fixture(), {
      ...base,
      newsletterPdfUrl: "https://shul.example.org/n/abc.pdf",
      scheduleUrl: "https://shul.example.org/media/files/x.pdf",
    });
    expect(out).toContain("📚 Community Resources");
    expect(out).toContain('href="https://shul.example.org/n/abc.pdf"');
    expect(out).toContain("This Week&#39;s Newsletter (Printable Version)");
    expect(out).toContain('href="https://shul.example.org/media/files/x.pdf"');
    // Eruv comes before resources, as in the original email
    expect(out.indexOf("Eruv Status")).toBeLessThan(out.indexOf("Community Resources"));
  });

  it("shows the Children's Poster above the written kids programs", () => {
    const url = "https://shul.example.org/n/abc-kids.png?v=1";
    const out = renderEmail(
      fixture({ items: { email: [item("kids_program", { title: "Teen Girls Club", eventTime: "7:00PM" })] } }),
      { ...base, kidsPosterUrl: url },
    );
    expect(out).toContain(`src="${url}"`);
    expect(out.indexOf(url)).toBeLessThan(out.indexOf("Teen Girls Club"));
    // Poster alone still gets the section
    expect(renderEmail(fixture(), { ...base, kidsPosterUrl: url })).toContain("Kids Program");
    expect(renderEmail(fixture(), base)).not.toContain("Kids Program");
  });

  it("adds a Condolences section", () => {
    const out = renderEmail(
      fixture({
        items: {
          email: [
            item("condolence", {
              title: "the Goldberg family",
              fields: { passing: "on the passing of their father", shiva: "Shiva at 1234 NW 44th St" },
            }),
          ],
        },
      }),
      base,
    );
    expect(out).toContain("🕯️ Condolences");
    expect(out).toContain("We extend our heartfelt condolences to <strong>the Goldberg family</strong> on the passing of their father.");
    expect(out).toContain("Shiva at 1234 NW 44th St");
    expect(out).toContain("המקום ינחם אתכם");
  });

  it("prints weekday sections by day", () => {
    const d = fixture();
    d.schedule.weekday = [
      row("m1", "Mincha", "7:30PM", [1170], "", "weekday", [1, 3, 4]),
      row("m2", "Mincha", "7:00PM", [1140], "", "weekday", [2]),
    ];
    d.weekdaySections = sectionsOf(d.schedule);
    const out = renderEmail(d, base);
    expect(out).toContain("<strong>Monday:</strong>");
    expect(out).toContain("<strong>Tuesday:</strong><br>Mincha: 7:00PM");
    expect(out).toContain("<strong>Wednesday - Thursday:</strong>");
  });
});
