import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContentItem, PersonDate, PlacementVariant, Publication, Week } from "@/db/schema";
import { addDays } from "@/lib/calendar/dates";
import {
  anniversariesBetween,
  formatHebrewDateEn,
  formatHebrewDateHe,
  type HebrewDateParts,
} from "@/lib/calendar/hebrew-dates";
import { CONTENT_TYPE_ORDER, CONTENT_TYPES, DEFAULT_PUBLICATIONS, type ContentTypeKey } from "./types";

export async function ensurePublications(): Promise<void> {
  await db
    .insert(schema.publication)
    .values(DEFAULT_PUBLICATIONS.map((p, i) => ({ ...p, sortOrder: i })))
    .onConflictDoNothing({ target: schema.publication.key });
}

export async function listPublications(): Promise<Publication[]> {
  return db
    .select()
    .from(schema.publication)
    .where(eq(schema.publication.active, true))
    .orderBy(asc(schema.publication.sortOrder));
}

export interface WeekContentItem extends ContentItem {
  /** publicationId → variant */
  placements: Map<number, PlacementVariant>;
  recurring: boolean;
  /** Recurring item switched off for this week only. */
  skipped: boolean;
}

/** Whether a content item shows in a given week (its own, or a recurring one in range). */
function inWeek(week: Pick<Week, "id" | "shabbosDate">) {
  return or(
    eq(schema.contentItem.weekId, week.id),
    and(
      isNull(schema.contentItem.weekId),
      lte(schema.contentItem.recurringFrom, week.shabbosDate),
      or(isNull(schema.contentItem.recurringUntil), gte(schema.contentItem.recurringUntil, week.shabbosDate)),
    ),
  );
}

export async function listWeekContent(week: Pick<Week, "id" | "shabbosDate">): Promise<WeekContentItem[]> {
  const items = await db
    .select()
    .from(schema.contentItem)
    .where(inWeek(week))
    .orderBy(asc(schema.contentItem.sortOrder), asc(schema.contentItem.id));
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const [placements, skips] = await Promise.all([
    db.select().from(schema.placement).where(inArray(schema.placement.contentItemId, ids)),
    db
      .select()
      .from(schema.contentWeekSkip)
      .where(and(eq(schema.contentWeekSkip.weekId, week.id), inArray(schema.contentWeekSkip.contentItemId, ids))),
  ]);
  const skipped = new Set(skips.map((s) => s.contentItemId));
  const typeRank = new Map(CONTENT_TYPE_ORDER.map((t, i) => [t, i]));
  return items
    .map((item) => ({
      ...item,
      placements: new Map(
        placements.filter((p) => p.contentItemId === item.id).map((p) => [p.publicationId, p.variant]),
      ),
      recurring: item.weekId === null,
      skipped: skipped.has(item.id),
    }))
    .sort((a, b) => (typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99));
}

export async function getItem(id: number): Promise<ContentItem | null> {
  const [row] = await db.select().from(schema.contentItem).where(eq(schema.contentItem.id, id));
  return row ?? null;
}

export async function getItemPlacements(itemId: number) {
  return db.select().from(schema.placement).where(eq(schema.placement.contentItemId, itemId));
}

/** Is this item part of this week (directly or as a recurring item)? */
export async function itemBelongsToWeek(itemId: number, week: Pick<Week, "id" | "shabbosDate">) {
  const [row] = await db
    .select({ id: schema.contentItem.id })
    .from(schema.contentItem)
    .where(and(eq(schema.contentItem.id, itemId), inWeek(week)));
  return Boolean(row);
}

export type ItemInput = Pick<
  ContentItem,
  "title" | "body" | "fields" | "imageAssetId" | "linkUrl" | "linkLabel" | "eventDate" | "eventTime" | "hebrewDate"
> & { recurringUntil: string | null };

async function nextSortOrder(weekId: number | null, type: ContentTypeKey): Promise<number> {
  const [{ last }] = await db
    .select({ last: sql<number | null>`max(${schema.contentItem.sortOrder})` })
    .from(schema.contentItem)
    .where(
      and(
        weekId === null ? isNull(schema.contentItem.weekId) : eq(schema.contentItem.weekId, weekId),
        eq(schema.contentItem.type, type),
      ),
    );
  return (last ?? 0) + 10;
}

/** Create an item for a week (or recurring from that week), placed in the type's default publications. */
export async function createItem(
  week: Pick<Week, "id" | "shabbosDate">,
  type: ContentTypeKey,
  input: ItemInput & { recurring: boolean },
  publicationIds?: number[],
): Promise<ContentItem> {
  const { recurring, recurringUntil, ...rest } = input;
  const weekId = recurring ? null : week.id;
  const [item] = await db
    .insert(schema.contentItem)
    .values({
      ...rest,
      type,
      weekId,
      recurringFrom: recurring ? week.shabbosDate : null,
      recurringUntil: recurring ? recurringUntil : null,
      source: "manual",
      reviewStatus: "approved",
      sortOrder: await nextSortOrder(weekId, type),
    })
    .returning();
  const pubs =
    publicationIds ??
    (await listPublications())
      .filter((p) => (CONTENT_TYPES[type].defaultPlacements as string[]).includes(p.key))
      .map((p) => p.id);
  if (pubs.length) {
    await db.insert(schema.placement).values(pubs.map((publicationId) => ({ contentItemId: item.id, publicationId })));
  }
  return item;
}

/**
 * Update an item. Switching "repeat every week" on detaches it from the week;
 * switching it off pins it back to `week`.
 */
export async function updateItem(
  id: number,
  week: Pick<Week, "id" | "shabbosDate">,
  input: ItemInput & { recurring: boolean },
): Promise<void> {
  const existing = await getItem(id);
  if (!existing) throw new Error("Item not found");
  const { recurring, recurringUntil, ...rest } = input;
  await db
    .update(schema.contentItem)
    .set({
      ...rest,
      weekId: recurring ? null : week.id,
      recurringFrom: recurring ? (existing.recurringFrom ?? week.shabbosDate) : null,
      recurringUntil: recurring ? recurringUntil : null,
    })
    .where(eq(schema.contentItem.id, id));
}

/** Replace an item's placements (publication id → variant). */
export async function setPlacements(itemId: number, placements: Map<number, PlacementVariant>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.placement).where(eq(schema.placement.contentItemId, itemId));
    if (placements.size) {
      await tx
        .insert(schema.placement)
        .values([...placements].map(([publicationId, variant]) => ({ contentItemId: itemId, publicationId, variant })));
    }
  });
}

export async function togglePlacement(itemId: number, publicationId: number, on: boolean): Promise<void> {
  if (on) {
    await db.insert(schema.placement).values({ contentItemId: itemId, publicationId }).onConflictDoNothing();
  } else {
    await db
      .delete(schema.placement)
      .where(and(eq(schema.placement.contentItemId, itemId), eq(schema.placement.publicationId, publicationId)));
  }
}

/** Hide an item for this week. Recurring items are skipped for this week only. */
export async function setHiddenForWeek(itemId: number, weekId: number, hidden: boolean): Promise<void> {
  const item = await getItem(itemId);
  if (!item) return;
  if (item.weekId === null) {
    if (hidden) {
      await db.insert(schema.contentWeekSkip).values({ weekId, contentItemId: itemId }).onConflictDoNothing();
    } else {
      await db
        .delete(schema.contentWeekSkip)
        .where(and(eq(schema.contentWeekSkip.weekId, weekId), eq(schema.contentWeekSkip.contentItemId, itemId)));
    }
  } else {
    await db.update(schema.contentItem).set({ hidden }).where(eq(schema.contentItem.id, itemId));
  }
}

export async function approveItems(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(schema.contentItem).set({ reviewStatus: "approved" }).where(inArray(schema.contentItem.id, ids));
}

export async function deleteItem(id: number): Promise<void> {
  await db.delete(schema.contentItem).where(eq(schema.contentItem.id, id));
}

// ---------------------------------------------------------------------------
// Yahrzeits & birthdays
// ---------------------------------------------------------------------------

/** The days whose yahrzeits/birthdays a week lists: Shabbos through the following Friday. */
export function anniversaryWindow(shabbosDate: string): [string, string] {
  return [shabbosDate, addDays(shabbosDate, 6)];
}

function partsOf(p: PersonDate): HebrewDateParts {
  return { day: p.hebrewDay, month: p.hebrewMonth, year: p.hebrewYear ?? undefined };
}

/**
 * Add pending-review items for every yahrzeit/birthday that falls in the
 * week. Items already there (even edited or approved) are left alone; pending
 * items that no longer match the list (e.g. after a corrected paste) are removed.
 */
export async function generateAnniversaryItems(week: Pick<Week, "id" | "shabbosDate">): Promise<number> {
  const [start, end] = anniversaryWindow(week.shabbosDate);
  const people = await db.select().from(schema.personDate);
  const pubs = await listPublications();

  const matches: { person: PersonDate; occursOn: string; hebrewDate: string }[] = [];
  for (const person of people) {
    for (const hd of anniversariesBetween(person.kind, partsOf(person), start, end)) {
      const occurrence: HebrewDateParts = { day: hd.getDate(), month: hd.getMonth() };
      matches.push({
        person,
        occursOn: hd.greg().toLocaleDateString("en-CA"),
        // Yahrzeits show the original date (as in the email); birthdays show this year's date.
        hebrewDate:
          person.kind === "yahrzeit" && person.hebrewYear
            ? formatHebrewDateHe(partsOf(person))
            : formatHebrewDateEn(occurrence),
      });
    }
  }
  matches.sort((a, b) => a.occursOn.localeCompare(b.occursOn) || a.person.nameEn.localeCompare(b.person.nameEn));

  const existing = await db
    .select({ id: schema.contentItem.id, sourceRef: schema.contentItem.sourceRef, reviewStatus: schema.contentItem.reviewStatus })
    .from(schema.contentItem)
    .where(and(eq(schema.contentItem.weekId, week.id), eq(schema.contentItem.source, "import")));
  const existingRefs = new Set(existing.map((e) => e.sourceRef));
  const wanted = new Set(matches.map((m) => `${m.person.kind}:${m.person.externalKey}`));

  const stale = existing.filter((e) => e.reviewStatus === "pending" && e.sourceRef && !wanted.has(e.sourceRef));
  if (stale.length) await db.delete(schema.contentItem).where(inArray(schema.contentItem.id, stale.map((s) => s.id)));

  let added = 0;
  for (const [i, m] of matches.entries()) {
    const sourceRef = `${m.person.kind}:${m.person.externalKey}`;
    if (existingRefs.has(sourceRef)) continue;
    const type: ContentTypeKey = m.person.kind;
    const [item] = await db
      .insert(schema.contentItem)
      .values({
        weekId: week.id,
        type,
        title: m.person.nameEn,
        hebrewDate: m.hebrewDate,
        fields: {
          ...(m.person.nameHe ? { nameHe: m.person.nameHe } : {}),
          ...(m.person.relation ? { relation: m.person.relation } : {}),
          occursOn: m.occursOn,
        },
        source: "import",
        sourceRef,
        reviewStatus: "pending",
        sortOrder: i,
      })
      .onConflictDoNothing()
      .returning();
    if (!item) continue;
    const defaults = pubs.filter((p) => (CONTENT_TYPES[type].defaultPlacements as string[]).includes(p.key));
    if (defaults.length) {
      await db.insert(schema.placement).values(defaults.map((p) => ({ contentItemId: item.id, publicationId: p.id })));
    }
    added++;
  }
  return added;
}
