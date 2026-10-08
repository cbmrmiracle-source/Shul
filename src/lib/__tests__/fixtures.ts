import { computeWeek } from "@/lib/calendar/week";
import { DEFAULT_ZMANIM_SETTINGS } from "@/lib/calendar/zmanim";
import type { RenderData, RenderItem, ScheduleRow } from "@/lib/render/data";

export const row = (key: string, label: string, display: string, times: number[] | null, note = ""): ScheduleRow => ({
  key,
  label,
  note,
  display,
  value: times ? { times } : { text: display },
});

/** The Ki Savo 5786 week as in the sample newsletter. */
export function fixture(overrides: Partial<RenderData> = {}): RenderData {
  const cal = computeWeek("2026-08-29", DEFAULT_ZMANIM_SETTINGS);
  return {
    org: { name: "Chabad of Inverrary", address: "", phone: "", email: "", website: "", emailSettings: {} },
    logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    logoKey: null,
    titleEn: cal.shabbosTitle.en,
    titleHe: cal.shabbosTitle.he,
    yearHe: cal.hebrewYearHe,
    days: cal.days,
    schedule: {
      friday: [
        row("fri_shacharis", "Shacharis", "6:30 / 7:30AM", [390, 450]),
        row("candle_lighting", "Candle Lighting", "7:27PM", [1167]),
        row("fri_mincha", "Mincha", "7:35PM", [1175]),
        row("kabolas_shabbos", "Kabolas Shabbos", "7:55PM", [1195]),
      ],
      shabbos: [
        row("chassidus", "Chassidus", "9:15AM", [555]),
        row("shabbos_shacharis", "Shacharis", "10:00AM", [600], "Followed by Farbrengen"),
        row("shabbos_mincha", "Mincha", "7:25PM", [1165]),
        row("shabbos_ends", "Maariv / Shabbos Ends", "8:18PM", [1218]),
      ],
      sunday: [row("sun_shacharis", "Shacharis", "7 / 8:15 / 9AM", [420, 495, 540]), row("sun_mincha", "Mincha", "7:30PM", [1170])],
      weekday: [row("wk_shacharis", "Shacharis", "6:30 / 7:30AM", [390, 450]), row("wk_maariv", "Maariv", "B'zman", null)],
    },
    candleLighting: "7:27PM",
    shabbosEnds: "8:18PM",
    items: {},
    pendingCount: {},
    ...overrides,
  };
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
