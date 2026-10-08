import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { WeekCalendar } from "@/lib/calendar/week";
import type { ZmanimSettings } from "@/lib/calendar/zmanim";
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

export type Organization = typeof organization.$inferSelect;
export type ScheduleProfile = typeof scheduleProfile.$inferSelect;
export type ScheduleSlot = typeof scheduleSlot.$inferSelect;
export type Week = typeof week.$inferSelect;
export type ScheduleEntry = typeof scheduleEntry.$inferSelect;
