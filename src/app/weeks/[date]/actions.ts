"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { CalendarOverrides } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { ZMAN_KEYS } from "@/lib/calendar/zmanim";
import { effectiveDays, normalizeDays, SELECTABLE_DAYS } from "@/lib/schedule/days";
import { SCHEDULE_GROUPS } from "@/lib/schedule/rules";
import { parseTimeValue } from "@/lib/time";
import { syncWeek } from "@/lib/weeks";

const id = z.coerce.number().int().positive();

async function weekOfEntry(entryId: number) {
  const [row] = await db
    .select({ weekId: schema.scheduleEntry.weekId, shabbosDate: schema.week.shabbosDate })
    .from(schema.scheduleEntry)
    .innerJoin(schema.week, eq(schema.week.id, schema.scheduleEntry.weekId))
    .where(eq(schema.scheduleEntry.id, entryId));
  if (!row) throw new Error("Schedule row not found");
  return row;
}

async function weekById(weekId: number) {
  const [w] = await db.select().from(schema.week).where(eq(schema.week.id, weekId));
  if (!w) throw new Error("Week not found");
  return w;
}

export async function resyncWeek(form: FormData) {
  await requireAuth();
  const w = await weekById(id.parse(form.get("weekId")));
  await syncWeek(w.id);
  revalidatePath(`/weeks/${w.shabbosDate}`);
}

/** Set (or clear, if blank) the override for one davening row. */
export async function saveEntryOverride(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const overrideValue = parseTimeValue(String(form.get("value") ?? ""));
  const { weekId, shabbosDate } = await weekOfEntry(entryId);
  await db.update(schema.scheduleEntry).set({ overrideValue }).where(eq(schema.scheduleEntry.id, entryId));
  await syncWeek(weekId); // rows that depend on this one follow the new value
  revalidatePath(`/weeks/${shabbosDate}`);
}

export async function clearEntryOverride(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const { weekId, shabbosDate } = await weekOfEntry(entryId);
  await db.update(schema.scheduleEntry).set({ overrideValue: null }).where(eq(schema.scheduleEntry.id, entryId));
  await syncWeek(weekId);
  revalidatePath(`/weeks/${shabbosDate}`);
}

export async function toggleEntryHidden(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const hidden = form.get("hidden") === "true";
  const { shabbosDate } = await weekOfEntry(entryId);
  await db.update(schema.scheduleEntry).set({ hidden }).where(eq(schema.scheduleEntry.id, entryId));
  revalidatePath(`/weeks/${shabbosDate}`);
}

export async function addManualEntry(form: FormData) {
  await requireAuth();
  const input = z
    .object({
      weekId: id,
      group: z.enum(SCHEDULE_GROUPS),
      label: z.string().trim().min(1, "Label is required"),
      value: z.string(),
    })
    .parse(Object.fromEntries(form));
  const w = await weekById(input.weekId);
  const picked = form.getAll("day").map(Number).filter((d) => SELECTABLE_DAYS.includes(d));
  const days = picked.length ? normalizeDays(input.group, picked) : null;
  const [{ last }] = await db
    .select({ last: max(schema.scheduleEntry.sortOrder) })
    .from(schema.scheduleEntry)
    .where(and(eq(schema.scheduleEntry.weekId, w.id), eq(schema.scheduleEntry.group, input.group)));
  await db.insert(schema.scheduleEntry).values({
    weekId: w.id,
    key: `manual_${crypto.randomUUID().slice(0, 8)}`,
    group: input.group,
    label: input.label,
    source: "manual",
    overrideValue: parseTimeValue(input.value),
    days,
    sortOrder: (last ?? 0) + 1,
  });
  revalidatePath(`/weeks/${w.shabbosDate}`);
}

export async function deleteManualEntry(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const { shabbosDate } = await weekOfEntry(entryId);
  await db
    .delete(schema.scheduleEntry)
    .where(and(eq(schema.scheduleEntry.id, entryId), eq(schema.scheduleEntry.source, "manual")));
  revalidatePath(`/weeks/${shabbosDate}`);
}

export async function saveTitleOverrides(form: FormData) {
  await requireAuth();
  const w = await weekById(id.parse(form.get("weekId")));
  const clean = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const overrides: CalendarOverrides = {
    ...w.calendarOverrides,
    shabbosTitleEn: clean("shabbosTitleEn"),
    shabbosTitleHe: clean("shabbosTitleHe"),
    hebrewYearHe: clean("hebrewYearHe"),
  };
  await db.update(schema.week).set({ calendarOverrides: overrides }).where(eq(schema.week.id, w.id));
  revalidatePath(`/weeks/${w.shabbosDate}`);
}

/** Override one zman for one day (blank clears it), then re-run rules that depend on it. */
export async function saveZmanOverride(form: FormData) {
  await requireAuth();
  const input = z
    .object({ weekId: id, date: z.string(), zman: z.enum(ZMAN_KEYS), value: z.string() })
    .parse(Object.fromEntries(form));
  const w = await weekById(input.weekId);
  if (!w.calendarAuto.days.some((d) => d.date === input.date)) throw new Error("Date not in this week");

  const parsed = parseTimeValue(input.value);
  if (parsed && !("times" in parsed && parsed.times.length === 1)) {
    throw new Error(`"${input.value}" is not a single time, e.g. 7:30 PM`);
  }
  const zmanim = structuredClone(w.calendarOverrides.zmanim ?? {});
  const day = { ...(zmanim[input.date] ?? {}) };
  if (parsed) day[input.zman] = parsed.times[0];
  else delete day[input.zman];
  if (Object.keys(day).length) zmanim[input.date] = day;
  else delete zmanim[input.date];

  await db
    .update(schema.week)
    .set({ calendarOverrides: { ...w.calendarOverrides, zmanim } })
    .where(eq(schema.week.id, w.id));
  await syncWeek(w.id);
  revalidatePath(`/weeks/${w.shabbosDate}`);
}

/** Switch one day on or off for a Sunday–Thursday row (at least one day stays on). */
export async function toggleEntryDay(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const day = z.coerce.number().int().min(0).max(4).parse(form.get("day"));
  const [entry] = await db.select().from(schema.scheduleEntry).where(eq(schema.scheduleEntry.id, entryId));
  if (!entry) throw new Error("Schedule row not found");
  const current = effectiveDays(entry);
  if (!current) throw new Error("Days can only be set on Sunday–Thursday rows");
  const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
  if (next.length === 0) return;
  const { weekId, shabbosDate } = await weekOfEntry(entryId);
  await db
    .update(schema.scheduleEntry)
    .set({ days: normalizeDays(entry.group, next) })
    .where(eq(schema.scheduleEntry.id, entryId));
  await syncWeek(weekId); // times based on zmanim follow the chosen days
  revalidatePath(`/weeks/${shabbosDate}`);
}

/** Move a row up or down within its section; the week then keeps this order. */
export async function moveEntry(form: FormData) {
  await requireAuth();
  const entryId = id.parse(form.get("entryId"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const { weekId, shabbosDate } = await weekOfEntry(entryId);
  const rows = await db
    .select()
    .from(schema.scheduleEntry)
    .where(eq(schema.scheduleEntry.weekId, weekId))
    .orderBy(asc(schema.scheduleEntry.sortOrder), asc(schema.scheduleEntry.id));
  const entry = rows.find((r) => r.id === entryId)!;
  const siblings = rows.filter((r) => r.group === entry.group);
  const i = siblings.findIndex((r) => r.id === entryId);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return;
  // Swap within the group, then renumber the whole week to keep groups in order.
  const swapped = [...siblings];
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  const ordered = rows.map((r) => (r.group === entry.group ? swapped.shift()! : r));
  await db.transaction(async (tx) => {
    for (const [n, r] of ordered.entries()) {
      await tx.update(schema.scheduleEntry).set({ sortOrder: (n + 1) * 10 }).where(eq(schema.scheduleEntry.id, r.id));
    }
    await tx.update(schema.week).set({ customOrder: true }).where(eq(schema.week.id, weekId));
  });
  revalidatePath(`/weeks/${shabbosDate}`);
}
