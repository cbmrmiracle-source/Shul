"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlacementVariant } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import {
  approveItems,
  createItem,
  deleteItem,
  getItem,
  itemBelongsToWeek,
  listPublications,
  listWeekContent,
  setHiddenForWeek,
  setPlacements,
  togglePlacement,
  updateItem,
} from "@/lib/content/service";
import { CONTENT_TYPES, isContentType } from "@/lib/content/types";
import { saveImage } from "@/lib/storage/images";
import { getWeekByDate } from "@/lib/weeks";

const id = z.coerce.number().int().positive();

async function loadWeek(date: string) {
  if (!isCivilDate(date)) throw new Error("Bad week");
  const week = await getWeekByDate(date);
  if (!week) throw new Error("Week not found");
  return week;
}

async function loadItemInWeek(date: string, itemId: number) {
  const week = await loadWeek(date);
  if (!(await itemBelongsToWeek(itemId, week))) throw new Error("That item isn't part of this week");
  return week;
}

/** Links end up in emails; only allow web and mailto links. */
const link = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => s === "" || /^(https?:\/\/|mailto:)/i.test(s), "Links must start with https:// or mailto:");
const text = (max: number) => z.string().trim().max(max);

export type SaveItemResult = { error: string } | null;

export async function saveItem(_prev: SaveItemResult, form: FormData): Promise<SaveItemResult> {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const typeKey = String(form.get("type") ?? "");
  if (!isContentType(typeKey)) return { error: "Unknown content type" };
  const type = CONTENT_TYPES[typeKey];
  const rawId = String(form.get("itemId") ?? "");
  let itemId: number | null = null;

  try {
    const week = rawId ? await loadItemInWeek(date, Number(rawId)) : await loadWeek(date);
    const get = (k: string) => String(form.get(k) ?? "");

    const fields: Record<string, string> = {};
    for (const f of type.extra) {
      const value = f.input === "url" ? link.parse(get(`f_${f.name}`)) : text(5000).parse(get(`f_${f.name}`));
      if (value) fields[f.name] = value;
    }
    const eventDate = get("eventDate").trim();
    if (eventDate && !isCivilDate(eventDate)) return { error: "Please enter a valid date" };
    const recurring = type.recurring && form.get("recurring") === "on";
    const recurringUntil = get("recurringUntil").trim();
    if (recurringUntil && !isCivilDate(recurringUntil)) return { error: "Please enter a valid end date" };

    let imageAssetId: number | null = rawId ? ((await getItem(Number(rawId)))?.imageAssetId ?? null) : null;
    if (form.get("removeImage") === "on") imageAssetId = null;
    const upload = form.get("image");
    if (upload instanceof File && upload.size > 0) imageAssetId = (await saveImage(upload)).id;

    const input = {
      title: text(500).parse(get("title")),
      body: text(20000).parse(get("body")),
      fields,
      imageAssetId,
      linkUrl: link.parse(get("linkUrl")),
      linkLabel: text(200).parse(get("linkLabel")),
      eventDate: eventDate || null,
      eventTime: text(100).parse(get("eventTime")),
      hebrewDate: text(200).parse(get("hebrewDate")),
      recurring,
      recurringUntil: recurringUntil || null,
    };
    if (type.titleRequired && !input.title) return { error: `${type.common.title?.label ?? "Title"} is required` };
    if (!input.title && !input.body && !imageAssetId && !input.linkUrl && Object.keys(fields).length === 0) {
      return { error: "Please fill in at least one field" };
    }

    const publications = await listPublications();
    const placements = new Map<number, PlacementVariant>();
    for (const p of publications) {
      if (form.get(`pub_${p.id}`) !== "on") continue;
      const variant: PlacementVariant = {};
      const vt = text(500).parse(get(`v_${p.id}_title`));
      const vb = text(5000).parse(get(`v_${p.id}_body`));
      if (vt) variant.title = vt;
      if (vb) variant.body = vb;
      if (form.get(`v_${p.id}_hideImage`) === "on") variant.hideImage = true;
      placements.set(p.id, variant);
    }

    if (rawId) {
      itemId = Number(rawId);
      await updateItem(itemId, week, input);
    } else {
      itemId = (await createItem(week, typeKey, input, [])).id;
    }
    await setPlacements(itemId, placements);
    // Saving an item is reviewing it.
    await approveItems([itemId]);
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/weeks/${date}`);
  redirect(`/weeks/${date}#item-${itemId}`);
}

export async function removeItem(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const itemId = id.parse(form.get("itemId"));
  await loadItemInWeek(date, itemId);
  await deleteItem(itemId);
  revalidatePath(`/weeks/${date}`);
  redirect(`/weeks/${date}`);
}

export async function toggleItemPlacement(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const itemId = id.parse(form.get("itemId"));
  await loadItemInWeek(date, itemId);
  await togglePlacement(itemId, id.parse(form.get("publicationId")), form.get("on") === "true");
  revalidatePath(`/weeks/${date}`);
}

export async function setItemHidden(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const itemId = id.parse(form.get("itemId"));
  const week = await loadItemInWeek(date, itemId);
  await setHiddenForWeek(itemId, week.id, form.get("hidden") === "true");
  revalidatePath(`/weeks/${date}`);
}

export async function approveItem(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const itemId = id.parse(form.get("itemId"));
  await loadItemInWeek(date, itemId);
  await approveItems([itemId]);
  revalidatePath(`/weeks/${date}`);
}

export async function approveAllPending(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const week = await loadWeek(date);
  const items = await listWeekContent(week);
  await approveItems(items.filter((i) => i.reviewStatus === "pending" && !i.hidden && !i.skipped).map((i) => i.id));
  revalidatePath(`/weeks/${date}`);
}

/** Save the whole placement grid at once. */
export async function savePlacementGrid(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  const week = await loadWeek(date);
  const items = await listWeekContent(week);
  const pubs = await listPublications();
  const ids = new Set(String(form.get("itemIds") ?? "").split(",").filter(Boolean).map(Number));
  for (const item of items) {
    if (!ids.has(item.id)) continue;
    const next = new Map<number, PlacementVariant>();
    for (const p of pubs) {
      if (form.get(`p_${item.id}_${p.id}`) === "on") next.set(p.id, item.placements.get(p.id) ?? {});
    }
    await setPlacements(item.id, next);
  }
  revalidatePath(`/weeks/${date}`);
  redirect(`/weeks/${date}#content`);
}
