// All FBA shipments on the account (Amazon's v0 inbound API), synced into `fba_shipments` so the Shipping page can
// list, filter and export every shipment — including ones made outside this system — next to our own plans.
import type { Store } from "./store";

const ALL_STATUSES = "WORKING,READY_TO_SHIP,SHIPPED,RECEIVING,CANCELLED,DELETED,CLOSED,ERROR,IN_TRANSIT,DELIVERED,CHECKED_IN";
const FINAL = new Set(["CLOSED", "CANCELLED", "DELETED"]);

async function call(S: Store, path: string, query: any) {
  const r = await S.amz.req("GET", path, query);
  if (r.status >= 300) throw new Error(`Amazon ${r.status}: ${r.body?.errors?.map((e: any) => e.message).join("; ") || "error"}`);
  return r.body;
}

/** Created date from Amazon's default shipment names, e.g. "FBA STA-(11/25/26 05:56 AM)-HEA2-0" or "FBA STA (11/25/2026 17:01)-HGR6". */
export function dateFromName(name: string): string | null {
  const m = String(name || "").match(/\((\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function upsert(S: Store, sh: any) {
  const id = sh.ShipmentId;
  const cur = S.one(`SELECT status, name, dest_fc, ship_from FROM fba_shipments WHERE shipment_id=?`, id);
  const from = JSON.stringify(sh.ShipFromAddress || null);
  if (cur && cur.status === sh.ShipmentStatus && cur.name === sh.ShipmentName && cur.dest_fc === sh.DestinationFulfillmentCenterId && cur.ship_from === from) return false;
  S.run(`INSERT INTO fba_shipments (shipment_id, name, status, dest_fc, ship_from, label_prep, box_source, created_day, first_seen, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(shipment_id) DO UPDATE SET name=excluded.name, status=excluded.status, dest_fc=excluded.dest_fc, ship_from=excluded.ship_from,
           label_prep=excluded.label_prep, box_source=excluded.box_source, updated_at=excluded.updated_at,
           created_day=COALESCE(fba_shipments.created_day, excluded.created_day)`,
    id, sh.ShipmentName || "", sh.ShipmentStatus || "", sh.DestinationFulfillmentCenterId || "", from, sh.LabelPrepType || "",
    sh.BoxContentsSource || "", dateFromName(sh.ShipmentName), Date.now(), Date.now());
  return true;
}

export async function fetchItems(S: Store, shipmentId: string) {
  const items: any[] = [];
  let token: string | undefined;
  for (let i = 0; i < 10; i++) {
    const b = await call(S, token ? `/fba/inbound/v0/shipmentItems` : `/fba/inbound/v0/shipments/${shipmentId}/items`,
      token ? { QueryType: "NEXT_TOKEN", NextToken: token, MarketplaceId: S.amz.marketplaceId } : { MarketplaceId: S.amz.marketplaceId });
    const page = b.payload?.ItemData || [];
    for (const x of page) {
      if (items.some((y) => y.sku === x.SellerSKU)) continue;
      items.push({ sku: x.SellerSKU, fnsku: x.FulfillmentNetworkSKU, shipped: x.QuantityShipped || 0, received: x.QuantityReceived || 0, inCase: x.QuantityInCase || 0 });
    }
    // Amazon returns a NextToken even on the last page; only follow it when the page was full
    token = page.length >= 50 ? b.payload?.NextToken : undefined;
    if (!token) break;
  }
  const json = JSON.stringify(items);
  const cur = S.one(`SELECT items_json FROM fba_shipments WHERE shipment_id=?`, shipmentId);
  if (cur?.items_json !== json) {
    S.run(`UPDATE fba_shipments SET items_json=?, sku_count=?, units=?, received=?, items_at=? WHERE shipment_id=?`,
      json, items.length, items.reduce((a, x) => a + x.shipped, 0), items.reduce((a, x) => a + x.received, 0), Date.now(), shipmentId);
  } else S.run(`UPDATE fba_shipments SET items_at=? WHERE shipment_id=? AND (items_at IS NULL OR items_at < ?)`, Date.now(), shipmentId, Date.now() - 3600_000);
  return items;
}

/** Imports (or refreshes) one shipment by its FBA ID. */
export async function importShipment(S: Store, shipmentId: string) {
  const id = String(shipmentId || "").trim().toUpperCase();
  if (!/^FBA[0-9A-Z]{6,}$/.test(id)) throw new Error("Enter an FBA shipment ID like FBA19YKN00Q3.");
  const b = await call(S, "/fba/inbound/v0/shipments", { QueryType: "SHIPMENT", ShipmentIdList: id, MarketplaceId: S.amz.marketplaceId });
  const sh = (b.payload?.ShipmentData || [])[0];
  if (!sh) throw new Error(`Amazon has no shipment ${id} on this account.`);
  upsert(S, sh);
  await fetchItems(S, id);
  linkPlans(S);
  return S.one(`SELECT * FROM fba_shipments WHERE shipment_id=?`, id);
}

/** Connect FBA shipments to the plans created in this system. */
export function linkPlans(S: Store) {
  for (const p of S.all(`SELECT id, created_by, data FROM ship_plans WHERE status NOT IN ('draft','cancelled')`)) {
    const d = JSON.parse(p.data || "{}");
    for (const s of d.shipments || []) {
      if (s.confirmationId) S.run(`UPDATE fba_shipments SET plan_id=?, submitted_by=COALESCE(submitted_by, ?) WHERE shipment_id=? AND (plan_id IS NULL OR plan_id<>?)`, p.id, p.created_by, s.confirmationId, p.id);
    }
  }
}

/**
 * Scheduler hook. First run loads the last 12 months; afterwards it asks for shipments updated since the last sync.
 * Then fills in SKU lines for shipments that don't have them yet or are still moving.
 */
export async function syncShipments(S: Store): Promise<boolean> {
  const st = S.setting<any>("fba_ship_sync", null) || { since: new Date(Date.now() - 365 * 86_400_000).toISOString(), token: null };
  const started = st.started || new Date(Date.now() - 60_000).toISOString();
  while (S.budgetLeft() > 6) {
    const q: any = st.token ? { QueryType: "NEXT_TOKEN", NextToken: st.token, MarketplaceId: S.amz.marketplaceId }
      : { QueryType: "DATE_RANGE", LastUpdatedAfter: st.since, LastUpdatedBefore: started, ShipmentStatusList: ALL_STATUSES, MarketplaceId: S.amz.marketplaceId };
    const b = await call(S, "/fba/inbound/v0/shipments", q);
    S.ctx.storage.transactionSync(() => { for (const sh of b.payload?.ShipmentData || []) upsert(S, sh); });
    const got = (b.payload?.ShipmentData || []).length;
    st.token = got ? b.payload?.NextToken || null : null; // an empty page ends the scan even if Amazon sends a token
    st.pages = (st.pages || 0) + 1;
    if (st.pages > 400) st.token = null; // hard stop
    st.started = started;
    if (!st.token) { S.setSetting("fba_ship_sync", { since: new Date(Date.parse(started) - 86_400_000).toISOString(), token: null }); break; }
    S.setSetting("fba_ship_sync", st);
  }
  if (S.setting<any>("fba_ship_sync", {})?.token) return false; // more pages next tick
  // SKU lines: missing ones first, then shipments still in progress (at most every 3 hours each)
  const todo = S.all(`SELECT shipment_id, status FROM fba_shipments WHERE items_at IS NULL OR (status NOT IN ('CLOSED','CANCELLED','DELETED') AND items_at < ?)
                      ORDER BY items_at IS NOT NULL, updated_at DESC LIMIT 30`, Date.now() - 3 * 3600_000);
  for (const t of todo) {
    if (S.budgetLeft() < 4) return false;
    try { await fetchItems(S, t.shipment_id); } catch (e: any) { S.log("shipments", `${t.shipment_id}: ${e.message}`); S.run(`UPDATE fba_shipments SET items_at=? WHERE shipment_id=?`, Date.now(), t.shipment_id); }
  }
  linkPlans(S);
  return todo.length < 30;
}

/** Rows for the Shipping page: every FBA shipment plus our drafts / plans still being set up. */
export function shipmentList(S: Store) {
  const prods = new Map<string, any>(S.all(`SELECT sku, asin, title, image, price FROM products`).map((p) => [p.sku, p]));
  const plans = S.all(`SELECT id, name, status, inbound_plan_id, created_by, created_at, updated_at, data FROM ship_plans ORDER BY id DESC`);
  const planById = new Map(plans.map((p) => [p.id, { ...p, data: JSON.parse(p.data || "{}") }]));
  const rows: any[] = [];
  for (const s of S.all(`SELECT * FROM fba_shipments ORDER BY COALESCE(created_day, '') DESC, updated_at DESC`)) {
    const items = JSON.parse(s.items_json || "[]").map((x: any) => ({ ...x, asin: prods.get(x.sku)?.asin || null, title: prods.get(x.sku)?.title || "", price: prods.get(x.sku)?.price || null }));
    const plan = s.plan_id ? planById.get(s.plan_id) : null;
    const sh = plan ? (plan.data.shipments || []).find((x: any) => x.confirmationId === s.shipment_id) : null;
    const boxes = sh ? (plan.data.boxList?.[sh.shipmentId] || []) : [];
    const boxed = boxes.reduce((a: number, b: any) => a + (b.items || []).reduce((c: number, x: any) => c + (x.qty || 0), 0), 0);
    const from = JSON.parse(s.ship_from || "null");
    rows.push({
      kind: "fba", id: s.shipment_id, name: s.name, status: s.status, destination: s.dest_fc, from: from ? [from.Name, from.City, from.StateOrProvinceCode].filter(Boolean).join(", ") : "",
      skus: s.sku_count ?? items.length, units: s.units ?? 0, received: s.received ?? 0, boxes: sh ? boxes.length : null, boxed: sh ? boxed : null,
      planId: s.plan_id || null, submittedBy: s.submitted_by || plan?.created_by || "", note: s.note || "", shippingCost: s.shipping_cost,
      created: s.created_day || (s.first_seen ? new Date(s.first_seen).toISOString().slice(0, 10) : null), updatedAt: s.updated_at,
      value: items.reduce((a: number, x: any) => a + (x.price || 0) * x.shipped, 0), boxSource: s.box_source, labelPrep: s.label_prep, items,
    });
  }
  // plans that don't have an Amazon shipment yet (drafts, looking for warehouse, …)
  const linked = new Set(rows.filter((r) => r.planId).map((r) => r.planId));
  for (const p of planById.values()) {
    if (linked.has(p.id) || p.status === "cancelled" && !p.inbound_plan_id) continue;
    if ((p.data.shipments || []).some((x: any) => x.confirmationId && rows.some((r) => r.id === x.confirmationId))) continue;
    const items = S.all(`SELECT sku, qty FROM ship_items WHERE plan_id=?`, p.id).map((x) => ({ sku: x.sku, shipped: x.qty, received: 0, asin: prods.get(x.sku)?.asin || null, title: prods.get(x.sku)?.title || "", fnsku: null }));
    rows.push({
      kind: "plan", id: `PLAN-${p.id}`, name: p.name, status: p.status === "cancelled" ? "CANCELLED" : "DRAFT", planStatus: p.status, destination: (p.data.target?.warehouses || []).join("/") || "",
      from: "", skus: items.length, units: items.reduce((a: number, x: any) => a + x.shipped, 0), received: 0, boxes: null, boxed: null, planId: p.id,
      submittedBy: p.created_by || "", note: p.data.note || "", shippingCost: p.data.shippingPrice ?? null, created: new Date(p.created_at).toISOString().slice(0, 10),
      updatedAt: p.updated_at, value: items.reduce((a: number, x: any) => a + (prods.get(x.sku)?.price || 0) * x.shipped, 0), items,
    });
  }
  rows.sort((a, b) => (b.created || "").localeCompare(a.created || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
  return { rows, syncedAt: S.one(`SELECT last_ok FROM jobs_state WHERE name='fba_shipments'`)?.last_ok || null };
}
