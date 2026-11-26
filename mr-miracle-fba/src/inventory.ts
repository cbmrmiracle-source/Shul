// Inventory & purchasing (modelled on 9Yard):
//   products (physical items, stock counted here) ←mapping (qty)→ SKUs (Amazon listings; kits = several products)
//   vendors / vendor items (what each vendor sells you, price, case qty), warehouses, stock + stock_moves ledger (qty AND $),
//   purchase orders (Draft → Working → Inbound → Receiving → Closed) with receiving into a warehouse at landed cost,
//   forecasting (lead + purchase days of cover, rounded to case qty), and shipment deductions.
import type { Store } from "./store";
import { addDays, parseCsv, round2 } from "./util";

export class InvError extends Error {}
const need = (c: any, m: string) => { if (!c) throw new InvError(m); };
const n = (v: any) => { const x = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(x) ? x : 0; };
const nn = (v: any) => (v === "" || v === null || v === undefined ? null : n(v));
const r4 = (x: number) => Math.round(x * 10000) / 10000;
export const PO_STATUSES = ["Draft", "Working", "Inbound", "Receiving", "Closed", "Deleted"];
const OPEN_PO = ["Working", "Inbound", "Receiving"];

// ---------- warehouses ----------
export function ensureWarehouses(S: Store) {
  if (!S.one(`SELECT 1 x FROM warehouses LIMIT 1`)) {
    S.run(`INSERT INTO warehouses (name, address, is_default, is_deduct) VALUES ('Mr Miracle', '319 Moffat Street, Brooklyn, NY 11237', 1, 0)`);
    S.run(`INSERT INTO warehouses (name, address, is_default, is_deduct) VALUES ('Mr Miracle FBA INTERIM', '', 0, 1)`);
  }
}
const whByName = (S: Store, name: string) => S.one(`SELECT id FROM warehouses WHERE lower(name)=lower(?)`, String(name || "").trim())?.id || null;
const defaultWh = (S: Store) => S.one(`SELECT id FROM warehouses WHERE is_default=1 ORDER BY id LIMIT 1`)?.id || S.one(`SELECT id FROM warehouses ORDER BY id LIMIT 1`)?.id;

// ---------- stock movements ----------
function onHand(S: Store, productId: number) { return S.one(`SELECT COALESCE(SUM(qty),0) q FROM stock WHERE product_id=?`, productId).q; }

/** Moves stock and records it in the ledger. Positive qty with a unit cost re-averages the product's cost (weighted average). */
export function move(S: Store, o: { productId: number; warehouseId: number; qty: number; unitCost?: number | null; type: string; ref?: string; note?: string; user: string }) {
  need(o.qty, "Quantity can't be zero.");
  const p = S.one(`SELECT id, avg_cost FROM inv_products WHERE id=?`, o.productId);
  need(p, "Unknown product.");
  need(S.one(`SELECT 1 x FROM warehouses WHERE id=?`, o.warehouseId), "Unknown warehouse.");
  const cost = o.unitCost === null || o.unitCost === undefined ? (p.avg_cost || 0) : o.unitCost;
  if (o.qty > 0 && o.unitCost !== null && o.unitCost !== undefined) {
    const have = Math.max(0, onHand(S, o.productId));
    const avg = have + o.qty > 0 ? (have * (p.avg_cost || 0) + o.qty * cost) / (have + o.qty) : cost;
    S.run(`UPDATE inv_products SET avg_cost=?, updated_at=? WHERE id=?`, r4(avg), Date.now(), o.productId);
  }
  S.run(`INSERT INTO stock (product_id, warehouse_id, qty) VALUES (?,?,?) ON CONFLICT(product_id, warehouse_id) DO UPDATE SET qty=stock.qty+excluded.qty`,
    o.productId, o.warehouseId, o.qty);
  S.run(`INSERT INTO stock_moves (ts, product_id, warehouse_id, qty, unit_cost, value, type, ref, note, user) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    Date.now(), o.productId, o.warehouseId, o.qty, r4(cost), round2(o.qty * cost), o.type, o.ref || null, o.note || null, o.user);
}

// ---------- product stats ----------
export function productStats(S: Store, onlyId?: number) {
  const d = S.salesToday(), y = addDays(d, -1);
  const maps = S.all(`SELECT m.sku, m.product_id, m.qty FROM inv_mappings m`);
  const bySku = new Map<string, { product_id: number; qty: number }[]>();
  for (const m of maps) { if (!bySku.has(m.sku)) bySku.set(m.sku, []); bySku.get(m.sku)!.push(m); }
  const add = (map: Map<number, number>, id: number, v: number) => map.set(id, (map.get(id) || 0) + v);
  const onhand = new Map<number, number>(), fba = new Map<number, number>(), inbound = new Map<number, number>(), reserved = new Map<number, number>();
  const l7 = new Map<number, number>(), l14 = new Map<number, number>(), l30 = new Map<number, number>(), skus = new Map<number, string[]>();
  for (const s of S.all(`SELECT product_id, SUM(qty) q FROM stock GROUP BY product_id`)) onhand.set(s.product_id, s.q);
  for (const r of S.all(`SELECT sku, total FROM inventory WHERE total > 0`)) for (const m of bySku.get(r.sku) || []) add(fba, m.product_id, r.total * m.qty);
  for (const r of S.all(`SELECT i.product_id, SUM(i.qty - i.received) q FROM po_items i JOIN purchase_orders p ON p.id=i.po_id
                         WHERE p.status IN ('Working','Inbound','Receiving') AND i.product_id IS NOT NULL GROUP BY i.product_id`)) inbound.set(r.product_id, Math.max(0, r.q));
  for (const r of S.all(`SELECT sku, SUM(CASE WHEN day > ? THEN units ELSE 0 END) a, SUM(CASE WHEN day > ? THEN units ELSE 0 END) b, SUM(units) c
                         FROM sales_daily WHERE day > ? AND day <= ? GROUP BY sku`, addDays(y, -7), addDays(y, -14), addDays(y, -30), y)) {
    for (const m of bySku.get(r.sku) || []) { add(l7, m.product_id, r.a * m.qty); add(l14, m.product_id, r.b * m.qty); add(l30, m.product_id, r.c * m.qty); }
  }
  // units committed to shipments built here that haven't been deducted yet
  const deducted = new Set(S.all(`SELECT ref FROM ship_deductions`).map((x) => x.ref));
  for (const p of S.all(`SELECT id FROM ship_plans WHERE status NOT IN ('cancelled')`)) {
    if (deducted.has(`PLAN-${p.id}`)) continue;
    for (const it of S.all(`SELECT sku, qty FROM ship_items WHERE plan_id=?`, p.id)) for (const m of bySku.get(it.sku) || []) add(reserved, m.product_id, it.qty * m.qty);
  }
  for (const m of maps) { if (!skus.has(m.product_id)) skus.set(m.product_id, []); skus.get(m.product_id)!.push(m.sku); }
  // primary (else cheapest active) vendor item per product
  const vend = new Map<number, any>();
  for (const v of S.all(`SELECT vi.*, v.name vendor, v.lead_days, v.purchase_days FROM vendor_items vi LEFT JOIN vendors v ON v.id=vi.vendor_id
                         WHERE vi.active=1 ORDER BY vi.is_primary DESC, vi.price ASC`)) if (!vend.has(v.product_id)) vend.set(v.product_id, v);
  const rows = S.all(`SELECT * FROM inv_products ${onlyId ? "WHERE id=?" : ""} ORDER BY name`, ...(onlyId ? [onlyId] : []));
  return rows.map((p) => {
    const oh = onhand.get(p.id) || 0, fb = Math.round(fba.get(p.id) || 0), ib = inbound.get(p.id) || 0, rs = Math.round(reserved.get(p.id) || 0);
    const a = l7.get(p.id) || 0, b = l14.get(p.id) || 0, c = l30.get(p.id) || 0;
    const daily = Math.max(c, (a * 4 + b * 2 + c) / 3) / 30;
    const v = vend.get(p.id);
    const cover = v ? (n(v.lead_days) + n(v.purchase_days)) : 30;
    let suggested = Math.ceil(daily * cover - (oh + ib + fb));
    if (suggested > 0 && v && n(v.case_qty) > 1 && /up|yes/i.test(v.rounding || "")) suggested = Math.ceil(suggested / n(v.case_qty)) * n(v.case_qty);
    return {
      ...p, onHand: oh, reserved: rs, free: oh - rs, inbound: ib, fba: fb, total: oh + ib + fb,
      value: round2(oh * (p.avg_cost || 0)), totalValue: round2((oh + ib + fb) * (p.avg_cost || 0)),
      sold7: Math.round(a), sold14: Math.round(b), sold30: Math.round(c), perDay: round2(daily), coverDays: cover,
      suggested: daily ? suggested : Math.min(0, suggested), skus: skus.get(p.id) || [],
      vendor: v ? { id: v.vendor_id, name: v.vendor, itemId: v.id, price: v.price || v.avg_price || p.avg_cost || 0, caseQty: v.case_qty, moq: v.moq, leadDays: v.lead_days, purchaseDays: v.purchase_days } : null,
    };
  });
}

/** SKU cost from its mapped products' average cost (kits add up). */
export function skuCosts(S: Store) {
  const out = new Map<string, number>();
  for (const r of S.all(`SELECT m.sku, SUM(m.qty * p.avg_cost) c FROM inv_mappings m JOIN inv_products p ON p.id=m.product_id GROUP BY m.sku`)) out.set(r.sku, r4(r.c));
  return out;
}

// ---------- CSV imports (accept 9Yard export files as-is) ----------
function rowsOf(csv: string) {
  const r = parseCsv(String(csv || "").replace(/^﻿/, ""));
  need(r.length > 1, "The file is empty.");
  const h = r[0].map((x) => x.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  return r.slice(1).map((cells) => {
    const o: Record<string, string> = {};
    h.forEach((k, i) => { o[k] = (cells[i] ?? "").trim(); });
    return o;
  });
}
const pick = (o: Record<string, string>, ...keys: string[]) => { for (const k of keys) { const v = o[k.toLowerCase().replace(/[^a-z0-9]/g, "")]; if (v !== undefined && v !== "") return v; } return ""; };
const truthy = (v: string) => /^(true|yes|1|y)$/i.test(v || "");
const ts = (v: string) => { if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const isoDay = (v: string) => { const t = ts(v); return t ? new Date(t).toISOString().slice(0, 10) : null; };

export function importCsv(S: Store, kind: string, csv: string, user: string) {
  const rows = rowsOf(csv);
  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const now = Date.now();
  S.ctx.storage.transactionSync(() => {
    for (const [i, o] of rows.entries()) {
      try {
        if (kind === "products") {
          const name = pick(o, "Product ID", "ProductName", "Name"); if (!name) { skipped++; continue; }
          const cur = S.one(`SELECT id FROM inv_products WHERE name=?`, name);
          const vals = [pick(o, "ItemId") || null, pick(o, "Title") || name, pick(o, "ImageUrl", "Image") || null, pick(o, "Upc") || null, n(pick(o, "AveragePrice", "AvgCost", "Average Cost")) || n(pick(o, "VendorCost")) || 0, pick(o, "Tags", "TagMapped") || null];
          if (cur) { S.run(`UPDATE inv_products SET ext_id=COALESCE(?, ext_id), title=?, image=COALESCE(?, image), upc=COALESCE(?, upc), avg_cost=?, tags=COALESCE(?, tags), updated_at=? WHERE id=?`, ...vals, now, cur.id); updated++; }
          else { S.run(`INSERT INTO inv_products (ext_id, name, title, image, upc, avg_cost, tags, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`, vals[0], name, ...vals.slice(1), now, now); added++; }
        } else if (kind === "vendors") {
          const name = pick(o, "VendorName", "Name", "Vendor"); if (!name) { skipped++; continue; }
          const del = truthy(pick(o, "DeleteFlag"));
          const vals = [pick(o, "VendorId") || null, pick(o, "Address1"), pick(o, "Address2"), pick(o, "City"), pick(o, "State"), pick(o, "Postal"), pick(o, "Country"), pick(o, "Phone"), pick(o, "Email"),
            nn(pick(o, "LeadDays")), nn(pick(o, "PurchaseDays")), nn(pick(o, "SafetyStock")), nn(pick(o, "OrderMinimumAmount")), pick(o, "Terms"), pick(o, "Currency") || "USD", del ? 0 : 1];
          const cur = S.one(`SELECT id FROM vendors WHERE name=?`, name.trim());
          if (cur) { S.run(`UPDATE vendors SET ext_id=?, address1=?, address2=?, city=?, state=?, postal=?, country=?, phone=?, email=?, lead_days=?, purchase_days=?, safety_stock=?, order_min=?, terms=?, currency=?, active=? WHERE id=?`, ...vals, cur.id); updated++; }
          else { S.run(`INSERT INTO vendors (ext_id, address1, address2, city, state, postal, country, phone, email, lead_days, purchase_days, safety_stock, order_min, terms, currency, active, name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, name.trim(), ts(pick(o, "AddedOn")) || now); added++; }
        } else if (kind === "vendor_items") {
          const pname = pick(o, "ProductName", "Product"), vname = pick(o, "VendorName", "Vendor");
          const prod = S.one(`SELECT id FROM inv_products WHERE name=?`, pname) || S.one(`SELECT id FROM inv_products WHERE ext_id=?`, pick(o, "ItemId"));
          const ven = S.one(`SELECT id FROM vendors WHERE name=?`, vname.trim()) || S.one(`SELECT id FROM vendors WHERE ext_id=?`, pick(o, "VendorId"));
          if (!prod || !ven) { skipped++; if (errors.length < 15) errors.push(`Row ${i + 2}: ${!prod ? `product "${pname}"` : `vendor "${vname}"`} not found — import products/vendors first`); continue; }
          const ext = pick(o, "ItemVendorId") || null;
          const vals = [prod.id, ven.id, pick(o, "VendorItemName") || pname, pick(o, "Model"), n(pick(o, "Price")), n(pick(o, "AvgPrice")) || n(pick(o, "Price")), nn(pick(o, "CaseQty")), nn(pick(o, "MinimumOrderQty", "MOQ")),
            (pick(o, "CaseRoundingSetting", "Rounding") || "none").toLowerCase(), truthy(pick(o, "OutOfStock")) ? 1 : 0, truthy(pick(o, "IsPrimary")) ? 1 : 0, pick(o, "Upc"), pick(o, "Notes"),
            nn(pick(o, "Length")), nn(pick(o, "Width")), nn(pick(o, "Height")), nn(pick(o, "Weight")), truthy(pick(o, "DeleteFlag")) ? 0 : 1];
          // 9Yard's vendor-item id identifies the row (one vendor can sell the same product under two item names)
          const cur = ext ? S.one(`SELECT id FROM vendor_items WHERE ext_id=?`, ext)
            : S.one(`SELECT id FROM vendor_items WHERE product_id=? AND vendor_id=? AND vendor_item_name=?`, prod.id, ven.id, pick(o, "VendorItemName") || pname);
          if (cur) { S.run(`UPDATE vendor_items SET product_id=?, vendor_id=?, vendor_item_name=?, model=?, price=?, avg_price=?, case_qty=?, moq=?, rounding=?, out_of_stock=?, is_primary=?, upc=?, notes=?, length=?, width=?, height=?, weight=?, active=? WHERE id=?`, ...vals, cur.id); updated++; }
          else { S.run(`INSERT INTO vendor_items (product_id, vendor_id, vendor_item_name, model, price, avg_price, case_qty, moq, rounding, out_of_stock, is_primary, upc, notes, length, width, height, weight, active, ext_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, ext); added++; }
        } else if (kind === "mappings") {
          const sku = pick(o, "Sku", "SKU"), pname = pick(o, "Product", "ProductName"), qty = n(pick(o, "Qty", "Quantity"));
          const acct = pick(o, "Account");
          if (acct && !/^mr miracle$/i.test(acct)) { skipped++; continue; } // other channel accounts (Walmart) left out for now
          if (!sku || !pname || !(qty > 0)) { skipped++; continue; }
          const prod = S.one(`SELECT id FROM inv_products WHERE name=?`, pname);
          if (!prod) { skipped++; if (errors.length < 15) errors.push(`Row ${i + 2}: product "${pname}" not found`); continue; }
          const cur = S.one(`SELECT qty FROM inv_mappings WHERE sku=? AND product_id=?`, sku, prod.id);
          if (cur && cur.qty === qty) { skipped++; continue; }
          S.run(`INSERT OR REPLACE INTO inv_mappings (sku, product_id, qty) VALUES (?,?,?)`, sku, prod.id, qty);
          cur ? updated++ : added++;
        } else if (kind === "purchase_orders") {
          const id = Math.round(n(pick(o, "PurchaseOrderId", "PO", "PO #"))); if (!id) { skipped++; continue; }
          const vname = pick(o, "Vendor", "VendorName").trim();
          const ven = S.one(`SELECT id FROM vendors WHERE name=?`, vname);
          const atts = pick(o, "FileName").split(/\s,(?=[^,]*:https?:)/).map((x) => x.trim()).filter(Boolean).map((x) => { const k = x.indexOf(":http"); return k > 0 ? { name: x.slice(0, k), url: x.slice(k + 1) } : { name: x, url: "" }; });
          const vals = [ven?.id || null, vname, pick(o, "Status") || "Draft", whByName(S, pick(o, "WharehouseName", "Warehouse")), pick(o, "WharehouseName", "Warehouse"), pick(o, "InvoiceNumber"), isoDay(pick(o, "InvoiceDate")),
            ts(pick(o, "DateCreated")) || now, ts(pick(o, "DateSubmited", "DateSubmitted")), isoDay(pick(o, "ExpectedOn")), n(pick(o, "OtherCost")), n(pick(o, "SubTotal")),
            Math.round(n(pick(o, "TotalItems"))), n(pick(o, "TotalQty")), n(pick(o, "TotalRecievedQty", "TotalReceivedQty")), n(pick(o, "TotalReceivedValue")), n(pick(o, "AmountPaid")),
            pick(o, "Currency") || "USD", pick(o, "Notes"), JSON.stringify(atts), pick(o, "SubmittedBy")];
          const cur = S.one(`SELECT id, imported FROM purchase_orders WHERE id=?`, id);
          if (cur && !cur.imported) { skipped++; continue; } // never overwrite a PO edited here
          S.run(`INSERT OR REPLACE INTO purchase_orders (id, vendor_id, vendor_name, status, warehouse_id, warehouse_name, invoice_number, invoice_date, created_at, submitted_at, expected_on,
                   other_cost, subtotal, total_items, total_qty, received_qty, received_value, amount_paid, currency, notes, attachments, submitted_by, imported, items_cost, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, ...vals, n(pick(o, "SubTotal")) - n(pick(o, "OtherCost")), now);
          cur ? updated++ : added++;
        } else if (kind === "po_items") {
          const po = Math.round(n(pick(o, "PurchaseOrderId", "PoId", "PO")));
          const pname = pick(o, "ProductName", "Product", "ItemName", "Product ID"), viname = pick(o, "VendorItemName", "VendorItem");
          need(S.one(`SELECT 1 x FROM purchase_orders WHERE id=?`, po), `PO ${po} not found — import the PO list first`);
          const prod = S.one(`SELECT id FROM inv_products WHERE name=?`, pname) || S.one(`SELECT product_id id FROM vendor_items WHERE vendor_item_name=?`, viname);
          const vi = prod ? S.one(`SELECT id FROM vendor_items WHERE product_id=? AND vendor_id=(SELECT vendor_id FROM purchase_orders WHERE id=?)`, prod.id, po) : null;
          S.run(`INSERT INTO po_items (po_id, product_id, vendor_item_id, name, qty, case_qty, price, discount, extra_cost, received) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            po, prod?.id || null, vi?.id || null, viname || pname, n(pick(o, "Qty", "Quantity", "QtyOrdered")), nn(pick(o, "QtyPerCase", "CaseQty")), n(pick(o, "Price", "UnitPrice")),
            n(pick(o, "Discount")), n(pick(o, "AdditionalCost", "ExtraCost")), n(pick(o, "Received", "QtyReceived", "ReceivedQty")));
          recalcPo(S, po);
          added++;
        } else throw new InvError(`Unknown import type ${kind}`);
      } catch (e: any) {
        skipped++;
        if (errors.length < 15) errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }
  });
  S.audit(user, `import.${kind}`, { added, updated, skipped });
  return { rows: rows.length, added, updated, skipped, errors };
}

// ---------- purchase orders ----------
export function recalcPo(S: Store, id: number) {
  const items = S.all(`SELECT qty, price, discount, extra_cost, received FROM po_items WHERE po_id=?`, id);
  if (!items.length) return; // imported headers keep their own totals until lines exist
  const p = S.one(`SELECT shipping_cost, other_cost, discount FROM purchase_orders WHERE id=?`, id);
  const itemsCost = items.reduce((a, x) => a + x.qty * x.price - (x.discount || 0) + (x.extra_cost || 0), 0);
  S.run(`UPDATE purchase_orders SET items_cost=?, subtotal=?, total_items=?, total_qty=?, received_qty=?, updated_at=? WHERE id=?`,
    round2(itemsCost), round2(itemsCost + (p.shipping_cost || 0) + (p.other_cost || 0) - (p.discount || 0)), items.length,
    items.reduce((a, x) => a + x.qty, 0), items.reduce((a, x) => a + (x.received || 0), 0), Date.now(), id);
}

export function getPo(S: Store, id: number) {
  const po = S.one(`SELECT * FROM purchase_orders WHERE id=?`, id);
  need(po, "Purchase order not found.");
  const items = S.all(`SELECT i.*, p.name product, p.title, p.image, vi.vendor_item_name, vi.case_qty vi_case FROM po_items i
                       LEFT JOIN inv_products p ON p.id=i.product_id LEFT JOIN vendor_items vi ON vi.id=i.vendor_item_id WHERE i.po_id=? ORDER BY i.id`, id);
  return { ...po, attachments: JSON.parse(po.attachments || "[]"), items };
}

export function savePo(S: Store, b: any, user: string) {
  const now = Date.now();
  let id = Number(b.id) || 0;
  if (!id) {
    need(b.vendorId, "Pick a vendor.");
    const v = S.one(`SELECT name FROM vendors WHERE id=?`, b.vendorId);
    need(v, "Unknown vendor.");
    id = Math.max(Number(S.one(`SELECT MAX(id) m FROM purchase_orders`).m || 0) + 1, 1000);
    const wh = Number(b.warehouseId) || defaultWh(S);
    S.run(`INSERT INTO purchase_orders (id, vendor_id, vendor_name, status, warehouse_id, warehouse_name, created_at, submitted_by, currency, imported, updated_at, notes)
           VALUES (?,?,?,'Draft',?,?,?,?,'USD',0,?,?)`, id, b.vendorId, v.name, wh, S.one(`SELECT name FROM warehouses WHERE id=?`, wh)?.name || "", now, user, now, b.notes || "");
  }
  const po = S.one(`SELECT * FROM purchase_orders WHERE id=?`, id);
  need(po, "Purchase order not found.");
  const set: string[] = [], args: any[] = [];
  const f = (col: string, v: any) => { set.push(`${col}=?`); args.push(v); };
  if (b.status !== undefined) {
    need(PO_STATUSES.includes(b.status), "Unknown status.");
    f("status", b.status);
    if (b.status !== "Draft" && !po.submitted_at) f("submitted_at", now);
  }
  for (const [k, col] of [["invoiceNumber", "invoice_number"], ["invoiceDate", "invoice_date"], ["expectedOn", "expected_on"], ["notes", "notes"]] as const) if (b[k] !== undefined) f(col, b[k] || null);
  for (const [k, col] of [["shippingCost", "shipping_cost"], ["otherCost", "other_cost"], ["discount", "discount"], ["amountPaid", "amount_paid"]] as const) if (b[k] !== undefined) f(col, n(b[k]));
  if (b.warehouseId !== undefined) { f("warehouse_id", Number(b.warehouseId)); f("warehouse_name", S.one(`SELECT name FROM warehouses WHERE id=?`, Number(b.warehouseId))?.name || ""); }
  if (set.length) S.run(`UPDATE purchase_orders SET ${set.join(",")}, imported=0, updated_at=? WHERE id=?`, ...args, now, id);
  if (Array.isArray(b.items)) {
    // replace lines, keeping what was already received on existing lines
    const old = new Map(S.all(`SELECT id, received FROM po_items WHERE po_id=?`, id).map((x) => [x.id, x.received]));
    const keep = new Set<number>();
    for (const it of b.items) {
      need(n(it.qty) >= 0, "Quantities can't be negative.");
      if (it.id && old.has(Number(it.id))) {
        keep.add(Number(it.id));
        need(n(it.qty) >= (old.get(Number(it.id)) || 0), "A line's quantity can't be less than what was already received.");
        S.run(`UPDATE po_items SET product_id=?, vendor_item_id=?, name=?, qty=?, case_qty=?, price=?, discount=?, extra_cost=? WHERE id=?`,
          it.productId || null, it.vendorItemId || null, it.name || "", n(it.qty), nn(it.caseQty), n(it.price), n(it.discount), n(it.extraCost), Number(it.id));
      } else {
        S.run(`INSERT INTO po_items (po_id, product_id, vendor_item_id, name, qty, case_qty, price, discount, extra_cost, received) VALUES (?,?,?,?,?,?,?,?,?,0)`,
          id, it.productId || null, it.vendorItemId || null, it.name || "", n(it.qty), nn(it.caseQty), n(it.price), n(it.discount), n(it.extraCost));
      }
    }
    for (const [oid, rec] of old) if (!keep.has(oid)) { need(!rec, "A line that has received units can't be removed."); S.run(`DELETE FROM po_items WHERE id=?`, oid); }
  }
  recalcPo(S, id);
  return getPo(S, id);
}

/** Receive units into the PO's (or chosen) warehouse at landed cost: line price/discount/extra + PO shipping & other − discount, spread by line value. */
export function receivePo(S: Store, id: number, b: any, user: string) {
  const po = getPo(S, id);
  need(po.items.length, "This purchase order has no line items yet — add them (or import the PO items) first.");
  need(!["Closed", "Deleted"].includes(po.status), `This PO is ${po.status}.`);
  const wh = Number(b.warehouseId) || po.warehouse_id || defaultWh(S);
  const lines: { itemId: number; qty: number }[] = b.all
    ? po.items.map((i: any) => ({ itemId: i.id, qty: i.qty - (i.received || 0) })).filter((x: any) => x.qty > 0)
    : (b.lines || []).map((x: any) => ({ itemId: Number(x.itemId), qty: n(x.qty) })).filter((x: any) => x.qty);
  need(lines.length, "Nothing to receive.");
  // header costs are shared by line value; when every line is priced $0 they are shared by units instead
  const totVal = po.items.reduce((a: number, i: any) => a + i.qty * i.price, 0);
  const totQty = po.items.reduce((a: number, i: any) => a + i.qty, 0) || 1;
  const share = (i: any) => totVal > 0 ? i.qty * i.price / totVal : i.qty / totQty;
  const headerExtra = (po.shipping_cost || 0) + (po.other_cost || 0) - (po.discount || 0);
  let units = 0, value = 0;
  S.ctx.storage.transactionSync(() => {
    for (const l of lines) {
      const it = po.items.find((i: any) => i.id === l.itemId);
      need(it, "Unknown PO line.");
      need(it.product_id, `"${it.name}" isn't linked to a product — edit the line first.`);
      need((it.received || 0) + l.qty <= it.qty + 1e-9 || b.allowOver, `${it.product || it.name}: receiving ${l.qty} would exceed the ${it.qty} ordered.`);
      const unit = it.qty ? (it.price + ((it.extra_cost || 0) - (it.discount || 0)) / it.qty + headerExtra * share(it) / it.qty) : it.price;
      move(S, { productId: it.product_id, warehouseId: wh, qty: l.qty, unitCost: r4(unit), type: l.qty > 0 ? "receive" : "unreceive", ref: `PO ${id}`, note: it.name, user });
      S.run(`UPDATE po_items SET received=received+? WHERE id=?`, l.qty, it.id);
      units += l.qty; value += l.qty * unit;
    }
    recalcPo(S, id);
    const left = S.one(`SELECT COALESCE(SUM(qty - received),0) q FROM po_items WHERE po_id=?`, id).q;
    S.run(`UPDATE purchase_orders SET status=?, received_value=COALESCE(received_value,0)+?, received_at=CASE WHEN ? THEN ? ELSE received_at END, updated_at=? WHERE id=?`,
      left <= 0 && b.closeWhenDone !== false ? "Closed" : "Receiving", round2(value), left <= 0 ? 1 : 0, Date.now(), Date.now(), id);
  });
  S.audit(user, "po.receive", { id, units, value: round2(value) });
  return getPo(S, id);
}

/** Draft POs from forecast lines, one per vendor. */
export function posFromForecast(S: Store, lines: { productId: number; qty: number; vendorItemId?: number }[], user: string) {
  const byVendor = new Map<number, any[]>();
  for (const l of lines) {
    if (!(n(l.qty) > 0)) continue;
    const vi = l.vendorItemId ? S.one(`SELECT * FROM vendor_items WHERE id=?`, l.vendorItemId)
      : S.one(`SELECT * FROM vendor_items WHERE product_id=? AND active=1 ORDER BY is_primary DESC, price ASC LIMIT 1`, l.productId);
    need(vi, `No vendor item for product ${S.one(`SELECT name FROM inv_products WHERE id=?`, l.productId)?.name || l.productId} — add one under Vendor items.`);
    if (!byVendor.has(vi.vendor_id)) byVendor.set(vi.vendor_id, []);
    byVendor.get(vi.vendor_id)!.push({ productId: vi.product_id, vendorItemId: vi.id, name: vi.vendor_item_name, qty: n(l.qty), caseQty: vi.case_qty, price: vi.price || vi.avg_price || S.one(`SELECT avg_cost FROM inv_products WHERE id=?`, vi.product_id)?.avg_cost || 0 });
  }
  const ids: number[] = [];
  for (const [vendorId, items] of byVendor) ids.push(savePo(S, { vendorId, items }, user).id);
  return ids;
}

// ---------- shipment deduction ----------
/** Lines of a shipment (our plan or an Amazon shipment) → product quantities via mappings. */
export function deductionPreview(S: Store, ref: string, skuLines: { sku: string; qty: number }[], warehouseId: number) {
  const unmapped: string[] = [], perProduct = new Map<number, number>();
  for (const l of skuLines) {
    const maps = S.all(`SELECT product_id, qty FROM inv_mappings WHERE sku=?`, l.sku);
    if (!maps.length) { unmapped.push(l.sku); continue; }
    for (const m of maps) perProduct.set(m.product_id, (perProduct.get(m.product_id) || 0) + l.qty * m.qty);
  }
  const lines = [...perProduct].map(([pid, qty]) => {
    const p = S.one(`SELECT name, avg_cost FROM inv_products WHERE id=?`, pid);
    const have = S.one(`SELECT COALESCE(qty,0) q FROM stock WHERE product_id=? AND warehouse_id=?`, pid, warehouseId)?.q || 0;
    return { productId: pid, product: p?.name, qty, have, after: have - qty, unitCost: p?.avg_cost || 0, value: round2(qty * (p?.avg_cost || 0)) };
  });
  return { ref, warehouseId, unmapped, lines, negative: lines.filter((l) => l.after < 0), already: !!S.one(`SELECT 1 x FROM ship_deductions WHERE ref=?`, ref) };
}

export function deduct(S: Store, ref: string, skuLines: { sku: string; qty: number }[], warehouseId: number, user: string, allowNegative: boolean) {
  const pv = deductionPreview(S, ref, skuLines, warehouseId);
  need(!pv.already, "This shipment was already deducted.");
  need(!pv.unmapped.length, `Map these SKUs to products first: ${pv.unmapped.join(", ")}`);
  need(allowNegative || !pv.negative.length, `Not enough stock for: ${pv.negative.map((x) => `${x.product} (have ${x.have}, need ${x.qty})`).join("; ")}`);
  S.ctx.storage.transactionSync(() => {
    for (const l of pv.lines) move(S, { productId: l.productId, warehouseId, qty: -l.qty, type: "deduct", ref, note: "Shipment deduction", user });
    S.run(`INSERT INTO ship_deductions (ref, warehouse_id, at, user, units, value, lines) VALUES (?,?,?,?,?,?,?)`, ref, warehouseId, Date.now(), user,
      pv.lines.reduce((a, x) => a + x.qty, 0), round2(pv.lines.reduce((a, x) => a + x.value, 0)), JSON.stringify(pv.lines));
  });
  return pv;
}

export function undoDeduct(S: Store, ref: string, user: string) {
  const d = S.one(`SELECT * FROM ship_deductions WHERE ref=?`, ref);
  need(d, "Nothing to undo.");
  S.ctx.storage.transactionSync(() => {
    for (const l of JSON.parse(d.lines || "[]")) move(S, { productId: l.productId, warehouseId: d.warehouse_id, qty: l.qty, unitCost: l.unitCost, type: "undeduct", ref, note: "Deduction undone", user });
    S.run(`DELETE FROM ship_deductions WHERE ref=?`, ref);
  });
}
