import { describe, expect, it } from "vitest";
import { parseHistoryPaste } from "../content/history-paste";

const SAMPLE = `Shabbos

The Rambam Visits Yerushalayim (1165)
After leaving Morocco, the Rambam visited Yerushalayim and prayed at the site of the Beis Hamikdash. He resolved to observe both dates as personal holidays.

Sunday

The Last Jew Returns Home from the Sukkos Pilgrimage (Second Beis Hamikdash Era)
During the Second Beis Hamikdash era, Cheshvan 7 marked the return of the last Jewish pilgrim.

Passing of R. Meir Shapiro (1933)
Rabbi Meir Shapiro of Lublin founded Daf Yomi.

Thursday

Passing of Mesushelach (2105 BCE)
Mesushelach passed away at the age of 969.

Yahrtzeit of Rachel Imeinu (1553 BCE)
Rachel Imeinu passed away on Cheshvan 11.
The prophet Yirmiyahu describes Rachel weeping for her children in exile.
`;

describe("parseHistoryPaste", () => {
  it("splits days, titles and text", () => {
    const { events, problems } = parseHistoryPaste(SAMPLE);
    expect(problems).toEqual([]);
    expect(events.map((e) => [e.day, e.title])).toEqual([
      ["Shabbos", "The Rambam Visits Yerushalayim (1165)"],
      ["Sunday", "The Last Jew Returns Home from the Sukkos Pilgrimage (Second Beis Hamikdash Era)"],
      ["Sunday", "Passing of R. Meir Shapiro (1933)"],
      ["Thursday", "Passing of Mesushelach (2105 BCE)"],
      ["Thursday", "Yahrtzeit of Rachel Imeinu (1553 BCE)"],
    ]);
    expect(events[0].body).toMatch(/^After leaving Morocco.*personal holidays\.$/);
    expect(events[4].body).toBe(
      "Rachel Imeinu passed away on Cheshvan 11. The prophet Yirmiyahu describes Rachel weeping for her children in exile.",
    );
  });

  it("works without blank lines and with dates on day headings", () => {
    const { events } = parseHistoryPaste(
      "Sunday, Cheshvan 7\nPassing of R. Meir Shapiro (1933)\nHe founded Daf Yomi.\nSecond Event\nMore text.\nMonday:\nThird\nText.",
    );
    expect(events).toEqual([
      { day: "Sunday", hebrewDate: "Cheshvan 7", title: "Passing of R. Meir Shapiro (1933)", body: "He founded Daf Yomi." },
      { day: "Sunday", hebrewDate: "Cheshvan 7", title: "Second Event", body: "More text." },
      { day: "Monday", hebrewDate: "", title: "Third", body: "Text." },
    ]);
  });

  it("keeps separate paragraphs and doesn't mistake sentences for day headings", () => {
    const { events } = parseHistoryPaste("Friday\nTitle\nFirst paragraph.\n\nSunday was the day it happened.");
    expect(events).toHaveLength(1);
    expect(events[0].body).toBe("First paragraph.\n\nSunday was the day it happened.");
  });

  it("reports text without a title and titles without text", () => {
    const { events, problems } = parseHistoryPaste("Monday\nJust a sentence.\n\nLonely title");
    expect(events).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });
});
