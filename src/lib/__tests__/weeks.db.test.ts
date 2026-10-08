/**
 * Runs against a real database when TEST_DATABASE_URL is set; skipped otherwise.
 * The database is reset (all tables truncated) before the suite.
 */
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("week service (database)", () => {
  let svc: typeof import("@/lib/weeks");
  let dbmod: typeof import("@/db");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await sql`truncate organization, schedule_profile, schedule_slot, week, schedule_entry restart identity cascade`;
    await sql.end();
    await (await import("@/lib/seed")).seedDefaults();
    svc = await import("@/lib/weeks");
    dbmod = await import("@/db");
  });

  it("creates the Ki Savo week with the sample's davening times", async () => {
    const week = await svc.createWeek("2026-08-29");
    const entries = await svc.listEntries(week.id);
    const { formatTimeValue } = await import("@/lib/time");
    const show = (key: string) => formatTimeValue(svc.effectiveValue(entries.find((e) => e.key === key)!));
    expect(show("fri_shacharis")).toBe("6:30 / 7:30AM");
    expect(show("candle_lighting")).toBe("7:27PM");
    expect(show("fri_mincha")).toBe("7:35PM");
    expect(show("kabolas_shabbos")).toBe("7:55PM");
    expect(show("shabbos_mincha")).toBe("7:25PM");
    expect(show("sicha_shiur")).toBe("6:25PM");
    expect(show("sun_shacharis")).toBe("7 / 8:15 / 9AM");
    expect(show("sun_maariv")).toBe("8:06PM");
    expect(show("wk_maariv")).toBe("B'zman");
    // Chabad.org printed 8:18; our 8.5° value is 8:18:31, which rounds to 8:19.
    expect(["8:18PM", "8:19PM"]).toContain(show("shabbos_ends"));
  });

  it("keeps overrides and hidden rows through a re-sync", async () => {
    const { eq } = await import("drizzle-orm");
    const { db, schema } = dbmod;
    const week = (await svc.getWeekByDate("2026-08-29"))!;
    const entries = await svc.listEntries(week.id);
    const candles = entries.find((e) => e.key === "candle_lighting")!;
    await db
      .update(schema.scheduleEntry)
      .set({ overrideValue: { times: [19 * 60 + 30] }, hidden: true })
      .where(eq(schema.scheduleEntry.id, candles.id));

    await svc.syncWeek(week.id);

    const after = (await svc.listEntries(week.id)).find((e) => e.key === "candle_lighting")!;
    expect(after.overrideValue).toEqual({ times: [19 * 60 + 30] });
    expect(after.hidden).toBe(true);
    expect(after.autoValue).toEqual(candles.autoValue);
    // Mincha (candle lighting + 8) follows the override
    const mincha = (await svc.listEntries(week.id)).find((e) => e.key === "fri_mincha")!;
    expect(mincha.autoValue).toEqual({ times: [19 * 60 + 38] });

    await db
      .update(schema.scheduleEntry)
      .set({ overrideValue: null, hidden: false })
      .where(eq(schema.scheduleEntry.id, candles.id));
  });

  it("feeds a zman override into dependent rules", async () => {
    const { eq } = await import("drizzle-orm");
    const { db, schema } = dbmod;
    const week = (await svc.getWeekByDate("2026-08-29"))!;
    await db
      .update(schema.week)
      .set({ calendarOverrides: { zmanim: { "2026-08-28": { candleLighting: 19 * 60 + 20 } } } })
      .where(eq(schema.week.id, week.id));
    await svc.syncWeek(week.id);
    const entries = await svc.listEntries(week.id);
    expect(entries.find((e) => e.key === "fri_mincha")!.autoValue).toEqual({ times: [19 * 60 + 28] });
  });

  it("returns the existing week instead of duplicating it", async () => {
    const a = await svc.createWeek("2026-08-29");
    const b = await svc.createWeek("2026-08-29");
    expect(a.id).toBe(b.id);
  });
});
