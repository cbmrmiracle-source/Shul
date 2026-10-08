import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarOverrides, Organization, ScheduleEntry, Week } from "@/db/schema";
import { computeWeek, type DayInfo, type WeekCalendar } from "@/lib/calendar/week";
import type { DayZmanim } from "@/lib/calendar/zmanim";
import { evaluateSlots, ruleSchema, type GroupZmanim } from "@/lib/schedule/rules";
import type { TimeValue } from "@/lib/time";

export async function getOrganization(): Promise<Organization> {
  const [org] = await db.select().from(schema.organization).limit(1);
  if (!org) throw new Error("No organization configured. Run `npm run db:seed`.");
  return org;
}

/** A profile whose date range covers the week, else the default profile. */
async function pickProfileId(shabbosDate: string): Promise<number | null> {
  const [ranged] = await db
    .select({ id: schema.scheduleProfile.id })
    .from(schema.scheduleProfile)
    .where(
      and(
        or(isNull(schema.scheduleProfile.activeFrom), lte(schema.scheduleProfile.activeFrom, shabbosDate)),
        or(isNull(schema.scheduleProfile.activeTo), gte(schema.scheduleProfile.activeTo, shabbosDate)),
      ),
    )
    .orderBy(desc(schema.scheduleProfile.activeFrom), desc(schema.scheduleProfile.isDefault))
    .limit(1);
  if (ranged) return ranged.id;
  const [fallback] = await db
    .select({ id: schema.scheduleProfile.id })
    .from(schema.scheduleProfile)
    .where(eq(schema.scheduleProfile.isDefault, true))
    .limit(1);
  return fallback?.id ?? null;
}

/** Calendar with the week's manual corrections applied. */
export interface EffectiveCalendar extends WeekCalendar {
  /** Zman keys per date that were overridden, so the UI can badge them. */
  overriddenZmanim: Record<string, string[]>;
  titleOverridden: boolean;
}

export function effectiveCalendar(auto: WeekCalendar, overrides: CalendarOverrides): EffectiveCalendar {
  const overriddenZmanim: Record<string, string[]> = {};
  const days: DayInfo[] = auto.days.map((day) => {
    const dayOverrides = overrides.zmanim?.[day.date];
    if (!dayOverrides) return day;
    overriddenZmanim[day.date] = Object.keys(dayOverrides);
    return { ...day, zmanim: { ...day.zmanim, ...dayOverrides } as DayZmanim };
  });
  return {
    ...auto,
    days,
    shabbosTitle: {
      en: overrides.shabbosTitleEn || auto.shabbosTitle.en,
      he: overrides.shabbosTitleHe || auto.shabbosTitle.he,
    },
    hebrewYearHe: overrides.hebrewYearHe || auto.hebrewYearHe,
    overriddenZmanim,
    titleOverridden: Boolean(overrides.shabbosTitleEn || overrides.shabbosTitleHe || overrides.hebrewYearHe),
  };
}

function groupZmanim(cal: WeekCalendar): GroupZmanim {
  const [fri, sat, sun, ...rest] = cal.days.map((d) => d.zmanim);
  return { friday: [fri], shabbos: [sat], sunday: [sun], weekday: rest.slice(0, 4) };
}

export async function getWeekByDate(shabbosDate: string): Promise<Week | null> {
  const [row] = await db.select().from(schema.week).where(eq(schema.week.shabbosDate, shabbosDate));
  return row ?? null;
}

export async function listWeeks(): Promise<Week[]> {
  return db.select().from(schema.week).orderBy(desc(schema.week.shabbosDate));
}

export async function listEntries(weekId: number): Promise<ScheduleEntry[]> {
  return db
    .select()
    .from(schema.scheduleEntry)
    .where(eq(schema.scheduleEntry.weekId, weekId))
    .orderBy(asc(schema.scheduleEntry.sortOrder), asc(schema.scheduleEntry.id));
}

/** Create the week for a Shabbos (or return the existing one) and fill in automatic values. */
export async function createWeek(shabbosDate: string): Promise<Week> {
  const existing = await getWeekByDate(shabbosDate);
  if (existing) return existing;
  const org = await getOrganization();
  const calendarAuto = computeWeek(shabbosDate, org.zmanim, org.houseSpellings);
  const [created] = await db
    .insert(schema.week)
    .values({ shabbosDate, calendarAuto, profileId: await pickProfileId(shabbosDate) })
    .onConflictDoNothing()
    .returning();
  const row = created ?? (await getWeekByDate(shabbosDate))!;
  await syncWeek(row.id);
  return row;
}

/**
 * Recompute everything automatic for a week: the calendar snapshot and the
 * auto value of each rule-based schedule row. Overrides, hidden flags and
 * manual rows are never modified.
 */
export async function syncWeek(weekId: number): Promise<void> {
  const org = await getOrganization();
  await db.transaction(async (tx) => {
    const [w] = await tx.select().from(schema.week).where(eq(schema.week.id, weekId)).for("update");
    if (!w) throw new Error(`Week ${weekId} not found`);

    const calendarAuto = computeWeek(w.shabbosDate, org.zmanim, org.houseSpellings);
    await tx
      .update(schema.week)
      .set({ calendarAuto, syncedAt: new Date() })
      .where(eq(schema.week.id, weekId));

    if (!w.profileId) return;
    const slots = await tx
      .select()
      .from(schema.scheduleSlot)
      .where(eq(schema.scheduleSlot.profileId, w.profileId))
      .orderBy(asc(schema.scheduleSlot.sortOrder));

    const entries = await tx
      .select()
      .from(schema.scheduleEntry)
      .where(eq(schema.scheduleEntry.weekId, weekId));
    const overrides = new Map(
      entries.filter((e) => e.overrideValue).map((e) => [e.key, e.overrideValue as TimeValue]),
    );

    const effective = effectiveCalendar(calendarAuto, w.calendarOverrides);
    const results = evaluateSlots(
      slots.map((s) => ({ key: s.key, group: s.group, rule: ruleSchema.parse(s.rule) })),
      groupZmanim(effective),
      overrides,
    );
    const byKey = new Map(entries.map((e) => [e.key, e]));
    const slotKeys = new Set(slots.map((s) => s.key));

    for (const [i, slot] of slots.entries()) {
      const result = results.get(slot.key)!;
      const autoValue: TimeValue | null = "error" in result ? null : result;
      const autoError = "error" in result ? result.error : null;
      const fields = {
        group: slot.group,
        label: slot.label,
        note: slot.note,
        source: "rule" as const,
        autoValue,
        autoError,
        sortOrder: i * 10,
      };
      const existing = byKey.get(slot.key);
      if (existing) {
        await tx.update(schema.scheduleEntry).set(fields).where(eq(schema.scheduleEntry.id, existing.id));
      } else {
        await tx.insert(schema.scheduleEntry).values({ weekId, key: slot.key, ...fields });
      }
    }

    // Rows whose slot was removed from the profile: keep them if a person set
    // a value (as manual rows), otherwise drop them.
    for (const entry of entries) {
      if (entry.source !== "rule" || slotKeys.has(entry.key)) continue;
      if (entry.overrideValue) {
        await tx
          .update(schema.scheduleEntry)
          .set({ source: "manual", autoValue: null, autoError: null })
          .where(eq(schema.scheduleEntry.id, entry.id));
      } else {
        await tx.delete(schema.scheduleEntry).where(eq(schema.scheduleEntry.id, entry.id));
      }
    }
  });
}

/** The value that gets published for a schedule row. */
export function effectiveValue(entry: Pick<ScheduleEntry, "overrideValue" | "autoValue">): TimeValue | null {
  return entry.overrideValue ?? entry.autoValue ?? null;
}

/** Re-sync every week that isn't final, e.g. after settings or profile rules change. */
export async function resyncOpenWeeks(profileId?: number): Promise<number> {
  const rows = await db.select().from(schema.week);
  const open = rows.filter((w) => w.status !== "final" && (profileId === undefined || w.profileId === profileId));
  for (const w of open) await syncWeek(w.id);
  return open.length;
}
