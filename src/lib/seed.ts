import { db, schema } from "@/db";
import { DEFAULT_HOUSE_SPELLINGS } from "@/lib/calendar/week";
import { DEFAULT_ZMANIM_SETTINGS } from "@/lib/calendar/zmanim";
import type { ScheduleGroup, ScheduleRule } from "@/lib/schedule/rules";
import { ensurePublications } from "@/lib/content/service";

const t = (h: number, m = 0) => h * 60 + m;

/** Davening times from the Ki Savo 5786 newsletter, expressed as rules. */
export const SUMMER_SLOTS: {
  key: string;
  group: ScheduleGroup;
  label: string;
  rule: ScheduleRule;
  note?: string;
}[] = [
  { key: "fri_shacharis", group: "friday", label: "Shacharis", rule: { kind: "fixed", times: [t(6, 30), t(7, 30)] } },
  { key: "candle_lighting", group: "friday", label: "Candle Lighting", rule: { kind: "zman", zman: "candleLighting", offset: 0, round: "none" } },
  { key: "fri_mincha", group: "friday", label: "Mincha", rule: { kind: "relative", slotKey: "candle_lighting", offset: 8, round: "none" } },
  { key: "kabolas_shabbos", group: "friday", label: "Kabolas Shabbos", rule: { kind: "relative", slotKey: "candle_lighting", offset: 28, round: "none" } },
  { key: "chassidus", group: "shabbos", label: "Chassidus", rule: { kind: "fixed", times: [t(9, 15)] } },
  { key: "shabbos_shacharis", group: "shabbos", label: "Shacharis", rule: { kind: "fixed", times: [t(10)] }, note: "Followed by Farbrengen" },
  { key: "sicha_shiur", group: "shabbos", label: "Shiur in Likutei Sichos", rule: { kind: "relative", slotKey: "shabbos_mincha", offset: -60, round: "none" } },
  { key: "shabbos_mincha", group: "shabbos", label: "Mincha", rule: { kind: "zman", zman: "sunset", offset: -18, round: "down5" } },
  { key: "shabbos_ends", group: "shabbos", label: "Maariv / Shabbos Ends", rule: { kind: "zman", zman: "shabbosEnds", offset: 0, round: "none" } },
  { key: "sun_shacharis", group: "sunday", label: "Shacharis", rule: { kind: "fixed", times: [t(7), t(8, 15), t(9)] } },
  { key: "sun_mincha", group: "sunday", label: "Mincha", rule: { kind: "fixed", times: [t(19, 30)] } },
  { key: "sun_maariv", group: "sunday", label: "Maariv", rule: { kind: "zman", zman: "tzeis", offset: 0, round: "none" } },
  { key: "wk_shacharis", group: "weekday", label: "Shacharis", rule: { kind: "fixed", times: [t(6, 30), t(7, 30)] } },
  { key: "wk_mincha", group: "weekday", label: "Mincha", rule: { kind: "fixed", times: [t(19, 30)] } },
  { key: "wk_maariv", group: "weekday", label: "Maariv", rule: { kind: "text", text: "B'zman" } },
];

export async function seedDefaults(): Promise<string> {
  const notes: string[] = [];

  const [org] = await db.select().from(schema.organization).limit(1);
  if (!org) {
    await db.insert(schema.organization).values({
      name: "Chabad of Inverrary",
      address: "6700 NW 44th St, Lauderhill, FL 33319-4001",
      zip: "33319",
      email: "info@chabadofinverrary.com",
      website: "https://chabadftlauderdale.com",
      zmanim: DEFAULT_ZMANIM_SETTINGS,
      houseSpellings: DEFAULT_HOUSE_SPELLINGS,
    });
    notes.push("Created organization.");
  }

  const profiles = await db.select().from(schema.scheduleProfile).limit(1);
  if (profiles.length === 0) {
    const [profile] = await db
      .insert(schema.scheduleProfile)
      .values({ name: "Summer 5786", isDefault: true })
      .returning();
    await db.insert(schema.scheduleSlot).values(
      SUMMER_SLOTS.map((s, i) => ({ ...s, note: s.note ?? "", profileId: profile.id, sortOrder: i })),
    );
    notes.push(`Created profile "${profile.name}" with ${SUMMER_SLOTS.length} slots.`);
  }

  await ensurePublications();

  return notes.length ? notes.join("\n") : "Nothing to seed; data already present.";
}
