import { z } from "zod";
import { ZMAN_KEYS, type DayZmanim } from "@/lib/calendar/zman-keys";
import { formatTime, parseTimeValue, roundTo5, type TimeValue } from "@/lib/time";

/** Which section of the schedule a slot belongs to, and which day(s) its zmanim come from. */
export const SCHEDULE_GROUPS = ["friday", "shabbos", "sunday", "weekday"] as const;
export type ScheduleGroup = (typeof SCHEDULE_GROUPS)[number];

export const GROUP_LABELS: Record<ScheduleGroup, string> = {
  friday: "Friday",
  shabbos: "Shabbos",
  sunday: "Sunday",
  weekday: "Monday – Thursday",
};

const round5 = z.enum(["none", "down5", "up5", "nearest5"]).default("none");

/** Strict form used for stored rules: clock times are minutes after midnight. */
export const ruleSchema = z.discriminatedUnion("kind", [
  /** One or more fixed clock times, e.g. Shacharis 6:30 & 7:30AM. */
  z.object({ kind: z.literal("fixed"), times: z.array(z.number().int().min(0).max(1439)).min(1) }),
  /** A zman for the slot's day, plus/minus minutes, e.g. Mincha = candle lighting + 8. */
  z.object({
    kind: z.literal("zman"),
    zman: z.enum(ZMAN_KEYS),
    offset: z.number().int().default(0),
    round: round5,
  }),
  /** Relative to another slot in the same profile, e.g. Shiur = Shabbos Mincha − 60. */
  z.object({
    kind: z.literal("relative"),
    slotKey: z.string().min(1),
    offset: z.number().int().default(0),
    round: round5,
  }),
  /** Free text such as "B'zman" or "Followed by Farbrengen". */
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
]);
export type ScheduleRule = z.infer<typeof ruleSchema>;

export interface SlotDef {
  key: string;
  group: ScheduleGroup;
  rule: ScheduleRule;
}

/** Zmanim for each day of the week, keyed by group. Weekday uses every Mon–Thu day. */
export type GroupZmanim = Record<ScheduleGroup, DayZmanim[]>;

export class RuleError extends Error {}

/**
 * Evaluate every slot's rule for one week. Relative rules may reference other
 * slots in any order; cycles and missing references are reported per slot
 * rather than failing the whole week. A relative rule follows the referenced
 * row's override when there is one (overriding candle lighting moves Mincha).
 */
export function evaluateSlots(
  slots: SlotDef[],
  zmanim: GroupZmanim,
  /** Values a person typed for this week; other rows that reference them use these. */
  overrides: Map<string, TimeValue> = new Map(),
): Map<string, TimeValue | { error: string }> {
  const byKey = new Map(slots.map((s) => [s.key, s]));
  const results = new Map<string, TimeValue | { error: string }>();
  const inProgress = new Set<string>();

  const evalOne = (slot: SlotDef): TimeValue => {
    const cached = results.get(slot.key);
    if (cached) {
      if ("error" in cached) throw new RuleError(cached.error);
      return cached;
    }
    if (inProgress.has(slot.key)) throw new RuleError(`Circular reference via "${slot.key}"`);
    inProgress.add(slot.key);
    try {
      const value = evalRule(slot);
      results.set(slot.key, value);
      return value;
    } finally {
      inProgress.delete(slot.key);
    }
  };

  const evalRule = (slot: SlotDef): TimeValue => {
    const rule = slot.rule;
    switch (rule.kind) {
      case "fixed":
        return { times: [...rule.times] };
      case "text":
        return { text: rule.text };
      case "zman": {
        // For a multi-day group take the earliest value, so a weekday Mincha is never after shkiah.
        const values = zmanim[slot.group]
          .map((day) => day[rule.zman])
          .filter((v): v is number => v !== null);
        if (values.length === 0) throw new RuleError(`No ${rule.zman} for ${slot.group}`);
        return { times: [roundTo5(Math.min(...values) + rule.offset, rule.round)] };
      }
      case "relative": {
        const target = byKey.get(rule.slotKey);
        if (!target) throw new RuleError(`Unknown slot "${rule.slotKey}"`);
        const base = overrides.get(target.key) ?? evalOne(target);
        if ("text" in base) throw new RuleError(`"${rule.slotKey}" is not a time`);
        return { times: [roundTo5(base.times[0] + rule.offset, rule.round)] };
      }
    }
  };

  for (const slot of slots) {
    try {
      evalOne(slot);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      results.set(slot.key, { error: e.message });
    }
  }
  return results;
}

/** A short human description of a rule, for the profile editor. */
export function describeRule(rule: ScheduleRule, zmanLabels: Record<string, string>): string {
  const off = (n: number) => (n === 0 ? "" : n > 0 ? ` + ${n} min` : ` − ${-n} min`);
  const rnd = (r: string) =>
    r === "down5" ? ", rounded down to 5" : r === "up5" ? ", rounded up to 5" : r === "nearest5" ? ", rounded to 5" : "";
  switch (rule.kind) {
    case "fixed":
      return rule.times.map(formatTime).join(", ");
    case "text":
      return `“${rule.text}”`;
    case "zman":
      return `${zmanLabels[rule.zman]}${off(rule.offset)}${rnd(rule.round)}`;
    case "relative":
      return `[${rule.slotKey}]${off(rule.offset)}${rnd(rule.round)}`;
  }
}

/** Parse "6:30 / 7:30AM" into a fixed rule, or null if it isn't a time list. */
export function fixedRuleFromInput(input: string): ScheduleRule | null {
  const v = parseTimeValue(input);
  return v && "times" in v ? { kind: "fixed", times: v.times } : null;
}
