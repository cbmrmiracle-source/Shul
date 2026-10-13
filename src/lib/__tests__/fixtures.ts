import { computeWeek } from "@/lib/calendar/week";
import { DEFAULT_ZMANIM_SETTINGS } from "@/lib/calendar/zmanim";
import type { RenderData, RenderItem, ScheduleRow } from "@/lib/render/data";
import { buildDaySections } from "@/lib/schedule/days";
import type { ScheduleGroup } from "@/lib/schedule/rules";

export const row = (
  key: string,
  label: string,
  display: string,
  times: number[] | null,
  note = "",
  group: ScheduleGroup = "shabbos",
  days: number[] | null = null,
): ScheduleRow => ({
  key,
  group,
  days,
  label,
  note,
  display,
  value: times ? { times } : { text: display },
});

/** Same grouping as the app (render/data.ts weekdaySections). */
export const sectionsOf = (schedule: RenderData["schedule"]) =>
  buildDaySections([...schedule.sunday, ...schedule.weekday], (r) => `${r.label}=${r.display}=${r.note}`);

/** The Ki Savo 5786 week as in the sample newsletter. */
export function fixture(overrides: Partial<RenderData> = {}): RenderData {
  const cal = computeWeek("2026-08-29", DEFAULT_ZMANIM_SETTINGS);
  const data: RenderData = {
    org: { name: "Chabad of Inverrary", address: "", phone: "", email: "", website: "", emailSettings: {} },
    logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    logoKey: null,
    titleEn: cal.shabbosTitle.en,
    titleHe: cal.shabbosTitle.he,
    yearHe: cal.hebrewYearHe,
    days: cal.days,
    events: cal.events,
    schedule: {
      friday: [
        row("fri_shacharis", "Shachris", "6:30 / 7:30AM", [390, 450], "", "friday"),
        row("candle_lighting", "Candle Lighting", "7:27PM", [1167], "", "friday"),
        row("fri_mincha", "Mincha", "7:35PM", [1175], "", "friday"),
        row("kabolas_shabbos", "Kabolas Shabbos", "7:55PM", [1195], "", "friday"),
      ],
      shabbos: [
        row("chassidus", "Chassidus", "9:15AM", [555]),
        row("shabbos_shacharis", "Shachris", "10:00AM", [600], "Followed by Farbrengen"),
        row("shabbos_mincha", "Mincha", "7:25PM", [1165]),
        row("shabbos_ends", "Maariv / Shabbos Ends", "8:18PM", [1218]),
      ],
      sunday: [
        row("sun_shacharis", "Shachris", "7 / 8:15 / 9AM", [420, 495, 540], "", "sunday"),
        row("sun_mincha", "Mincha", "7:30PM", [1170], "", "sunday"),
      ],
      weekday: [
        row("wk_shacharis", "Shachris", "6:30 / 7:30AM", [390, 450], "", "weekday"),
        row("wk_maariv", "Maariv", "B'zman", null, "", "weekday"),
      ],
    },
    weekdaySections: [],
    candleLighting: "7:27PM",
    shabbosEnds: "8:18PM",
    items: {},
    pendingCount: {},
    ...overrides,
  };
  if (!overrides.weekdaySections) data.weekdaySections = sectionsOf(data.schedule);
  return data;
}


/** A content item for render tests. */
export function item(type: RenderItem["type"], over: Partial<RenderItem> = {}): RenderItem {
  return {
    id: Math.floor(Math.random() * 1e6),
    type,
    title: "",
    body: "",
    fields: {},
    eventDate: null,
    eventTime: "",
    hebrewDate: "",
    linkUrl: "",
    linkLabel: "",
    image: null,
    imageKey: null,
    ...over,
  };
}
