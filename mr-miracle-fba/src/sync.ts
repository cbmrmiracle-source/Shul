// Data sync from Amazon: listings, orders (daily sales), inventory, catalog, fee + planning reports.
import type { Store } from "./store";
import { SALES_TZ, addDays, dayOf, dayStart, isMrMiracleText, num, numOrNull, streamTsv, today } from "./util";

export const BACKFILL_DAYS = 730; // Amazon keeps ~2 years of order history

// ---------- report job lifecycle ----------

export async function requestReport(S: Store, kind: string, reportType: string, params: any = {}, start?: string, end?: string, options?: any) {
  const reportId = await S.amz.createReport(reportType, start, end, options);
  S.run(`INSERT INTO report_jobs (kind, report_type, report_id, status, params, created_at, polled_at) VALUES (?,?,?,?,?,?,0)`,
    kind, reportType, reportId, "requested", JSON.stringify(params), Date.now());
  return reportId;
}

export const pendingReport = (S: Store, kind: string) =>
  S.one(`SELECT id FROM report_jobs WHERE kind=? AND status IN ('requested','processing') LIMIT 1`, kind);

/** Poll outstanding reports, download + process finished ones. */
export async function pollReports(S: Store) {
  const jobs = S.all(`SELECT * FROM report_jobs WHERE status IN ('requested','processing') ORDER BY id LIMIT 6`);
  for (const j of jobs) {
    if (S.budgetLeft() < 4) return;
    if (Date.now() - j.polled_at < 20_000) continue;
    S.run(`UPDATE report_jobs SET polled_at=? WHERE id=?`, Date.now(), j.id);
    let st: { status: string; documentId?: string };
    try { st = await S.amz.getReport(j.report_id); } catch (e: any) { S.log("report", `poll ${j.kind}: ${e.message}`); continue; }
    if (st.status === "DONE" && st.documentId) {
      S.run(`UPDATE report_jobs SET status='processing' WHERE id=?`, j.id);
      try {
        const params = JSON.parse(j.params || "{}");
        const { res, gzip } = await S.amz.openDocument(st.documentId);
        const n = await PROCESSORS[j.kind](S, res, gzip, params);
        S.run(`UPDATE report_jobs SET status='done', done_at=?, rows=? WHERE id=?`, Date.now(), n, j.id);
        await AFTER[j.kind]?.(S, params);
      } catch (e: any) {
        S.run(`UPDATE report_jobs SET status='error', error=?, done_at=? WHERE id=?`, String(e.message || e).slice(0, 500), Date.now(), j.id);
        S.log("report", `${j.kind} failed: ${e.message}`);
        if (j.kind === "orders_backfill") await AFTER.orders_backfill(S, JSON.parse(j.params || "{}")); // skip window, keep going
      }
    } else if (st.status === "FATAL" || st.status === "CANCELLED") {
      // CANCELLED with no document usually means "no data in range"
      S.run(`UPDATE report_jobs SET status=?, done_at=? WHERE id=?`, st.status === "CANCELLED" ? "empty" : "error", Date.now(), j.id);
      if (st.status === "CANCELLED") await AFTER[j.kind]?.(S, JSON.parse(j.params || "{}"));
      else S.log("report", `${j.kind} report ${j.report_id} FATAL`);
      if (st.status === "FATAL" && j.kind === "orders_backfill") await AFTER.orders_backfill(S, JSON.parse(j.params || "{}"));
    } else if (Date.now() - j.created_at > 3 * 3600_000) {
      S.run(`UPDATE report_jobs SET status='error', error='timed out', done_at=? WHERE id=?`, Date.now(), j.id);
    }
  }
}

// ---------- orders → daily sales ----------

export async function requestOrders(S: Store, kind: "orders_recent" | "orders_backfill" | "orders_refresh", from: string, to: string) {
  const start = new Date(dayStart(from)).toISOString();
  const endTs = Math.min(Date.now() - 5 * 60_000, dayStart(addDays(to, 1)) - 1000);
  return requestReport(S, kind, "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL", { from, to }, start, new Date(endTs).toISOString());
}

async function processOrders(S: Store, res: Response, gzip: boolean, p: { from: string; to: string }) {
  const agg = new Map<string, { day: string; sku: string; asin: string; units: number; revenue: number; priced: number; orders: number; est: number; aspRev: number; aspUnits: number; lastPrice: number | null; lastTs: number }>();
  const prices = new Map<string, number>(S.all(`SELECT sku, price FROM products`).map((r) => [r.sku, r.price || 0]));
  const seenProducts = new Map<string, { asin: string; title: string }>();
  let n = 0;
  await streamTsv(res, gzip, (r) => {
    n++;
    if (r["order-status"] === "Cancelled" || r["item-status"] === "Cancelled") return;
    const ch = r["sales-channel"] || "";
    if (ch && !/^amazon\.com$/i.test(ch)) return; // skip non-Amazon (MCF) & other marketplaces
    const sku = r["sku"]; if (!sku) return;
    const qty = num(r["quantity"]); if (!qty) return;
    const ts = Date.parse(r["purchase-date"]);
    const day = dayOf(ts, SALES_TZ);
    if (day < p.from || day > p.to) return;
    const key = day + "|" + sku;
    let a = agg.get(key);
    if (!a) { a = { day, sku, asin: r["asin"], units: 0, revenue: 0, priced: 0, orders: 0, est: 0, aspRev: 0, aspUnits: 0, lastPrice: null, lastTs: 0 }; agg.set(key, a); }
    a.units += qty; a.orders += 1;
    const ip = r["item-price"];
    if (ip !== "" && ip !== undefined) {
      const v = num(ip);
      a.revenue += v; a.priced += qty;
      // price signal for price-vs-sales: consumer orders only (business/quantity pricing differs), skip free lines
      if (v > 0 && r["is-business-order"] !== "true") {
        a.aspRev += v; a.aspUnits += qty;
        if (ts >= a.lastTs) { a.lastTs = ts; a.lastPrice = Math.round(v / qty * 100) / 100; } // price in effect at end of day
      }
    }
    else { const est = (prices.get(sku) || 0) * qty; a.revenue += est; a.est += est; }
    if (!seenProducts.has(sku)) seenProducts.set(sku, { asin: r["asin"], title: r["product-name"] });
  }, "amazon-order-id");
  // Write only what changed (Cloudflare limits storage by rows written).
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const existing = new Map<string, any>();
  for (const e of S.all(`SELECT day, sku, asin, units, revenue, priced_units, orders, est_revenue, asp_revenue, asp_units, last_price, last_ts
                         FROM sales_daily WHERE day >= ? AND day <= ?`, p.from, p.to)) existing.set(e.day + "|" + e.sku, e);
  const knownSkus = new Set(S.all(`SELECT sku FROM products`).map((x) => x.sku));
  const changedDays = new Set<string>();
  S.ctx.storage.transactionSync(() => {
    for (const [key, a] of agg) {
      const vals = [a.asin, a.units, r2(a.revenue), a.priced, a.orders, r2(a.est), r2(a.aspRev), a.aspUnits, a.lastPrice, a.lastTs || null];
      const e = existing.get(key);
      existing.delete(key);
      if (e && JSON.stringify([e.asin, e.units, e.revenue, e.priced_units, e.orders, e.est_revenue, e.asp_revenue, e.asp_units, e.last_price, e.last_ts]) === JSON.stringify(vals)) continue;
      S.run(`INSERT OR REPLACE INTO sales_daily (day, sku, asin, units, revenue, priced_units, orders, est_revenue, asp_revenue, asp_units, last_price, last_ts)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, a.day, a.sku, ...vals);
      changedDays.add(a.day);
    }
    for (const e of existing.values()) { // rows that no longer exist (e.g. cancelled orders)
      S.run(`DELETE FROM sales_daily WHERE day=? AND sku=?`, e.day, e.sku);
      changedDays.add(e.day);
    }
    for (const day of changedDays) {
      const t = S.one(`SELECT COALESCE(SUM(units),0) u, ROUND(COALESCE(SUM(revenue),0), 2) r FROM sales_daily WHERE day=?`, day);
      S.run(`INSERT OR REPLACE INTO sales_totals (day, units, revenue) VALUES (?,?,?)`, day, t.u, t.r);
    }
    for (const [sku, v] of seenProducts) {
      if (knownSkus.has(sku)) continue;
      S.run(`INSERT OR IGNORE INTO products (sku, asin, title, mrm_auto, first_seen, updated_at) VALUES (?,?,?,?,?,?)`,
        sku, v.asin, v.title, isMrMiracleText(v.title) ? 1 : 0, Date.now(), Date.now());
    }
  });
  return n;
}

// ---------- listings report → products ----------

async function processListings(S: Store, res: Response, gzip: boolean) {
  const rows: any[] = [];
  await streamTsv(res, gzip, (r) => rows.push(r), "seller-sku");
  const now = Date.now();
  const cur = new Map(S.all(`SELECT sku, asin, title, price, status, fulfillment FROM products`).map((x) => [x.sku, x]));
  S.ctx.storage.transactionSync(() => {
    for (const r of rows) {
      const sku = r["seller-sku"]; if (!sku) continue;
      const fba = /AMAZON/i.test(r["fulfillment-channel"] || "") ? "FBA" : "FBM";
      const title = r["item-name"] || "";
      const c = cur.get(sku);
      if (c && c.asin === (r["asin1"] || null) && c.title === title && c.price === numOrNull(r["price"]) && c.status === (r["status"] || "") && c.fulfillment === fba) continue;
      S.run(`INSERT INTO products (sku, asin, title, price, status, fulfillment, mrm_auto, first_seen, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(sku) DO UPDATE SET asin=excluded.asin, title=excluded.title, price=excluded.price,
               status=excluded.status, fulfillment=excluded.fulfillment,
               mrm_auto=CASE WHEN products.brand IS NOT NULL AND products.brand<>'' THEN products.mrm_auto ELSE excluded.mrm_auto END,
               updated_at=excluded.updated_at`,
        sku, r["asin1"] || null, title, numOrNull(r["price"]), r["status"] || "", fba, isMrMiracleText(title) ? 1 : 0, now, now);
    }
  });
  return rows.length;
}

// ---------- fee preview report → daily fee snapshot ----------

async function processFees(S: Store, res: Response, gzip: boolean, p: { day: string }) {
  const rows: any[] = [];
  await streamTsv(res, gzip, (r) => rows.push(r), "expected-fulfillment-fee-per-unit");
  const prods = new Map(S.all(`SELECT sku, fnsku, brand FROM products`).map((x) => [x.sku, x]));
  S.ctx.storage.transactionSync(() => {
    S.run(`DELETE FROM fee_snapshots WHERE day=?`, p.day);
    for (const r of rows) {
      const sku = r["sku"]; if (!sku) continue;
      S.run(`INSERT OR REPLACE INTO fee_snapshots (day, sku, asin, price, fulfil_fee, referral_fee, total_fee, longest, median, shortest,
               dim_unit, weight, weight_unit, size_tier, future_fulfil_fee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        p.day, sku, r["asin"], numOrNull(r["your-price"]), numOrNull(r["expected-fulfillment-fee-per-unit"]),
        numOrNull(r["estimated-referral-fee-per-unit"]), numOrNull(r["estimated-fee-total"]),
        numOrNull(r["longest-side"]), numOrNull(r["median-side"]), numOrNull(r["shortest-side"]), r["unit-of-dimension"] || "",
        numOrNull(r["item-package-weight"]), r["unit-of-weight"] || "", r["product-size-tier"] || "",
        numOrNull(r["expected-future-fulfillment-fee-per-unit"]));
      const brand = r["brand"] || "";
      const pr = prods.get(sku);
      if (pr && (pr.fnsku || "") === (r["fnsku"] || pr.fnsku || "") && (pr.brand || "") === (brand || pr.brand || "")) continue;
      S.run(`UPDATE products SET fnsku=COALESCE(NULLIF(?,''), fnsku), brand=COALESCE(NULLIF(?,''), brand),
               mrm_auto=CASE WHEN ?<>'' THEN ? ELSE mrm_auto END WHERE sku=?`,
        r["fnsku"] || "", brand, brand, isMrMiracleText(brand) || isMrMiracleText(r["product-name"]) ? 1 : 0, sku);
    }
  });
  return rows.length;
}

// ---------- inventory planning report → low-inventory-level fee status etc ----------

async function processPlanning(S: Store, res: Response, gzip: boolean, p: { day: string }) {
  const rows: any[] = [];
  await streamTsv(res, gzip, (r) => rows.push(r), "sku");
  S.ctx.storage.transactionSync(() => {
    for (const r of rows) {
      const sku = r["sku"]; if (!sku) continue;
      S.run(`INSERT OR REPLACE INTO planning (sku, asin, snapshot, days_of_supply, hist_dos, short_hist_dos, long_hist_dos, min_level, health,
               low_inv_applied, low_inv_exempt, rec_ship_qty, rec_ship_date, total_dos, featured_price, alert, storage_cost_next_month, updated_day)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        sku, r["asin"], r["snapshot-date"], numOrNull(r["days-of-supply"]), numOrNull(r["historical-days-of-supply"]),
        numOrNull(r["Short term historical days of supply"]), numOrNull(r["Long term historical days of supply"]),
        numOrNull(r["fba-minimum-inventory-level"]), r["fba-inventory-level-health-status"] || "",
        r["Low-Inventory-Level fee applied in current week?"] || "", r["Exempted from Low-Inventory-Level fee?"] || "",
        numOrNull(r["Recommended ship-in quantity"]), r["Recommended ship-in date"] || "",
        numOrNull(r["Total Days of Supply (including units from open shipments)"]), numOrNull(r["featuredoffer-price"]),
        r["alert"] || "", numOrNull(r["estimated-storage-cost-next-month"]), p.day);
      if (r["fnsku"]) S.run(`UPDATE products SET fnsku=? WHERE sku=? AND fnsku IS NULL`, r["fnsku"], sku);
    }
  });
  return rows.length;
}

export const PROCESSORS: Record<string, (S: Store, res: Response, gzip: boolean, p: any) => Promise<number>> = {
  orders_recent: processOrders, orders_backfill: processOrders, orders_refresh: processOrders,
  listings: processListings, fees: processFees, planning: processPlanning,
};

const AFTER: Record<string, (S: Store, p: any) => Promise<void> | void> = {
  orders_backfill: (S, p) => {
    const bf = S.setting("backfill", null);
    if (bf && p.from) S.setSetting("backfill", { ...bf, cursor: addDays(p.from, -1) });
  },
  fees: (S, p) => S.feesDiffIfReady(p.day),
  planning: (S, p) => S.feesDiffIfReady(p.day),
};

// ---------- inventory API (live) ----------

/** Pulls FBA inventory summaries page by page; resumes across alarm ticks. Returns true when pass is complete.
 *  Only SKUs whose numbers changed are written (Cloudflare limits storage by rows written). */
export async function syncInventory(S: Store): Promise<boolean> {
  const st = S.setting<any>("inv_pass", null) || { token: null, started: Date.now(), seen: [] };
  st.seen = st.seen || [];
  const cols = ["asin", "fnsku", "fulfillable", "reserved", "fc_transfer", "fc_processing", "customer_order", "inbound_working",
    "inbound_shipped", "inbound_receiving", "unfulfillable", "researching", "total"];
  const existing = new Map(S.all(`SELECT sku, ${cols.join(", ")} FROM inventory`).map((r) => [r.sku, r]));
  const knownSkus = new Set(S.all(`SELECT sku FROM products`).map((x) => x.sku));
  while (S.budgetLeft() > 3) {
    const q: any = {
      details: "true", granularityType: "Marketplace", granularityId: S.amz.marketplaceId, marketplaceIds: S.amz.marketplaceId,
    };
    if (st.token) q.nextToken = st.token;
    const b = await S.amz.ok("GET", "/fba/inventory/v1/summaries", q);
    const list = b.payload?.inventorySummaries || [];
    const now = Date.now();
    S.ctx.storage.transactionSync(() => {
      for (const it of list) {
        const d = it.inventoryDetails || {};
        const rq = d.reservedQuantity || {};
        const vals = [it.asin, it.fnSku, d.fulfillableQuantity || 0, rq.totalReservedQuantity || 0,
          rq.pendingTransshipmentQuantity || 0, rq.fcProcessingQuantity || 0, rq.pendingCustomerOrderQuantity || 0,
          d.inboundWorkingQuantity || 0, d.inboundShippedQuantity || 0, d.inboundReceivingQuantity || 0,
          d.unfulfillableQuantity?.totalUnfulfillableQuantity || 0, d.researchingQuantity?.totalResearchingQuantity || 0,
          it.totalQuantity || 0];
        st.seen.push(it.sellerSku);
        const e = existing.get(it.sellerSku);
        if (!e || JSON.stringify(cols.map((c) => e[c])) !== JSON.stringify(vals)) {
          S.run(`INSERT OR REPLACE INTO inventory (sku, ${cols.join(", ")}, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            it.sellerSku, ...vals, now);
        }
        if (!knownSkus.has(it.sellerSku)) {
          knownSkus.add(it.sellerSku);
          S.run(`INSERT OR IGNORE INTO products (sku, asin, fnsku, title, mrm_auto, fulfillment, first_seen, updated_at) VALUES (?,?,?,?,?,'FBA',?,?)`,
            it.sellerSku, it.asin, it.fnSku, it.productName || "", isMrMiracleText(it.productName) ? 1 : 0, now, now);
        }
      }
    });
    st.token = b.pagination?.nextToken || null;
    if (!st.token) {
      // SKUs Amazon no longer reports: zero them (only those that aren't already zero)
      const seen = new Set<string>(st.seen);
      for (const [sku, e] of existing) {
        if (seen.has(sku) || !cols.slice(2).some((c) => e[c])) continue;
        S.run(`UPDATE inventory SET fulfillable=0, reserved=0, fc_transfer=0, fc_processing=0, customer_order=0, inbound_working=0,
               inbound_shipped=0, inbound_receiving=0, unfulfillable=0, researching=0, total=0, updated_at=? WHERE sku=?`, now, sku);
      }
      S.setSetting("inv_pass", null);
      return true;
    }
    S.setSetting("inv_pass", st);
  }
  return false;
}

// ---------- catalog (images, brand) ----------

export async function syncCatalog(S: Store): Promise<boolean> {
  const stale = Date.now() - 7 * 86_400_000;
  while (S.budgetLeft() > 3) {
    const asins = S.all(`SELECT DISTINCT asin FROM products WHERE asin IS NOT NULL AND asin<>'' AND (catalog_at IS NULL OR catalog_at < ?) LIMIT 20`, stale)
      .map((r) => r.asin);
    if (!asins.length) return true;
    const b = await S.amz.ok("GET", "/catalog/2022-04-01/items", {
      identifiers: asins.join(","), identifiersType: "ASIN", marketplaceIds: S.amz.marketplaceId,
      includedData: "images,summaries", pageSize: 20,
    });
    const now = Date.now();
    S.ctx.storage.transactionSync(() => {
      for (const it of b.items || []) {
        const imgs = (it.images || []).find((x: any) => x.marketplaceId === S.amz.marketplaceId)?.images || it.images?.[0]?.images || [];
        const main = imgs.filter((x: any) => x.variant === "MAIN").sort((a: any, b: any) => a.width - b.width);
        const thumb = (main.find((x: any) => x.width >= 100) || main[main.length - 1])?.link || null;
        const sum = (it.summaries || [])[0] || {};
        const brand = sum.brand || sum.brandName || "";
        S.run(`UPDATE products SET image=COALESCE(?, image), brand=COALESCE(NULLIF(?,''), brand),
                 mrm_auto=CASE WHEN ?<>'' THEN ? ELSE mrm_auto END, catalog_at=? WHERE asin=?`,
          thumb, brand, brand, isMrMiracleText(brand) || isMrMiracleText(sum.itemName) ? 1 : 0, now, it.asin);
      }
      // mark the rest as checked so we don't loop on ASINs Amazon doesn't return
      for (const a of asins) S.run(`UPDATE products SET catalog_at=? WHERE asin=? AND catalog_at IS NULL`, now, a);
    });
  }
  return false;
}

export function todayLA() { return today(SALES_TZ); }
