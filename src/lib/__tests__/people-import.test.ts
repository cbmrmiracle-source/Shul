import { describe, expect, it } from "vitest";
import { guessMapping, parseGregorian, parseTable, previewPaste } from "@/lib/people/import";

describe("parseTable", () => {
  it("reads tab-separated clipboard text with quoted cells", () => {
    const text = 'Name\tDate\r\n"Smith, John"\t16 Elul\n"Line\none"\t"say ""hi"""\n\n';
    expect(parseTable(text)).toEqual([
      ["Name", "Date"],
      ["Smith, John", "16 Elul"],
      ["Line\none", 'say "hi"'],
    ]);
  });
  it("falls back to CSV", () => {
    expect(parseTable('a,b\n"1,2",3')).toEqual([
      ["a", "b"],
      ["1,2", "3"],
    ]);
  });
});

describe("guessMapping", () => {
  it("recognizes common headers", () => {
    expect(guessMapping(["English Name", "Hebrew Name", "Hebrew Date", "Relation", "Notes"])).toEqual({
      "0": "nameEn",
      "1": "nameHe",
      "2": "hebrewDate",
      "3": "relation",
      "4": "notes",
    });
    expect(guessMapping(["Name", "Date of Birth", "After Sunset"])).toEqual({
      "0": "nameEn",
      "1": "gregorianDate",
      "2": "afterSunset",
    });
  });
});

it("parses English dates", () => {
  expect(parseGregorian("9/1/2024")).toBe("2024-09-01");
  expect(parseGregorian("2024-09-01")).toBe("2024-09-01");
  expect(parseGregorian("September 1, 2024")).toBe("2024-09-01");
  expect(parseGregorian("16 Elul")).toBeNull();
  expect(parseGregorian("13/45/2024")).toBeNull();
});

describe("previewPaste", () => {
  it("handles a yahrzeit sheet like the sample newsletter", () => {
    const paste = [
      "Name\tHebrew Name\tDate\tRelation",
      'Avraham Bachar\tאברהם בן רחמים\tכ"א אלול התשפ"ד\tFather of Roei Bachar',
      'Yosef Chaim Rosenfeld\tיוסף חיים בן חנוך העניך הכהן\tי"ט אלול התשפ"ב\tFather of Yitzchok Rosenfeld',
      "No Date Person\t\t\t",
      "Bad Date\t\tsometime\t",
    ].join("\n");
    const p = previewPaste("yahrzeit", paste);
    expect(p.hasHeader).toBe(true);
    expect(p.mapping).toEqual({ "0": "nameEn", "1": "nameHe", "2": "hebrewDate", "3": "relation" });
    expect(p.result.people).toHaveLength(2);
    expect(p.result.people[0]).toMatchObject({
      nameEn: "Avraham Bachar",
      relation: "Father of Roei Bachar",
      date: { day: 21, month: 6, year: 5784 },
      row: 2,
    });
    expect(p.result.errors.map((e) => [e.row, e.message])).toEqual([
      [4, "No date"],
      [5, "Can't read the date “sometime”"],
    ]);
  });

  it("works without a header row and with English birth dates", () => {
    const p = previewPaste("birthday", "Chani Goldman\t9/4/2015\nShneur Stern\t8/30/2012");
    expect(p.hasHeader).toBe(false);
    expect(p.mapping).toEqual({ "0": "nameEn", "1": "gregorianDate" });
    expect(p.result.people.map((x) => x.date.month)).toEqual([6, 6]);
  });

  it("keeps keys stable across pastes and flags duplicates", () => {
    const paste = "Name\tHebrew Date\nA B\t16 Elul\nA B\t16 Elul";
    const a = previewPaste("birthday", paste);
    const b = previewPaste("birthday", paste);
    expect(a.result.people[0].externalKey).toBe(b.result.people[0].externalKey);
    expect(a.result.errors[0].message).toMatch(/Duplicate/);
  });

  it("restores a remembered column choice", () => {
    const p = previewPaste("birthday", "Who\tWhen\nA\t16 Elul", { rememberedMapping: { Who: "nameEn", When: "hebrewDate" } });
    expect(p.result.people).toHaveLength(1);
  });
});

describe("date column detection", () => {
  it.each(["Date of Passing", "Yahrzeit", "Birthday", "תאריך פטירה"])("recognizes the heading %s", (heading) => {
    const p = previewPaste("yahrzeit", `Name\t${heading}\nA B\t16 Elul`);
    expect(p.mapping["1"]).toBe("hebrewDate");
    expect(p.result.people).toHaveLength(1);
  });

  it("finds a date column from its contents when the heading is unhelpful", () => {
    const p = previewPaste("birthday", "Name\tWhen\nA B\t16 Elul\nC D\t3 Tammuz");
    expect(p.mapping["1"]).toBe("hebrewDate");
  });

  it("reads English dates under a generic heading", () => {
    const p = previewPaste("birthday", "Name\tBirthday\tAfter sunset\nA B\t8/29/2026\tyes");
    expect(p.mapping).toEqual({ "0": "nameEn", "1": "gregorianDate", "2": "afterSunset" });
    expect(p.result.people[0].date).toEqual({ day: 17, month: 6, year: 5786 });
  });
});
