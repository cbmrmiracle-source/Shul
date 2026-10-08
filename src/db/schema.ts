import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { WeekCalendar } from "@/lib/calendar/week";
import type { ZmanimSettings } from "@/lib/calendar/zmanim";
import type { ContentTypeKey } from "@/lib/content/types";
import type { ScheduleGroup, ScheduleRule } from "@/lib/schedule/rules";
import type { TimeValue } from "@/lib/time";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** The shul. There is one row; settings live here so they can be edited in the app. */
export const organization = pgTable("organization", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  zip: text("zip").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  website: text("website").notNull().default(""),
  /** Uploaded logo; templates fall back to the bundled placeholder when unset. */
  logoAssetId: integer("logo_asset_id").references((): AnyPgColumn => asset.id, { onDelete: "set null" }),
  zmanim: jsonb("zmanim").$type<ZmanimSettings>().notNull(),
  /** Spelling fixes on top of Hebcal's Ashkenazi names, e.g. Bereshis → Bereishis. */
  houseSpellings: jsonb("house_spellings").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

/** A reusable set of davening times (e.g. "Summer 5786"). Weeks copy rules from it. */
export const scheduleProfile = pgTable("schedule_profile", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  /** Optional range used to pick the profile automatically for a new week. */
  activeFrom: date("active_from", { mode: "string" }),
  activeTo: date("active_to", { mode: "string" }),
  ...timestamps,
});

export const scheduleSlot = pgTable(
  "schedule_slot",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => scheduleProfile.id, { onDelete: "cascade" }),
    /** Stable identifier used by relative rules and by week entries, e.g. "shabbos_mincha". */
    key: text("key").notNull(),
    group: text("group").$type<ScheduleGroup>().notNull(),
    label: text("label").notNull(),
    rule: jsonb("rule").$type<ScheduleRule>().notNull(),
    /** Shown on the schedule but not a time row, e.g. "Followed by Farbrengen". */
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("schedule_slot_profile_key").on(t.profileId, t.key)],
);

export type WeekStatus = "draft" | "review" | "final";

/** Calendar fields a person may override for one week. */
export interface CalendarOverrides {
  shabbosTitleEn?: string;
  shabbosTitleHe?: string;
  hebrewYearHe?: string;
  /** Per-day zman overrides: { "2026-08-28": { candleLighting: 1170 } } */
  zmanim?: Record<string, Record<string, number>>;
}

export const week = pgTable("week", {
  id: serial("id").primaryKey(),
  shabbosDate: date("shabbos_date", { mode: "string" }).notNull().unique(),
  profileId: integer("profile_id").references(() => scheduleProfile.id, { onDelete: "set null" }),
  /** Snapshot of everything computed automatically. Replaced on every sync. */
  calendarAuto: jsonb("calendar_auto").$type<WeekCalendar>().notNull(),
  /** Manual corrections. Never touched by a sync. */
  calendarOverrides: jsonb("calendar_overrides").$type<CalendarOverrides>().notNull().default({}),
  status: text("status").$type<WeekStatus>().notNull().default("draft"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

/**
 * One row of the week's davening schedule. `autoValue` is recomputed from the
 * profile rule on every sync; `overrideValue` is set by a person and is never
 * overwritten. What gets published is override ?? auto.
 */
export const scheduleEntry = pgTable(
  "schedule_entry",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => week.id, { onDelete: "cascade" }),
    /** Matches schedule_slot.key for rule-based rows; "manual_<n>" for rows added by hand. */
    key: text("key").notNull(),
    group: text("group").$type<ScheduleGroup>().notNull(),
    label: text("label").notNull(),
    note: text("note").notNull().default(""),
    source: text("source").$type<"rule" | "manual">().notNull(),
    autoValue: jsonb("auto_value").$type<TimeValue | null>(),
    autoError: text("auto_error"),
    overrideValue: jsonb("override_value").$type<TimeValue | null>(),
    hidden: boolean("hidden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("schedule_entry_week_key").on(t.weekId, t.key)],
);

// ---------------------------------------------------------------------------
// Content (Phase 2)
// ---------------------------------------------------------------------------

/** An output the shul produces every week: email, print newsletter, a poster, a WhatsApp image. */
export const publication = pgTable("publication", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  /** Short label for the placement chips, e.g. "Print". */
  shortName: text("short_name").notNull(),
  format: text("format").$type<"email" | "print" | "poster" | "whatsapp">().notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** An uploaded file (images for now). The bytes live in file storage under `storageKey`. */
export const asset = pgTable("asset", {
  id: serial("id").primaryKey(),
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamps.createdAt,
});

export type ContentSource = "manual" | "import" | "ai";
export type ReviewStatus = "pending" | "approved";

/**
 * One piece of content: a sponsor, an event, a yahrzeit, a custom block…
 * Belongs to one week, or (weekId null + recurringFrom) repeats every week
 * from recurringFrom until recurringUntil.
 */
export const contentItem = pgTable(
  "content_item",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id").references(() => week.id, { onDelete: "cascade" }),
    type: text("type").$type<ContentTypeKey>().notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    /** Type-specific fields (speaker, location, Hebrew name, kids program status…). */
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    imageAssetId: integer("image_asset_id").references(() => asset.id, { onDelete: "set null" }),
    linkUrl: text("link_url").notNull().default(""),
    linkLabel: text("link_label").notNull().default(""),
    eventDate: date("event_date", { mode: "string" }),
    eventTime: text("event_time").notNull().default(""),
    hebrewDate: text("hebrew_date").notNull().default(""),
    source: text("source").$type<ContentSource>().notNull().default("manual"),
    /** For imported items: the person_date key it came from, so re-syncs don't duplicate it. */
    sourceRef: text("source_ref"),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("approved"),
    hidden: boolean("hidden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    recurringFrom: date("recurring_from", { mode: "string" }),
    recurringUntil: date("recurring_until", { mode: "string" }),
    ...timestamps,
  },
  (t) => [
    index("content_item_week").on(t.weekId),
    uniqueIndex("content_item_week_source_ref")
      .on(t.weekId, t.sourceRef)
      .where(sql`${t.sourceRef} is not null`),
  ],
);

/** How an item looks in one publication, when it differs from the main text. */
export interface PlacementVariant {
  title?: string;
  body?: string;
  hideImage?: boolean;
}

/** "This item appears in this publication." No row = not included. */
export const placement = pgTable(
  "placement",
  {
    id: serial("id").primaryKey(),
    contentItemId: integer("content_item_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    publicationId: integer("publication_id")
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    variant: jsonb("variant").$type<PlacementVariant>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("placement_item_publication").on(t.contentItemId, t.publicationId)],
);

/** A recurring item switched off for one particular week. */
export const contentWeekSkip = pgTable(
  "content_week_skip",
  {
    weekId: integer("week_id")
      .notNull()
      .references(() => week.id, { onDelete: "cascade" }),
    contentItemId: integer("content_item_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.weekId, t.contentItemId] })],
);

// ---------------------------------------------------------------------------
// Yahrzeit & birthday lists (pasted from the shul's spreadsheets)
// ---------------------------------------------------------------------------

export type PersonDateKind = "yahrzeit" | "birthday";

/** The master list. Each week picks the people whose Hebrew date falls in it. */
export const personDate = pgTable(
  "person_date",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<PersonDateKind>().notNull(),
    /** Stable hash of name + date, so pasting the sheet again doesn't create duplicates. */
    externalKey: text("external_key").notNull(),
    nameEn: text("name_en").notNull().default(""),
    nameHe: text("name_he").notNull().default(""),
    relation: text("relation").notNull().default(""),
    notes: text("notes").notNull().default(""),
    hebrewDay: integer("hebrew_day").notNull(),
    hebrewMonth: integer("hebrew_month").notNull(),
    hebrewYear: integer("hebrew_year"),
    /** The date exactly as it appeared in the spreadsheet. */
    dateText: text("date_text").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("person_date_kind_key").on(t.kind, t.externalKey)],
);

/** Remembers the last paste per list, including how columns were matched. */
export const personImport = pgTable("person_import", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<PersonDateKind>().notNull(),
  mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
  rowsImported: integer("rows_imported").notNull(),
  rowsSkipped: integer("rows_skipped").notNull(),
  createdAt: timestamps.createdAt,
});

export type Organization = typeof organization.$inferSelect;
export type ScheduleProfile = typeof scheduleProfile.$inferSelect;
export type ScheduleSlot = typeof scheduleSlot.$inferSelect;
export type Week = typeof week.$inferSelect;
export type ScheduleEntry = typeof scheduleEntry.$inferSelect;
export type Publication = typeof publication.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type ContentItem = typeof contentItem.$inferSelect;
export type Placement = typeof placement.$inferSelect;
export type PersonDate = typeof personDate.$inferSelect;
