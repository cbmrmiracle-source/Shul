// HTTP routes for Inventory (/api/inv/*) and Purchasing (/api/purch/*), plus shipment deduction (/api/ship/deduct*).
import type { Store } from "./store";
import {
  InvError, PO_STATUSES, deduct, deductionPreview, ensureWarehouses, getPo, importCsv, move, posFromForecast, productStats,
  receivePo, recalcPo, savePo, skuCosts, undoDeduct,
} from "./inventory";
import { randomToken } from "./util";

const need = (c: any, m: string) => { if (!c) throw new InvError(m); };
const num = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Shipment lines + deduction reference for a plan id or an FBA shipment id. */
function shipmentLines(S: Store, b: any) {
  if (b.planId) {
    const lines = S.all(`SELECT sku, qty FROM ship_items WHERE plan_id=?`, Number(b.planId));
    need(lines.length, "This shipment has no products.");
    return { ref: `PLAN-${Number(b.planId)}`, lines };
  }
  const row = S.one(`SELECT shipment_id, plan_id, items_json FROM fba_shipments WHERE shipment_id=?`, String(b.fbaId || ""));
  need(row, "Shipment not found.");
  if (row.plan_id) return shipmentLines(S, { planId: row.plan_id });
  const lines = JSON.parse(row.items_json || "[]").map((x: any) => ({ sku: x.sku, qty: x.shipped })).filter((x: any) => x.qty > 0);
  need(lines.length, "This shipment's SKU lines haven't loaded yet.");
  return { ref: row.shipment_id, lines };
}

export async function invRoutes(S: Store, request: Request, path: string, method: string, q: URLSearchParams, body: () => Promise<any>, who: string): Promise<any> {
  if (!path.startsWith("/api/inv/") && !path.startsWith("/api/purch/") && !path.startsWith("/api/ship/deduct")) return undefined;
  ensureWarehouses(S);

  // ----- products -----
  if (path === "/api/inv/products" && method === "GET") {
    return { products: productStats(S), warehouses: S.all(`SELECT * FROM warehouses WHERE active=1 ORDER BY id`) };
  }
  if (path === "/api/inv/products" && method === "POST") {
    const b = await body();
    const name = String(b.name || "").trim();
    need(name, "Give the product a name.");
    if (b.id) {
      need(!S.one(`SELECT 1 x FROM inv_products WHERE name=? AND id<>?`, name, b.id), "Another product already has that name.");
      S.run(`UPDATE inv_products SET name=?, title=?, image=?, upc=?, avg_cost=?, notes=?, tags=?, active=?, updated_at=? WHERE id=?`,
        name, b.title || name, b.image || null, b.upc || null, num(b.avgCost), b.notes || null, b.tags || null, b.active === false ? 0 : 1, Date.now(), b.id);
      return { ok: true, id: b.id };
    }
    need(!S.one(`SELECT 1 x FROM inv_products WHERE name=?`, name), "A product with that name already exists.");
    S.run(`INSERT INTO inv_products (name, title, image, upc, avg_cost, notes, tags, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`,
      name, b.title || name, b.image || null, b.upc || null, num(b.avgCost), b.notes || null, b.tags || null, Date.now(), Date.now());
    return { ok: true, id: S.one(`SELECT id FROM inv_products WHERE name=?`, name).id };
  }
  const pm = path.match(/^\/api\/inv\/products\/(\d+)$/);
  if (pm && method === "GET") {
    const id = Number(pm[1]);
    const [p] = productStats(S, id);
    need(p, "Product not found.");
    return {
      product: p,
      mappings: S.all(`SELECT m.sku, m.qty, s.asin, s.title, s.status, s.image, i.total fba FROM inv_mappings m LEFT JOIN products s ON s.sku=m.sku LEFT JOIN inventory i ON i.sku=m.sku WHERE m.product_id=? ORDER BY m.qty`, id),
      vendorItems: S.all(`SELECT vi.*, v.name vendor, v.lead_days, v.purchase_days FROM vendor_items vi LEFT JOIN vendors v ON v.id=vi.vendor_id WHERE vi.product_id=? ORDER BY vi.is_primary DESC, vi.price`, id),
      stock: S.all(`SELECT w.id, w.name, COALESCE(s.qty,0) qty FROM warehouses w LEFT JOIN stock s ON s.warehouse_id=w.id AND s.product_id=? WHERE w.active=1 ORDER BY w.id`, id),
      moves: S.all(`SELECT m.*, w.name warehouse FROM stock_moves m LEFT JOIN warehouses w ON w.id=m.warehouse_id WHERE m.product_id=? ORDER BY m.id DESC LIMIT 300`, id),
      openPos: S.all(`SELECT p.id, p.vendor_name, p.status, p.expected_on, i.qty, i.received, i.price FROM po_items i JOIN purchase_orders p ON p.id=i.po_id WHERE i.product_id=? AND p.status IN ('Draft','Working','Inbound','Receiving') ORDER BY p.id DESC`, id),
    };
  }
  if (pm && method === "DELETE") {
    const id = Number(pm[1]);
    need(!S.one(`SELECT 1 x FROM stock WHERE product_id=? AND qty<>0`, id), "This product still has stock — adjust it to 0 first.");
    S.run(`UPDATE inv_products SET active=0, updated_at=? WHERE id=?`, Date.now(), id);
    S.run(`DELETE FROM inv_mappings WHERE product_id=?`, id);
    return { ok: true };
  }

  // ----- SKUs & mappings -----
  if (path === "/api/inv/skus" && method === "GET") {
    const maps = new Map<string, any[]>();
    for (const m of S.all(`SELECT m.sku, m.qty, p.id, p.name FROM inv_mappings m JOIN inv_products p ON p.id=m.product_id`)) {
      if (!maps.has(m.sku)) maps.set(m.sku, []); maps.get(m.sku)!.push({ productId: m.id, name: m.name, qty: m.qty });
    }
    const costs = skuCosts(S);
    return S.all(`SELECT s.sku, s.asin, s.fnsku, s.title, s.image, s.status, s.fulfillment, s.price, s.cogs, COALESCE(s.is_mrm, s.mrm_auto, 0) mrm,
        i.fulfillable, i.total fba, i.inbound_shipped + i.inbound_receiving inbound FROM products s LEFT JOIN inventory i ON i.sku=s.sku ORDER BY s.sku`)
      .map((s) => ({ ...s, mapped: maps.get(s.sku) || [], mappedCost: costs.get(s.sku) ?? null }));
  }
  if (path === "/api/inv/mappings" && method === "GET") {
    return S.all(`SELECT m.sku, m.qty, p.name product, p.id product_id FROM inv_mappings m JOIN inv_products p ON p.id=m.product_id ORDER BY m.sku, p.name`);
  }
  if (path === "/api/inv/mappings" && method === "PUT") {
    const b = await body();
    need(b.sku, "Pick a SKU.");
    const lines = (b.lines || []).filter((l: any) => l.productId && num(l.qty) > 0);
    S.ctx.storage.transactionSync(() => {
      S.run(`DELETE FROM inv_mappings WHERE sku=?`, b.sku);
      for (const l of lines) S.run(`INSERT OR REPLACE INTO inv_mappings (sku, product_id, qty) VALUES (?,?,?)`, b.sku, Number(l.productId), num(l.qty));
    });
    S.audit(who, "mapping.save", { sku: b.sku, lines });
    return { ok: true };
  }

  // ----- vendors & vendor items -----
  if (path === "/api/inv/vendors" && method === "GET") {
    return S.all(`SELECT v.*, (SELECT COUNT(*) FROM vendor_items WHERE vendor_id=v.id AND active=1) items,
        (SELECT COUNT(*) FROM purchase_orders WHERE vendor_id=v.id AND status NOT IN ('Deleted')) pos,
        (SELECT COALESCE(SUM(subtotal),0) FROM purchase_orders WHERE vendor_id=v.id AND status NOT IN ('Deleted','Draft')) spend
      FROM vendors v ORDER BY v.active DESC, v.name`);
  }
  if (path === "/api/inv/vendors" && method === "POST") {
    const b = await body();
    const name = String(b.name || "").trim();
    need(name, "Give the vendor a name.");
    const cols = ["address1", "address2", "city", "state", "postal", "country", "phone", "email", "terms", "currency"];
    const ncols = ["lead_days", "purchase_days", "safety_stock", "order_min"];
    if (b.id) {
      S.run(`UPDATE vendors SET name=?, ${cols.map((c) => `${c}=?`).join(",")}, ${ncols.map((c) => `${c}=?`).join(",")}, active=? WHERE id=?`,
        name, ...cols.map((c) => b[c] || null), ...ncols.map((c) => b[c] === "" || b[c] == null ? null : num(b[c])), b.active === false ? 0 : 1, b.id);
    } else {
      need(!S.one(`SELECT 1 x FROM vendors WHERE name=?`, name), "A vendor with that name already exists.");
      S.run(`INSERT INTO vendors (name, ${cols.join(",")}, ${ncols.join(",")}, active, created_at) VALUES (?,${cols.map(() => "?").join(",")},${ncols.map(() => "?").join(",")},1,?)`,
        name, ...cols.map((c) => b[c] || null), ...ncols.map((c) => b[c] === "" || b[c] == null ? null : num(b[c])), Date.now());
    }
    return { ok: true };
  }
  if (path === "/api/inv/vendor-items" && method === "GET") {
    return S.all(`SELECT vi.*, p.name product, p.title, p.image, v.name vendor, v.lead_days, v.purchase_days FROM vendor_items vi
                  LEFT JOIN inv_products p ON p.id=vi.product_id LEFT JOIN vendors v ON v.id=vi.vendor_id ORDER BY vi.active DESC, p.name, vi.price`);
  }
  if (path === "/api/inv/vendor-items" && method === "POST") {
    const b = await body();
    need(b.productId && b.vendorId, "Pick a product and a vendor.");
    const vals = [Number(b.productId), Number(b.vendorId), b.vendorItemName || "", b.model || null, num(b.price), b.caseQty === "" ? null : num(b.caseQty), b.moq === "" ? null : num(b.moq),
      b.rounding || "up", b.outOfStock ? 1 : 0, b.isPrimary ? 1 : 0, b.upc || null, b.notes || null, b.active === false ? 0 : 1];
    if (b.isPrimary) S.run(`UPDATE vendor_items SET is_primary=0 WHERE product_id=?`, Number(b.productId));
    if (b.id) S.run(`UPDATE vendor_items SET product_id=?, vendor_id=?, vendor_item_name=?, model=?, price=?, case_qty=?, moq=?, rounding=?, out_of_stock=?, is_primary=?, upc=?, notes=?, active=? WHERE id=?`, ...vals, b.id);
    else S.run(`INSERT INTO vendor_items (product_id, vendor_id, vendor_item_name, model, price, case_qty, moq, rounding, out_of_stock, is_primary, upc, notes, active, avg_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, num(b.price));
    return { ok: true };
  }

  // ----- warehouses, stock -----
  if (path === "/api/inv/warehouses" && method === "GET") {
    return S.all(`SELECT w.*, (SELECT COALESCE(SUM(s.qty),0) FROM stock s WHERE s.warehouse_id=w.id) units,
        (SELECT COALESCE(SUM(s.qty * p.avg_cost),0) FROM stock s JOIN inv_products p ON p.id=s.product_id WHERE s.warehouse_id=w.id) value FROM warehouses w ORDER BY w.id`);
  }
  if (path === "/api/inv/warehouses" && method === "POST") {
    const b = await body();
    need(String(b.name || "").trim(), "Give the warehouse a name.");
    if (b.isDefault) S.run(`UPDATE warehouses SET is_default=0`);
    if (b.isDeduct) S.run(`UPDATE warehouses SET is_deduct=0`);
    if (b.id) S.run(`UPDATE warehouses SET name=?, address=?, is_default=?, is_deduct=?, active=? WHERE id=?`, b.name.trim(), b.address || "", b.isDefault ? 1 : 0, b.isDeduct ? 1 : 0, b.active === false ? 0 : 1, b.id);
    else S.run(`INSERT INTO warehouses (name, address, is_default, is_deduct, active) VALUES (?,?,?,?,1)`, b.name.trim(), b.address || "", b.isDefault ? 1 : 0, b.isDeduct ? 1 : 0);
    return { ok: true };
  }
  if (path === "/api/inv/adjust" && method === "POST") {
    const b = await body();
    const pid = Number(b.productId), wh = Number(b.warehouseId);
    let qty = num(b.qty);
    if (b.mode === "set") qty = num(b.qty) - (S.one(`SELECT qty FROM stock WHERE product_id=? AND warehouse_id=?`, pid, wh)?.qty || 0);
    need(qty, "Nothing to change.");
    move(S, { productId: pid, warehouseId: wh, qty, unitCost: b.unitCost === "" || b.unitCost == null ? null : num(b.unitCost), type: "adjust", note: b.note || "", user: who });
    return { ok: true };
  }
  if (path === "/api/inv/transfer" && method === "POST") {
    const b = await body();
    const qty = num(b.qty);
    need(qty > 0, "Enter a quantity.");
    need(Number(b.from) !== Number(b.to), "Pick two different warehouses.");
    S.ctx.storage.transactionSync(() => {
      move(S, { productId: Number(b.productId), warehouseId: Number(b.from), qty: -qty, type: "transfer", note: b.note || "", ref: "transfer", user: who });
      move(S, { productId: Number(b.productId), warehouseId: Number(b.to), qty, type: "transfer", note: b.note || "", ref: "transfer", user: who });
    });
    return { ok: true };
  }
  if (path === "/api/inv/moves" && method === "GET") {
    const w: string[] = [], a: any[] = [];
    if (q.get("product")) { w.push("m.product_id=?"); a.push(Number(q.get("product"))); }
    if (q.get("type")) { w.push("m.type=?"); a.push(q.get("type")); }
    if (q.get("from")) { w.push("m.ts>=?"); a.push(Date.parse(q.get("from")!)); }
    if (q.get("to")) { w.push("m.ts<?"); a.push(Date.parse(q.get("to")!) + 86_400_000); }
    return S.all(`SELECT m.*, p.name product, w.name warehouse FROM stock_moves m LEFT JOIN inv_products p ON p.id=m.product_id LEFT JOIN warehouses w ON w.id=m.warehouse_id
                  ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY m.id DESC LIMIT 2000`, ...a);
  }
  const im = path.match(/^\/api\/inv\/import\/([a-z_]+)$/);
  if (im && method === "POST") { const b = await body(); return importCsv(S, im[1], b.csv || "", who); }

  // ----- purchasing -----
  if (path === "/api/purch/forecast" && method === "GET") return productStats(S).filter((p) => p.active);
  if (path === "/api/purch/from-forecast" && method === "POST") { const b = await body(); return { ok: true, ids: posFromForecast(S, b.lines || [], who) }; }
  if (path === "/api/purch/pos" && method === "GET") {
    return { statuses: PO_STATUSES, pos: S.all(`SELECT p.*, (SELECT COUNT(*) FROM po_items WHERE po_id=p.id) lines FROM purchase_orders p ORDER BY p.id DESC`) };
  }
  if (path === "/api/purch/pos" && method === "POST") { const b = await body(); return savePo(S, b, who); }
  const po = path.match(/^\/api\/purch\/pos\/(\d+)(?:\/([a-z]+))?$/);
  if (po) {
    const id = Number(po[1]), sub = po[2];
    if (!sub && method === "GET") return { ...getPo(S, id), warehouses: S.all(`SELECT id, name FROM warehouses WHERE active=1`),
      vendorItems: S.all(`SELECT vi.id, vi.product_id, vi.vendor_item_name, COALESCE(NULLIF(vi.price,0), NULLIF(vi.avg_price,0), p.avg_cost, 0) price, vi.case_qty, p.name product FROM vendor_items vi JOIN inv_products p ON p.id=vi.product_id
                          WHERE vi.vendor_id=(SELECT vendor_id FROM purchase_orders WHERE id=?) AND vi.active=1 ORDER BY p.name`, id) };
    if (!sub && method === "PUT") { const b = await body(); return savePo(S, { ...b, id }, who); }
    if (sub === "receive" && method === "POST") { const b = await body(); return receivePo(S, id, b, who); }
    if (sub === "attach" && method === "POST") {
      const fd = await request.formData();
      const f: any = fd.get("file");
      need(f && typeof f !== "string", "No file.");
      need(f.size <= 15 * 1024 * 1024, "Files must be under 15 MB.");
      const key = `${randomToken(12)}.${(String(f.name).split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)}`;
      await S.env.IMAGES.put(key, await f.arrayBuffer(), { metadata: { type: f.type || "application/octet-stream", name: f.name } });
      const p = getPo(S, id);
      p.attachments.push({ name: f.name, url: `/api/purch/file/${key}`, at: Date.now(), by: who });
      S.run(`UPDATE purchase_orders SET attachments=?, updated_at=? WHERE id=?`, JSON.stringify(p.attachments), Date.now(), id);
      return getPo(S, id);
    }
    if (sub === "recalc" && method === "POST") { recalcPo(S, id); return getPo(S, id); }
  }
  const fileM = path.match(/^\/api\/purch\/file\/([a-f0-9]{24}\.[a-z0-9]{1,5})$/);
  if (fileM && method === "GET") {
    const obj = await S.env.IMAGES.getWithMetadata(fileM[1], "arrayBuffer");
    need(obj.value, "File not found.");
    return new Response(obj.value, { headers: { "content-type": (obj.metadata as any)?.type || "application/octet-stream", "content-disposition": `inline; filename="${String((obj.metadata as any)?.name || "file").replace(/"/g, "")}"` } });
  }

  // ----- shipment deduction -----
  if (path === "/api/ship/deduct/preview" && method === "POST") {
    const b = await body();
    const { ref, lines } = shipmentLines(S, b);
    const wh = Number(b.warehouseId) || S.one(`SELECT id FROM warehouses WHERE is_deduct=1 LIMIT 1`)?.id || S.one(`SELECT id FROM warehouses ORDER BY id LIMIT 1`).id;
    return { ...deductionPreview(S, ref, lines, wh), warehouses: S.all(`SELECT id, name, is_deduct FROM warehouses WHERE active=1`), record: S.one(`SELECT * FROM ship_deductions WHERE ref=?`, ref) || null };
  }
  if (path === "/api/ship/deduct" && method === "POST") {
    const b = await body();
    const { ref, lines } = shipmentLines(S, b);
    const r = deduct(S, ref, lines, Number(b.warehouseId), who, !!b.allowNegative);
    S.audit(who, "ship.deduct", { ref, units: r.lines.reduce((a: number, x: any) => a + x.qty, 0) });
    return { ok: true, ...r };
  }
  if (path === "/api/ship/deduct/undo" && method === "POST") {
    const b = await body();
    const { ref } = shipmentLines(S, b);
    undoDeduct(S, ref, who);
    S.audit(who, "ship.undeduct", ref);
    return { ok: true };
  }
  return undefined;
}
