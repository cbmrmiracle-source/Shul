/**
 * Content and yahrzeit/birthday generation against a real database.
 * Runs when TEST_DATABASE_URL is set; the database is wiped first.
 */
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("content (database)", () => {
  let weeks: typeof import("@/lib/weeks");
  let content: typeof import("@/lib/content/service");
  let people: typeof import("@/lib/people/service");
  let importer: typeof import("@/lib/people/import");

  const blank = {
    title: "",
    body: "",
    fields: {},
    imageAssetId: null,
    linkUrl: "",
    linkLabel: "",
    eventDate: null,
    eventTime: "",
    hebrewDate: "",
    recurring: false,
    recurringUntil: null,
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await sql`truncate organization, schedule_profile, schedule_slot, week, schedule_entry, publication, asset,
      content_item, placement, content_week_skip, person_date, person_import restart identity cascade`;
    await sql.end();
    await (await import("@/lib/seed")).seedDefaults();
    weeks = await import("@/lib/weeks");
    content = await import("@/lib/content/service");
    people = await import("@/lib/people/service");
    importer = await import("@/lib/people/import");
  });

  it("places a new item in its type's default publications", async () => {
    const week = await weeks.createWeek("2026-08-29");
    const item = await content.createItem(week, "sponsor", { ...blank, title: "Rabbi Ellie & Chaya Rochel Estrin" });
    const pubs = await content.listPublications();
    const keys = (await content.getItemPlacements(item.id)).map((p) => pubs.find((x) => x.id === p.publicationId)!.key);
    expect(keys.sort()).toEqual(["email", "newsletter", "poster_farbrengen"]);
  });

  it("shows recurring items in later weeks until they end, and can skip one week", async () => {
    const w1 = await weeks.createWeek("2026-08-29");
    const item = await content.createItem(w1, "kids_program", {
      ...blank,
      title: "Mesibos Shabbos",
      recurring: true,
      recurringUntil: "2026-09-12",
    });
    const w2 = await weeks.createWeek("2026-09-05");
    const w4 = await weeks.createWeek("2026-09-19");
    const has = async (w: { id: number; shabbosDate: string }) =>
      (await content.listWeekContent(w)).find((i) => i.id === item.id);

    expect(await has(w2)).toBeTruthy();
    expect(await has(w4)).toBeUndefined();

    await content.setHiddenForWeek(item.id, w2.id, true);
    expect((await has(w2))!.skipped).toBe(true);
    expect((await has(w1))!.skipped).toBe(false);
  });

  it("adds this week's yahrzeits from a pasted list, for review", async () => {
    const paste = [
      "Name\tHebrew Name\tDate\tRelation",
      'Avraham Bachar\tאברהם בן רחמים\tכ"א אלול התשפ"ד\tFather of Roei Bachar',
      'Yosef Chaim Rosenfeld\tיוסף חיים בן חנוך העניך הכהן\tי"ט אלול התשפ"ב\tFather of Yitzchok Rosenfeld',
      "Someone Else\t\t5 Tishrei 5780\t",
    ].join("\n");
    const p = importer.previewPaste("yahrzeit", paste);
    await people.replacePeople("yahrzeit", p.result.people, {}, 0);

    const week = (await weeks.getWeekByDate("2026-08-29"))!;
    const yahrzeits = (await content.listWeekContent(week)).filter((i) => i.type === "yahrzeit");
    expect(yahrzeits.map((y) => y.title)).toEqual(["Yosef Chaim Rosenfeld", "Avraham Bachar"]); // 19 Elul, then 21
    expect(yahrzeits[1]).toMatchObject({
      reviewStatus: "pending",
      source: "import",
      hebrewDate: "כ״א אלול תשפ״ד",
      fields: { nameHe: "אברהם בן רחמים", relation: "Father of Roei Bachar" },
    });
    expect(yahrzeits[0].placements.size).toBe(2);
  });

  it("keeps reviewed items and drops unreviewed ones that left the list", async () => {
    const week = (await weeks.getWeekByDate("2026-08-29"))!;
    const before = (await content.listWeekContent(week)).filter((i) => i.type === "yahrzeit");
    await content.approveItems([before[0].id]); // approve Rosenfeld

    // New paste without either person
    const p = importer.previewPaste("yahrzeit", "Name\tDate\nSomeone Else\t5 Tishrei 5780");
    await people.replacePeople("yahrzeit", p.result.people, {}, 0);

    const after = (await content.listWeekContent(week)).filter((i) => i.type === "yahrzeit");
    expect(after.map((i) => i.title)).toEqual(["Yosef Chaim Rosenfeld"]);
  });

  it("does not duplicate on repeated syncs", async () => {
    const p = importer.previewPaste("birthday", "Name\tHebrew Date\nChani Goldman\t21 Elul");
    await people.replacePeople("birthday", p.result.people, {}, 0);
    const week = (await weeks.getWeekByDate("2026-08-29"))!;
    await weeks.syncWeek(week.id);
    await weeks.syncWeek(week.id);
    const birthdays = (await content.listWeekContent(week)).filter((i) => i.type === "birthday");
    expect(birthdays.map((b) => [b.title, b.hebrewDate])).toEqual([["Chani Goldman", "21 Elul"]]);
  });
});
