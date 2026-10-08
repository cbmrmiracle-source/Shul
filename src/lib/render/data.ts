import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Organization, Week } from "@/db/schema";
import type { DayInfo } from "@/lib/calendar/week";
import { listPublications, listWeekContent } from "@/lib/content/service";
import type { ContentTypeKey, PublicationKey } from "@/lib/content/types";
import type { ScheduleGroup } from "@/lib/schedule/rules";
import { formatTime, formatTimeValue, type TimeValue } from "@/lib/time";
import { storage } from "@/lib/storage";
import { effectiveCalendar, effectiveValue, getOrganization, listEntries } from "@/lib/weeks";

export interface ScheduleRow {
  key: string;
  label: string;
  note: string;
  /** "7:27PM", "6:30 / 7:30AM", "B'zman" */
  display: string;
  value: TimeValue | null;
}

export interface RenderItem {
  id: number;
  type: ContentTypeKey;
  title: string;
  body: string;
  fields: Record<string, string>;
  eventDate: string | null;
  eventTime: string;
  hebrewDate: string;
  linkUrl: string;
  linkLabel: string;
  /** data: URL, or null */
  image: string | null;
}

export interface RenderData {
  org: Pick<Organization, "name" | "address" | "phone" | "email" | "website">;
  /** data: URL of the logo */
  logo: string;
  titleEn: string;
  titleHe: string;
  yearHe: string;
  days: DayInfo[];
  schedule: Record<ScheduleGroup, ScheduleRow[]>;
  candleLighting: string;
  shabbosEnds: string;
  /** Approved, visible items placed in each publication, in display order. */
  items: Partial<Record<PublicationKey, RenderItem[]>>;
  /** Placed items left out because they still need review. */
  pendingCount: Partial<Record<PublicationKey, number>>;
}

const PLACEHOLDER_LOGO = path.join(process.cwd(), "public/brand/logo-placeholder.png");

async function assetDataUrl(assetId: number | null): Promise<string | null> {
  if (!assetId) return null;
  const [asset] = await db.select().from(schema.asset).where(eq(schema.asset.id, assetId));
  if (!asset) return null;
  const data = await storage.get(asset.storageKey).catch(() => null);
  return data ? `data:${asset.mime};base64,${data.toString("base64")}` : null;
}

async function logoDataUrl(org: Organization): Promise<string> {
  const uploaded = await assetDataUrl(org.logoAssetId);
  if (uploaded) return uploaded;
  return `data:image/png;base64,${(await readFile(PLACEHOLDER_LOGO)).toString("base64")}`;
}

/** The value shown for a schedule row with this key, or a zman fallback. */
function rowDisplay(rows: ScheduleRow[], key: string, fallback: number | null, fmt: (n: number) => string) {
  const row = rows.find((r) => r.key === key);
  if (row?.display) return row.display;
  return fallback === null ? "" : fmt(fallback);
}

/** Everything a template needs for one week, with overrides applied and hidden things removed. */
export async function buildRenderData(week: Week): Promise<RenderData> {
  const [org, entries, items, pubs] = await Promise.all([
    getOrganization(),
    listEntries(week.id),
    listWeekContent(week),
    listPublications(),
  ]);
  const cal = effectiveCalendar(week.calendarAuto, week.calendarOverrides);

  const schedule: Record<ScheduleGroup, ScheduleRow[]> = { friday: [], shabbos: [], sunday: [], weekday: [] };
  for (const e of entries) {
    if (e.hidden) continue;
    const value = effectiveValue(e);
    schedule[e.group].push({ key: e.key, label: e.label, note: e.note, value, display: formatTimeValue(value) });
  }

  const visible = items.filter((i) => !i.hidden && !i.skipped);
  const imageIds = [...new Set(visible.map((i) => i.imageAssetId).filter((x): x is number => x !== null))];
  const images = new Map<number, string>();
  if (imageIds.length) {
    const assets = await db.select().from(schema.asset).where(inArray(schema.asset.id, imageIds));
    for (const a of assets) {
      const data = await storage.get(a.storageKey).catch(() => null);
      if (data) images.set(a.id, `data:${a.mime};base64,${data.toString("base64")}`);
    }
  }

  const byPub: RenderData["items"] = {};
  const pendingCount: RenderData["pendingCount"] = {};
  for (const pub of pubs) {
    const key = pub.key as PublicationKey;
    const placed = visible.filter((i) => i.placements.has(pub.id));
    pendingCount[key] = placed.filter((i) => i.reviewStatus === "pending").length;
    byPub[key] = placed
      .filter((i) => i.reviewStatus === "approved")
      .map((i) => {
        const v = i.placements.get(pub.id) ?? {};
        return {
          id: i.id,
          type: i.type,
          title: v.title || i.title,
          body: v.body || i.body,
          fields: i.fields,
          eventDate: i.eventDate,
          eventTime: i.eventTime,
          hebrewDate: i.hebrewDate,
          linkUrl: i.linkUrl,
          linkLabel: i.linkLabel,
          image: v.hideImage || !i.imageAssetId ? null : (images.get(i.imageAssetId) ?? null),
        };
      });
  }

  return {
    org: { name: org.name, address: org.address, phone: org.phone, email: org.email, website: org.website },
    logo: await logoDataUrl(org),
    titleEn: cal.shabbosTitle.en,
    titleHe: cal.shabbosTitle.he,
    yearHe: cal.hebrewYearHe,
    days: cal.days,
    schedule,
    candleLighting: rowDisplay(schedule.friday, "candle_lighting", cal.days[0].zmanim.candleLighting, formatTime),
    shabbosEnds: rowDisplay(schedule.shabbos, "shabbos_ends", cal.days[1].zmanim.shabbosEnds, formatTime),
    items: byPub,
    pendingCount,
  };
}
