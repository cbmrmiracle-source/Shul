import { describe, expect, it } from "vitest";
import { evaluateSlots, ruleSchema, type GroupZmanim, type SlotDef } from "@/lib/schedule/rules";
import type { DayZmanim } from "@/lib/calendar/zmanim";

const day = (over: Partial<DayZmanim>): DayZmanim =>
  ({ sunset: 1185, candleLighting: 1167, tzeis: 1206, shabbosEnds: 1218, ...over }) as DayZmanim;

const zmanim: GroupZmanim = {
  friday: [day({})],
  shabbos: [day({ sunset: 1184 })],
  sunday: [day({ tzeis: 1206 })],
  weekday: [day({ sunset: 1182 }), day({ sunset: 1180 }), day({ sunset: 1179 })],
};

const slot = (key: string, group: SlotDef["group"], rule: unknown): SlotDef => ({
  key,
  group,
  rule: ruleSchema.parse(rule),
});

describe("evaluateSlots", () => {
  it("evaluates each rule kind", () => {
    const r = evaluateSlots(
      [
        slot("fri_mincha", "friday", { kind: "zman", zman: "candleLighting", offset: 8 }),
        slot("shabbos_mincha", "shabbos", { kind: "zman", zman: "sunset", offset: -18, round: "down5" }),
        slot("shiur", "shabbos", { kind: "relative", slotKey: "shabbos_mincha", offset: -60 }),
        slot("shacharis", "weekday", { kind: "fixed", times: [390, 450] }),
        slot("maariv", "weekday", { kind: "text", text: "B'zman" }),
        slot("wk_mincha", "weekday", { kind: "zman", zman: "sunset", offset: -10 }),
      ],
      zmanim,
    );
    expect(r.get("fri_mincha")).toEqual({ times: [1175] });
    expect(r.get("shabbos_mincha")).toEqual({ times: [1165] });
    expect(r.get("shiur")).toEqual({ times: [1105] });
    expect(r.get("shacharis")).toEqual({ times: [390, 450] });
    expect(r.get("maariv")).toEqual({ text: "B'zman" });
    // earliest weekday sunset (1179) − 10
    expect(r.get("wk_mincha")).toEqual({ times: [1169] });
  });

  it("reports missing and circular references per slot", () => {
    const r = evaluateSlots(
      [
        slot("a", "shabbos", { kind: "relative", slotKey: "b" }),
        slot("b", "shabbos", { kind: "relative", slotKey: "a" }),
        slot("c", "shabbos", { kind: "relative", slotKey: "nope" }),
        slot("d", "shabbos", { kind: "fixed", times: [600] }),
      ],
      zmanim,
    );
    expect(r.get("a")).toHaveProperty("error");
    expect(r.get("b")).toHaveProperty("error");
    expect(r.get("c")).toEqual({ error: 'Unknown slot "nope"' });
    expect(r.get("d")).toEqual({ times: [600] });
  });
});

it("relative rules follow an overridden row", () => {
  const r = evaluateSlots(
    [
      slot("candles", "friday", { kind: "zman", zman: "candleLighting" }),
      slot("mincha", "friday", { kind: "relative", slotKey: "candles", offset: 8 }),
    ],
    zmanim,
    new Map([["candles", { times: [1170] }]]),
  );
  expect(r.get("candles")).toEqual({ times: [1167] }); // auto value is still the calculation
  expect(r.get("mincha")).toEqual({ times: [1178] });
});
