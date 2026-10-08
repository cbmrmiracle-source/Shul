"use server";

import { and, asc, eq, max, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import { ZMAN_KEYS } from "@/lib/calendar/zmanim";
import { SCHEDULE_GROUPS, type ScheduleRule } from "@/lib/schedule/rules";
import { parseTimeValue } from "@/lib/time";
import { resyncOpenWeeks } from "@/lib/weeks";

const id = z.coerce.number().int().positive();
const optionalDate = z
  .string()
  .transform((s) => s.trim() || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

export type FormResult = { error?: string; ok?: string } | null;

/** Build a rule from the slot form; only the fields for the chosen kind are read. */
function ruleFromForm(form: FormData): ScheduleRule {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const offset = Number(get("offset") || 0);
  const round = z.enum(["none", "down5", "up5", "nearest5"]).parse(get("round") || "none");
  if (!Number.isInteger(offset)) throw new Error("Offset must be whole minutes");
  switch (get("kind")) {
    case "fixed": {
      const v = parseTimeValue(get("times"));
      if (!v || !("times" in v)) throw new Error(`"${get("times")}" isn't a time, e.g. 6:30 / 7:30 AM`);
      return { kind: "fixed", times: v.times };
    }
    case "zman":
      return { kind: "zman", zman: z.enum(ZMAN_KEYS).parse(get("zman")), offset, round };
    case "relative":
      if (!get("slotKey")) throw new Error("Choose which row this is relative to");
      return { kind: "relative", slotKey: get("slotKey"), offset, round };
    case "text":
      if (!get("text")) throw new Error("Enter the text to show");
      return { kind: "text", text: get("text") };
    default:
      throw new Error("Choose a rule type");
  }
}

async function afterProfileChange(profileId: number) {
  await resyncOpenWeeks(profileId);
  revalidatePath("/profiles", "layout");
  revalidatePath("/weeks", "layout");
}

export async function createProfile(form: FormData) {
  await requireAuth();
  const name = z.string().trim().min(1).parse(form.get("name"));
  const copyFrom = String(form.get("copyFrom") ?? "");
  const [profile] = await db.insert(schema.scheduleProfile).values({ name }).returning();
  if (copyFrom) {
    const slots = await db
      .select()
      .from(schema.scheduleSlot)
      .where(eq(schema.scheduleSlot.profileId, id.parse(copyFrom)));
    if (slots.length) {
      await db.insert(schema.scheduleSlot).values(
        slots.map(({ key, group, label, rule, note, sortOrder }) => ({
          profileId: profile.id,
          key,
          group,
          label,
          rule,
          note,
          sortOrder,
        })),
      );
    }
  }
  redirect(`/profiles/${profile.id}`);
}

export async function saveProfile(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireAuth();
  const parsed = z
    .object({
      profileId: id,
      name: z.string().trim().min(1),
      activeFrom: optionalDate,
      activeTo: optionalDate,
      isDefault: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { profileId, name, activeFrom, activeTo, isDefault } = parsed.data;
  await db.transaction(async (tx) => {
    if (isDefault) {
      await tx
        .update(schema.scheduleProfile)
        .set({ isDefault: false })
        .where(ne(schema.scheduleProfile.id, profileId));
    }
    await tx
      .update(schema.scheduleProfile)
      .set({ name, activeFrom, activeTo, isDefault: Boolean(isDefault) })
      .where(eq(schema.scheduleProfile.id, profileId));
  });
  revalidatePath("/profiles", "layout");
  return { ok: "Saved." };
}

export async function saveSlot(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireAuth();
  try {
    const slotId = id.parse(form.get("slotId"));
    const label = z.string().trim().min(1, "Label is required").parse(form.get("label"));
    const group = z.enum(SCHEDULE_GROUPS).parse(form.get("group"));
    const note = String(form.get("note") ?? "").trim();
    const rule = ruleFromForm(form);
    const [slot] = await db
      .update(schema.scheduleSlot)
      .set({ label, group, note, rule })
      .where(eq(schema.scheduleSlot.id, slotId))
      .returning();
    await afterProfileChange(slot.profileId);
    return { ok: "Saved and applied to open weeks." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addSlot(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireAuth();
  try {
    const profileId = id.parse(form.get("profileId"));
    const label = z.string().trim().min(1, "Label is required").parse(form.get("label"));
    const group = z.enum(SCHEDULE_GROUPS).parse(form.get("group"));
    const base = `${group}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    const existing = await db
      .select({ key: schema.scheduleSlot.key })
      .from(schema.scheduleSlot)
      .where(eq(schema.scheduleSlot.profileId, profileId));
    const taken = new Set(existing.map((s) => s.key));
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    const [{ last }] = await db
      .select({ last: max(schema.scheduleSlot.sortOrder) })
      .from(schema.scheduleSlot)
      .where(eq(schema.scheduleSlot.profileId, profileId));
    await db.insert(schema.scheduleSlot).values({
      profileId,
      key,
      group,
      label,
      rule: ruleFromForm(form),
      note: String(form.get("note") ?? "").trim(),
      sortOrder: (last ?? 0) + 1,
    });
    await afterProfileChange(profileId);
    return { ok: "Added." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSlot(form: FormData) {
  await requireAuth();
  const slotId = id.parse(form.get("slotId"));
  const [slot] = await db.delete(schema.scheduleSlot).where(eq(schema.scheduleSlot.id, slotId)).returning();
  if (slot) await afterProfileChange(slot.profileId);
}

/** Move a slot up or down within its group. */
export async function moveSlot(form: FormData) {
  await requireAuth();
  const slotId = id.parse(form.get("slotId"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const [slot] = await db.select().from(schema.scheduleSlot).where(eq(schema.scheduleSlot.id, slotId));
  if (!slot) return;
  const siblings = await db
    .select()
    .from(schema.scheduleSlot)
    .where(and(eq(schema.scheduleSlot.profileId, slot.profileId), eq(schema.scheduleSlot.group, slot.group)))
    .orderBy(asc(schema.scheduleSlot.sortOrder), asc(schema.scheduleSlot.id));
  const i = siblings.findIndex((s) => s.id === slotId);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  await db.transaction(async (tx) => {
    for (const [n, s] of siblings.entries()) {
      await tx.update(schema.scheduleSlot).set({ sortOrder: n }).where(eq(schema.scheduleSlot.id, s.id));
    }
  });
  await afterProfileChange(slot.profileId);
}
