// Runs the real report processors + analytics against a local SQLite DB (node:sqlite).
// Usage: npx esbuild test/entry.ts --bundle --format=esm --platform=node --alias:cloudflare:sockets=./test/stub-sockets.mjs --outfile=test/.bundle.mjs
//        node test/harness.mjs <dir with orders.tsv [fees.tsv planning.tsv]>
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import * as M from "./.bundle.mjs";

const dir = process.argv[2];
const db = new DatabaseSync(":memory:");
db.exec(M.SCHEMA);
const settings = new Map();
const clean = (p) => p.map((x) => (x === undefined ? null : typeof x === "boolean" ? (x ? 1 : 0) : x));
const S = {
  all: (q, ...p) => db.prepare(q).all(...clean(p)),
  one: (q, ...p) => db.prepare(q).get(...clean(p)),
  run: (q, ...p) => db.prepare(q).run(...clean(p)),
  ctx: { storage: { transactionSync(fn) { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } } } },
  setting: (k, d) => (settings.has(k) ? settings.get(k) : d),
  setSetting: (k, v) => settings.set(k, v),
  salesToday: () => M.util.today(),
  tz: () => "America/New_York",
  publicOrigin: () => "https://example.test",
  log: (a, m) => console.log(`[${a}] ${m}`),
  amz: { sellerId: "ANEOVR6FCDPOY" },
};
const resp = (f, ct = "text/plain; charset=UTF-8") => new Response(readFileSync(f), { headers: { "content-type": ct } });
const ok = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok -", msg); };

// ---- orders ----
const t0 = Date.now();
const n = await M.PROCESSORS.orders_recent(S, resp(`${dir}/orders.tsv`), false, { from: "2026-10-25", to: "2026-11-22" });
console.log(`orders rows=${n} in ${Date.now() - t0}ms`);
const tot = S.one(`SELECT COUNT(*) c, SUM(units) u, SUM(revenue) r, SUM(est_revenue) e, MIN(day) a, MAX(day) b, COUNT(DISTINCT sku) s FROM sales_daily`);
console.log("sales_daily:", tot);
ok(tot.c > 100 && tot.u > 1000, "orders aggregated into daily rows");
ok(tot.a >= "2026-10-25" && tot.b <= "2026-11-22", "days inside window");

// ---- fees + planning ----
if (existsSync(`${dir}/fees.tsv`)) {
  const nf = await M.PROCESSORS.fees(S, resp(`${dir}/fees.tsv`, "text/plain; charset=Cp1252"), false, { day: "2026-11-22" });
  ok(nf > 0, `fee rows ${nf}`);
  // fake "next day" snapshot with a changed dimension, a changed fee and a low-inventory flag to exercise the diff
  db.exec(`INSERT INTO fee_snapshots SELECT '2026-11-23', sku, asin, price, fulfil_fee, referral_fee, total_fee, longest, median, shortest, dim_unit, weight, weight_unit, size_tier, future_fulfil_fee, low_inv, low_inv_exempt FROM fee_snapshots WHERE day='2026-11-22'`);
  const skus = S.all(`SELECT sku FROM fee_snapshots WHERE day='2026-11-23' AND fulfil_fee IS NOT NULL LIMIT 3`).map((r) => r.sku);
  S.run(`UPDATE fee_snapshots SET longest=longest+2, fulfil_fee=fulfil_fee+0.55 WHERE day='2026-11-23' AND sku=?`, skus[0]);
  S.run(`UPDATE fee_snapshots SET fulfil_fee=fulfil_fee+0.11 WHERE day='2026-11-23' AND sku=?`, skus[1]);
  S.run(`UPDATE fee_snapshots SET low_inv='No' WHERE day='2026-11-22'`);
  if (existsSync(`${dir}/planning.tsv`)) {
    const np = await M.PROCESSORS.planning(S, resp(`${dir}/planning.tsv`), false, { day: "2026-11-23" });
    ok(np > 0, `planning rows ${np}; low-inv applied now: ${S.one(`SELECT COUNT(*) n FROM planning WHERE low_inv_applied LIKE 'Y%'`).n}`);
  }
  S.run(`INSERT OR REPLACE INTO planning (sku, low_inv_applied) VALUES (?, 'Yes')`, skus[2]);
  M.diffFees(S, "2026-11-23");
  const ch = S.all(`SELECT sku, category, old_fee, new_fee, old_dims, new_dims FROM fee_changes`);
  console.log(ch.slice(0, 6), ch.length);
  ok(ch.some((c) => c.sku === skus[0] && c.category === "dimensions"), "dimension change detected");
  ok(ch.some((c) => c.sku === skus[1] && c.category === "rate"), "rate change detected");
  ok(ch.some((c) => c.sku === skus[2] && c.category === "low_inventory"), "low-inventory change detected");
  const em = M.buildFeeEmail(S, { ...M.DEFAULT_FEE_EMAIL }, "2026-11-23", "2026-11-23");
  ok(em.count >= 3 && em.html.includes("Dimension"), "fee email builds: " + em.subject);
}

// ---- analytics ----
const sr = M.salesReport(S, "2026-10-25", "2026-11-22", null, "asin", "day");
ok(sr.series.length === 29 && sr.items.length > 10, `salesReport: ${sr.items.length} items, revenue $${sr.totals.revenue}, units ${sr.totals.units}`);
console.log("by day:", sr.series.slice(-5).map((s) => `${s.key}: $${s.revenue} / ${s.units}u`).join("  "));
const top = sr.items[0];
const pa = M.priceAnalysis(S, top.skus, "2026-10-25", "2026-11-22", 7, 3);
ok(pa.series.length === 29, `priceAnalysis on ${top.key}: ${pa.events.length} events`);
let found = 0;
for (const it of sr.items.slice(0, 80)) {
  const a = M.priceAnalysis(S, it.skus, "2026-10-25", "2026-11-22", 7, 3);
  if (a.events.length) { found++; if (found <= 3) console.log(it.key, JSON.stringify(a.events[0])); }
}
console.log("items with detected price changes (top 80):", found);
const g = M.salesGrid(S, "2026-11-01", "2026-11-22", null, "asin", "units");
ok(g.days.length === 22 && g.items.length > 5, "grid builds");
const c = M.compareRanges(S, ["2026-11-09", "2026-11-22"], ["2026-10-26", "2026-11-08"], null, "asin");
ok(c.rows.length > 5, `compare: R1 $${c.r1.revenue} vs R2 $${c.r2.revenue}`);
const inv = M.inventoryRows(S);
ok(Array.isArray(inv), `inventoryRows ${inv.length}`);

// ---- repricer decisions ----
const R = M.DEFAULT_RULES;
const me = "ME", offers = [
  { sellerId: "ME", price: 15.49, shipping: 0, landed: 15.49, fba: true, buyBox: false },
  { sellerId: "A", price: 14.99, shipping: 0, landed: 14.99, fba: true, buyBox: true, feedbackPct: 99, feedbackCount: 500 },
  { sellerId: "B", price: 13.5, shipping: 0, landed: 13.5, fba: false, buyBox: false, feedbackPct: 80, feedbackCount: 10 },
];
let d1 = M.decidePrice(R[1], offers, me, 15.49, 12, 20);
ok(d1.target === 14.98, `beat BB by 0.01 → ${d1.target} (${d1.reason})`);
d1 = M.decidePrice(R[1], offers, me, 15.49, 15, 20);
ok(d1.target === 15, `clamped to min → ${d1.target}`);
d1 = M.decidePrice({ ...R[1], belowMin: "hold" }, offers, me, 15.49, 15, 20);
ok(d1.target === null, `below min hold → ${d1.reason}`);
d1 = M.decidePrice(R[0], [{ ...offers[0], buyBox: true }, { ...offers[1], buyBox: false }], me, 13.0, 10, 20);
ok(d1.target === 14.99, `own BB → raise to lowest competitor ${d1.target}`);
d1 = M.decidePrice(R[0], [{ ...offers[0], buyBox: true }], me, 13.0, 10, 20);
ok(d1.target === 20, `no competition → max ${d1.target}`);
d1 = M.decidePrice({ ...R[0], ignoreFbm: false }, offers, me, 15.49, 10, 20);
ok(d1.target === 14.99, `match BB ${d1.target}`);
d1 = M.decidePrice({ ...R[1], strategy: "beat_lowest", ignoreFbm: false, minFeedbackPct: 90 }, offers, me, 15.49, 10, 20);
ok(d1.target === 14.98, `feedback filter drops seller B → ${d1.target}`);

// ---- time zone helpers ----
ok(new Date(M.util.dayStart("2026-11-23")).toISOString() === "2026-11-23T08:00:00.000Z", "LA midnight (PST)");
ok(new Date(M.util.dayStart("2026-07-01")).toISOString() === "2026-07-01T07:00:00.000Z", "LA midnight (PDT)");
console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL OK");

// ---- price events on a known product (B07D91971R: 11.49 → 10.40 → 11.49 → 10.40 → 11.99 → 13.99) ----
{
  const skus = S.all(`SELECT DISTINCT sku FROM sales_daily WHERE asin='B07D91971R'`).map((r) => r.sku);
  if (skus.length) {
    const a = M.priceAnalysis(S, skus, "2026-10-25", "2026-11-22", 7, 3);
    console.log(a.events.map((e) => `${e.day}: ${e.oldPrice} → ${e.newPrice} (${e.pricePct}%) units/day ${e.before.unitsPerDay} → ${e.after.unitsPerDay} [${e.verdict}]`).join("\n"));
    ok(a.events.some((e) => e.day === "2026-11-06" && e.newPrice === 11.49) && a.events.some((e) => e.day === "2026-11-18" && e.newPrice === 11.99), "B07D91971R price steps detected on the right days with exact prices");
  }
}
