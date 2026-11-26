// Sales analytics, price ↔ sales correlation, period comparison, inventory status.
import type { Store } from "./store";
import { addDays, dayOf, dayRange, daysBetween, round2 } from "./util";

type Group = "asin" | "sku";

function skuFilter(skus: string[] | null, col = "s.sku") {
  if (!skus || !skus.length) return { sql: "", args: [] as string[] };
  return { sql: ` AND ${col} IN (${skus.map(() => "?").join(",")})`, args: skus };
}

/** Expand a list of SKUs/ASINs to SKUs. */
export function resolveSkus(S: Store, ids: string[] | null): string[] | null {
  if (!ids || !ids.length) return null;
  const out = new Set<string>();
  for (const id of ids) {
    if (/^B0[A-Z0-9]{8}$/.test(id) || /^\d{9}[\dX]$/.test(id)) {
      const rows = S.all(`SELECT sku FROM products WHERE asin=?`, id);
      rows.forEach((r) => out.add(r.sku));
      if (!rows.length) out.add(id);
    } else out.add(id);
  }
  return [...out];
}

export function costMap(S: Store) {
  // unit cost per SKU: the manual cost if set, else the cost of its mapped inventory products (kits add up)
  const mapped = new Map<string, number>();
  try { for (const r of S.all(`SELECT m.sku, SUM(m.qty * p.avg_cost) c FROM inv_mappings m JOIN inv_products p ON p.id=m.product_id GROUP BY m.sku`)) mapped.set(r.sku, r.c); } catch { /* tables not created yet */ }
  // per-SKU unit economics for estimated profit: COGS + latest FBA fee + referral %
  const m = new Map<string, { cogs: number | null; fulfil: number | null; refPct: number | null }>();
  for (const r of S.all(`SELECT p.sku, p.cogs, f.fulfil_fee, f.referral_fee, f.price FROM products p
                         LEFT JOIN fee_snapshots f ON f.sku=p.sku AND f.day=(SELECT MAX(day) FROM fee_snapshots WHERE sku=p.sku)`)) {
    m.set(r.sku, { cogs: r.cogs ?? (mapped.has(r.sku) ? mapped.get(r.sku)! : null), fulfil: r.fulfil_fee, refPct: r.price && r.referral_fee !== null ? r.referral_fee / r.price : 0.15 });
  }
  return m;
}

function profitOf(costs: ReturnType<typeof costMap>, sku: string, units: number, revenue: number): number | null {
  const c = costs.get(sku);
  if (!c || c.cogs === null || c.cogs === undefined) return null;
  return revenue - revenue * (c.refPct ?? 0.15) - units * ((c.fulfil ?? 0) + c.cogs);
}

export function salesReport(S: Store, from: string, to: string, skus: string[] | null, group: Group = "asin", interval: "day" | "week" | "month" = "day") {
  const f = skuFilter(skus);
  const rows = S.all(`SELECT s.day, s.sku, s.asin, s.units, s.revenue, s.est_revenue FROM sales_daily s WHERE s.day>=? AND s.day<=?${f.sql}`, from, to, ...f.args);
  const costs = costMap(S);
  const bucket = (d: string) => interval === "day" ? d : interval === "month" ? d.slice(0, 7) : weekStart(d);
  const series = new Map<string, { key: string; units: number; revenue: number; profit: number; profitKnown: boolean }>();
  for (const d of dayRange(from, to)) { const k = bucket(d); if (!series.has(k)) series.set(k, { key: k, units: 0, revenue: 0, profit: 0, profitKnown: true }); }
  const items = new Map<string, any>();
  let units = 0, revenue = 0, est = 0, profit = 0, profitCovered = 0;
  for (const r of rows) {
    units += r.units; revenue += r.revenue; est += r.est_revenue || 0;
    const p = profitOf(costs, r.sku, r.units, r.revenue);
    if (p !== null) { profit += p; profitCovered += r.revenue; }
    const s = series.get(bucket(r.day))!;
    s.units += r.units; s.revenue += r.revenue; if (p !== null) s.profit += p; else s.profitKnown = false;
    const key = group === "asin" ? r.asin || r.sku : r.sku;
    let it = items.get(key);
    if (!it) { it = { key, asin: r.asin, skus: new Set<string>(), units: 0, revenue: 0, profit: 0, profitKnown: true, days: {} }; items.set(key, it); }
    it.skus.add(r.sku); it.units += r.units; it.revenue += r.revenue;
    if (p !== null) it.profit += p; else it.profitKnown = false;
  }
  const meta = productMeta(S);
  const list = [...items.values()].map((it) => {
    const m = group === "asin" ? meta.byAsin.get(it.asin) : meta.bySku.get(it.key);
    return {
      key: it.key, asin: it.asin, skus: [...it.skus], title: m?.title || "", image: m?.image || null, mrm: m?.mrm || 0,
      units: it.units, revenue: round2(it.revenue), avgPrice: it.units ? round2(it.revenue / it.units) : null,
      profit: it.profitKnown ? round2(it.profit) : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const n = daysBetween(from, to) + 1;
  return {
    from, to, days: n,
    totals: { units, revenue: round2(revenue), estRevenue: round2(est), avgPerDay: round2(revenue / n), unitsPerDay: round2(units / n),
      profit: profitCovered ? round2(profit) : null, profitCoverage: revenue ? round2(profitCovered / revenue * 100) : 0 },
    series: [...series.values()].map((s) => ({ key: s.key, units: s.units, revenue: round2(s.revenue), profit: s.profitKnown ? round2(s.profit) : null })),
    items: list,
  };
}

function weekStart(d: string) { const wd = new Date(d + "T00:00:00Z").getUTCDay(); return addDays(d, -((wd + 6) % 7)); }

export function productMeta(S: Store) {
  const bySku = new Map<string, any>(), byAsin = new Map<string, any>();
  for (const p of S.all(`SELECT sku, asin, title, image, price, COALESCE(is_mrm, mrm_auto, 0) mrm FROM products`)) {
    bySku.set(p.sku, p);
    const cur = byAsin.get(p.asin);
    if (!cur || (!cur.image && p.image) || (!cur.title && p.title)) byAsin.set(p.asin, p);
  }
  return { bySku, byAsin };
}

/**
 * Price ↔ sales analysis for one item (ASIN or SKU group).
 * Price per day = the consumer price of the day's last order (business/quantity pricing excluded),
 * plus every price change made in this system. A price change event is a step of ≥ threshold% that holds 2 days.
 */
export function priceAnalysis(S: Store, skus: string[], from: string, to: string, windowDays = 14, thresholdPct = 3) {
  const f = skuFilter(skus);
  const rows = S.all(`SELECT day, SUM(units) units, SUM(revenue) revenue, SUM(asp_units) pu, SUM(asp_revenue) prev
                      FROM sales_daily s WHERE day>=? AND day<=?${f.sql} GROUP BY day`,
    addDays(from, -windowDays), addDays(to, windowDays), ...f.args);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const hist = S.all(`SELECT sku, ts, old_price, new_price, source, user FROM price_history s WHERE 1=1${f.sql} ORDER BY ts`, ...f.args);
  const days = dayRange(addDays(from, -windowDays), addDays(to, windowDays));
  // only compare inside the sales history we actually have loaded
  const dataStart: string = S.one(`SELECT MIN(day) d FROM sales_daily`)?.d || from;
  const firstIdx = Math.max(0, days.indexOf(dataStart) >= 0 ? days.indexOf(dataStart) : dataStart > days[0] ? days.length : 0);
  // end-of-day consumer price (when several SKUs share an ASIN, the latest sale wins)
  const setPrice = new Map<string, { p: number; ts: number }>();
  for (const r of S.all(`SELECT day, last_price, last_ts FROM sales_daily s WHERE day>=? AND day<=? AND last_price IS NOT NULL${f.sql}`,
    days[0], days[days.length - 1], ...f.args)) {
    const cur = setPrice.get(r.day);
    if (!cur || r.last_ts > cur.ts) setPrice.set(r.day, { p: r.last_price, ts: r.last_ts });
  }
  const series = days.map((d) => {
    const r: any = byDay.get(d);
    const asp = r && r.pu > 0 ? round2(r.prev / r.pu) : null;
    return { day: d, units: r?.units || 0, revenue: round2(r?.revenue || 0), asp, set: setPrice.get(d)?.p ?? asp };
  });
  // step detection on the end-of-day price: a move of ≥ threshold% that holds for 2 days with sales (or is the latest day)
  let lastDataIdx = -1;
  series.forEach((s, i) => { if (s.set !== null) lastDataIdx = i; });
  let level: number | null = null;
  const events: any[] = [];
  let pending: { day: string; price: number; idx: number; count: number } | null = null;
  const price: (number | null)[] = [];
  series.forEach((s, i) => {
    const p = s.set;
    if (p === null || i < firstIdx) { price.push(level); return; }
    if (level === null) { level = p; price.push(level); return; }
    if (Math.abs(p - level) / level * 100 >= thresholdPct) {
      if (pending && Math.abs(p - pending.price) / pending.price * 100 < thresholdPct) { pending.count++; pending.price = p; }
      else pending = { day: s.day, price: p, idx: i, count: 1 };
      if (pending.count >= 2 || i === lastDataIdx) {
        events.push({ day: pending.day, idx: pending.idx, oldPrice: level, newPrice: pending.price, source: "detected" });
        level = pending.price;
        for (let k = pending.idx; k < i; k++) price[k] = level;
        pending = null;
      }
    } else { pending = null; level = p; }
    price.push(level);
  });
  // recorded changes from this system are authoritative
  for (const h of hist) {
    const d = dayOf(h.ts);
    const idx = days.indexOf(d);
    if (idx < 0) continue;
    const near = events.find((e) => Math.abs(e.idx - idx) <= 2);
    if (near) { Object.assign(near, { day: d, idx, oldPrice: h.old_price ?? near.oldPrice, newPrice: h.new_price, source: h.source, user: h.user }); }
    else events.push({ day: d, idx, oldPrice: h.old_price, newPrice: h.new_price, source: h.source, user: h.user });
  }
  events.sort((a, b) => a.idx - b.idx);
  const out = events.filter((e) => e.day >= from && e.day <= to).map((e, k, arr) => {
    const prevIdx = k > 0 ? arr[k - 1].idx : -Infinity, nextIdx = k < arr.length - 1 ? arr[k + 1].idx : Infinity;
    const bStart = Math.max(e.idx - windowDays, prevIdx === -Infinity ? 0 : prevIdx, firstIdx), bEnd = e.idx - 1;
    const aStart = e.idx, aEnd = Math.min(e.idx + windowDays - 1, nextIdx === Infinity ? series.length - 1 : nextIdx - 1, series.length - 1);
    const todayIdx = days.indexOf(S.salesToday());
    const aEndC = todayIdx >= 0 ? Math.min(aEnd, todayIdx - 1) : aEnd;
    const agg = (a: number, b: number) => {
      let u = 0, rv = 0, n = 0;
      for (let i = a; i <= b; i++) { u += series[i].units; rv += series[i].revenue; n++; }
      return { days: n, units: u, revenue: round2(rv), unitsPerDay: n ? round2(u / n) : 0, revenuePerDay: n ? round2(rv / n) : 0 };
    };
    const before = agg(bStart, bEnd), after = agg(aStart, aEndC);
    const pricePct = e.oldPrice ? round2((e.newPrice - e.oldPrice) / e.oldPrice * 100) : null;
    const unitsPct = before.unitsPerDay ? round2((after.unitsPerDay - before.unitsPerDay) / before.unitsPerDay * 100) : null;
    const revPct = before.revenuePerDay ? round2((after.revenuePerDay - before.revenuePerDay) / before.revenuePerDay * 100) : null;
    return {
      day: e.day, oldPrice: round2(e.oldPrice), newPrice: round2(e.newPrice), pricePct, source: e.source, user: e.user || null,
      before, after, unitsPct, revenuePct: revPct,
      elasticity: pricePct && unitsPct !== null ? round2(unitsPct / pricePct) : null,
      verdict: verdict(pricePct, unitsPct, revPct, after.days, before.days),
    };
  });
  const visible = series.map((s, i) => ({ ...s, price: price[i] !== null ? round2(price[i]!) : null })).filter((s) => s.day >= from && s.day <= to);
  return { series: visible, events: out };
}

function verdict(pricePct: number | null, unitsPct: number | null, revPct: number | null, afterDays: number, beforeDays = 99) {
  if (afterDays < 3) return "Too few days at the new price";
  if (beforeDays < 3) return "Too few days at the previous price";
  if (pricePct === null || unitsPct === null || revPct === null) return "Not enough sales data";
  const dir = pricePct > 0 ? "Price up" : "Price down";
  if (revPct > 5) return `${dir} → revenue up ${revPct}%`;
  if (revPct < -5) return `${dir} → revenue down ${Math.abs(revPct)}%`;
  return `${dir} → revenue roughly flat`;
}

/** Daily grid (like the 2-month sheet): one row per item, one column per day. */
export function salesGrid(S: Store, from: string, to: string, skus: string[] | null, group: Group, metric: "units" | "revenue" | "price") {
  const f = skuFilter(skus);
  const key = group === "asin" ? "COALESCE(asin, sku)" : "sku";
  const rows = S.all(`SELECT ${key} k, day, SUM(units) u, SUM(revenue) r, SUM(asp_units) pu, SUM(asp_revenue) pr
                      FROM sales_daily s WHERE day>=? AND day<=?${f.sql} GROUP BY k, day`, from, to, ...f.args);
  const days = dayRange(from, to).reverse();
  const meta = productMeta(S);
  const map = new Map<string, any>();
  for (const r of rows) {
    let it = map.get(r.k);
    if (!it) {
      const m = group === "asin" ? meta.byAsin.get(r.k) : meta.bySku.get(r.k);
      it = { key: r.k, title: m?.title || "", image: m?.image || null, total: 0, cells: {} }; map.set(r.k, it);
    }
    const v = metric === "units" ? r.u : metric === "revenue" ? round2(r.r) : r.pu ? round2(r.pr / r.pu) : null;
    it.cells[r.day] = v;
    it.total += metric === "price" ? 0 : (v || 0);
  }
  const items = [...map.values()].sort((a, b) => b.total - a.total);
  if (skus && group === "sku") for (const s of skus) if (!map.has(s)) items.push({ key: s, title: meta.bySku.get(s)?.title || "", image: meta.bySku.get(s)?.image, total: 0, cells: {} });
  return { days, items: items.map((i) => ({ ...i, total: round2(i.total) })) };
}

/** Range 1 vs Range 2 comparison (like the Comparison sheet). */
export function compareRanges(S: Store, r1: [string, string], r2: [string, string], skus: string[] | null, group: Group) {
  const a = salesReport(S, r1[0], r1[1], skus, group), b = salesReport(S, r2[0], r2[1], skus, group);
  const inv = inventoryRows(S);
  const invByKey = new Map<string, any>();
  for (const r of inv) {
    const k = group === "asin" ? r.asin : r.sku;
    const cur = invByKey.get(k) || { fulfillable: 0, total: 0, avg30: 0 };
    cur.fulfillable += r.fulfillable; cur.total += r.total; cur.avg30 += r.avg30;
    invByKey.set(k, cur);
  }
  const keys = new Set([...a.items.map((x) => x.key), ...b.items.map((x) => x.key)]);
  const A = new Map(a.items.map((x) => [x.key, x])), B = new Map(b.items.map((x) => [x.key, x]));
  const rows = [...keys].map((k) => {
    const x: any = A.get(k) || {}, y: any = B.get(k) || {};
    const iv = invByKey.get(k);
    const perDay = iv?.avg30 ? iv.avg30 / 30 : 0;
    return {
      key: k, title: x.title || y.title || "", image: x.image || y.image || null, asin: x.asin || y.asin,
      r1: { units: x.units || 0, revenue: x.revenue || 0, profit: x.profit ?? null, avgPrice: x.avgPrice ?? null },
      r2: { units: y.units || 0, revenue: y.revenue || 0, profit: y.profit ?? null, avgPrice: y.avgPrice ?? null },
      unitChange: (x.units || 0) - (y.units || 0),
      unitPct: y.units ? round2(((x.units || 0) - y.units) / y.units * 100) : null,
      revenueChange: round2((x.revenue || 0) - (y.revenue || 0)),
      profitChange: x.profit !== undefined && y.profit !== undefined && x.profit !== null && y.profit !== null ? round2(x.profit - y.profit) : null,
      daysAvailable: perDay ? Math.round(iv.fulfillable / perDay) : null,
      daysIncReserve: perDay ? Math.round(iv.total / perDay) : null,
    };
  }).sort((p, q) => (q.r1.revenue + q.r2.revenue) - (p.r1.revenue + p.r2.revenue));
  return { r1: a.totals, r2: b.totals, rows };
}

// ---------- inventory status (mirrors the "FBA Inventory Status" sheet formulas) ----------

export const DEFAULT_INV_SETTINGS = { minDays: 14, maxAlert: 24, maxDays: 45, daysToSend: 15, forecastDays: 5, includeShipmentCreated: true };

export function inventoryRows(S: Store) {
  const cfg = { ...DEFAULT_INV_SETTINGS, ...S.setting("inventory_settings", {}) };
  const yday = addDays(S.salesToday(), -1);
  const sales = new Map<string, { l7: number; l14: number; l30: number }>();
  for (const r of S.all(`SELECT sku,
      SUM(CASE WHEN day > ? THEN units ELSE 0 END) l7, SUM(CASE WHEN day > ? THEN units ELSE 0 END) l14, SUM(units) l30
      FROM sales_daily WHERE day > ? AND day <= ? GROUP BY sku`, addDays(yday, -7), addDays(yday, -14), addDays(yday, -30), yday)) {
    sales.set(r.sku, { l7: r.l7, l14: r.l14, l30: r.l30 });
  }
  const costs = costMap(S);
  const today0 = S.salesToday();
  const errs = new Map<string, number>(S.all(`SELECT sku, SUM(qty) n FROM inv_errors WHERE end_day >= ? AND (start_day IS NULL OR start_day <= ?) GROUP BY sku`, today0, today0).map((r) => [r.sku, r.n]));
  const rows = S.all(`SELECT p.sku, p.asin, p.fnsku, p.title, p.image, p.price, p.status, p.discontinued, p.direct_fba, p.errors, p.cogs,
        COALESCE(p.is_mrm, p.mrm_auto, 0) mrm, i.fulfillable, i.reserved, i.fc_transfer, i.inbound_working, i.inbound_shipped,
        i.inbound_receiving, i.unfulfillable, i.researching, i.updated_at inv_at, o.we_have_bb, o.bb_price, o.ts offers_at,
        pl.low_inv_applied, pl.health
      FROM products p LEFT JOIN inventory i ON i.sku=p.sku LEFT JOIN offers_latest o ON o.asin=p.asin LEFT JOIN planning pl ON pl.sku=p.sku
      WHERE p.fulfillment='FBA' OR i.sku IS NOT NULL`);
  return rows.map((r) => {
    const s = sales.get(r.sku) || { l7: 0, l14: 0, l30: 0 };
    const sellable = r.fulfillable || 0, reserved = r.reserved || 0;
    const total = sellable + reserved;
    const shipped = r.inbound_shipped || 0, receiving = r.inbound_receiving || 0, created = r.inbound_working || 0, unful = r.unfulfillable || 0;
    const errors = errs.get(r.sku) || 0;
    const weighted = (s.l7 * 4 + s.l14 * 2 + s.l30) / 3;
    const avg30 = r.discontinued ? 0 : Math.max(s.l30, weighted);
    const perDay = avg30 / 30;
    const daysSellable = perDay ? Math.round(sellable / perDay) : null;
    const daysReserve = perDay ? Math.round(total / perDay) : null;
    const pipeline = total + shipped + receiving + unful - errors + (cfg.includeShipmentCreated ? created : 0);
    const daysShipped = perDay ? Math.round(pipeline / perDay - cfg.forecastDays) : null;
    let toShip: number | null = null;
    if (daysShipped !== null) {
      if (daysShipped > cfg.maxAlert) toShip = 0;
      else if (daysShipped > cfg.minDays) toShip = Math.round(perDay * cfg.daysToSend);
      else toShip = Math.round(perDay * (cfg.maxDays - daysShipped));
    }
    const c = costs.get(r.sku);
    const unitProfit = r.price && c && c.cogs !== null && c.cogs !== undefined
      ? round2(r.price - r.price * (c.refPct ?? 0.15) - (c.fulfil ?? 0) - c.cogs) : null;
    let state = "ok";
    if (r.discontinued) state = "discontinued";
    else if (sellable === 0 && total === 0) state = "oos";
    else if (r.status && !/active/i.test(r.status)) state = "inactive";
    else if (daysShipped !== null && daysShipped <= cfg.minDays) state = "low";
    return {
      sku: r.sku, asin: r.asin, fnsku: r.fnsku, title: r.title, image: r.image, mrm: r.mrm, price: r.price, status: r.status,
      discontinued: !!r.discontinued, directFba: !!r.direct_fba, errors,
      total, fulfillable: sellable, reserved, shipped, receiving, unfulfillable: unful, shipmentCreated: created, fcTransfer: r.fc_transfer || 0,
      l7: s.l7, l14: s.l14, l30: s.l30, avg30: Math.round(avg30), daysSellable, daysReserve, daysShipped, toShip,
      buyBox: r.offers_at ? (r.we_have_bb ? "won" : "lost") : null, bbPrice: r.bb_price, unitProfit,
      lowInvFee: r.low_inv_applied || "", health: r.health || "", state, invAt: r.inv_at,
    };
  });
}
