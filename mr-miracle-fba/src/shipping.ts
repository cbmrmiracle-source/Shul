// FBA inbound shipments (Send to Amazon, Fulfillment Inbound API v2024-03-20), "plan, then pack" order:
//
//   draft (paste SKU<tab>qty / send from Inventory)
//   → create        createInboundPlan + packing option (auto)
//   → targeting     keep regenerating placement options on a schedule until the target warehouse (default HEA2) is offered
//   → found         a matching option exists; owner reviews the fee and confirms (never automatic)
//   → boxes         box contents per shipment (identical boxes, remembered per SKU), box labels
//   → freight       Amazon Freight pallets (LTL/FTL) or small parcel; quote → owner confirms
//   → confirmed     labels (box, pallet, FNSKU)
import type { Store } from "./store";
import { sleep } from "./util";
import { emailLayout, sendMail } from "./email";

const BASE = "/inbound/fba/2024-03-20";

export class ShipError extends Error {}

export const DEFAULT_TARGET = { warehouses: ["HEA2"] as string[], warehouse: "HEA2", match: "all" as "all" | "partial", everyHours: 2, maxFee: null as number | null };

/** Normalises a target (older plans stored a single `warehouse`). */
export function normTarget(t: any) {
  const list: string[] = (Array.isArray(t?.warehouses) && t.warehouses.length ? t.warehouses : [t?.warehouse || "HEA2"])
    .map((x: string) => String(x).toUpperCase().trim()).filter(Boolean);
  return { ...DEFAULT_TARGET, ...t, warehouses: [...new Set(list)], warehouse: list.join(", ") };
}

// ---------- helpers ----------

async function waitOp(S: Store, operationId: string, label: string, maxMs = 120_000) {
  const t0 = Date.now();
  let delay = 1200;
  for (;;) {
    await sleep(delay);
    const b = await S.amz.ok("GET", `${BASE}/operations/${operationId}`);
    if (b.operationStatus === "SUCCESS") return b;
    if (b.operationStatus === "FAILED") {
      const probs = (b.operationProblems || []).map((p: any) => `${p.code ? p.code + ": " : ""}${p.message}`).join("\n");
      throw new ShipError(`${label} failed at Amazon:\n${probs || "no details given"}`);
    }
    if (Date.now() - t0 > maxMs) throw new ShipError(`${label} is still running at Amazon — try again in a minute.`);
    delay = Math.min(delay + 800, 4000);
  }
}

async function call(S: Store, method: string, path: string, query?: any, body?: any) {
  const r = await S.amz.req(method, path, query, body);
  if (r.status >= 300) {
    const msg = r.body?.errors?.map((e: any) => e.message || e.code).join("; ") || JSON.stringify(r.body).slice(0, 400);
    throw new ShipError(`Amazon ${r.status}: ${msg}`);
  }
  return r.body;
}

async function listAll(S: Store, path: string, key: string, query: any = {}) {
  const out: any[] = [];
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const b = await call(S, "GET", path, { pageSize: 100, ...query, ...(token ? { paginationToken: token } : {}) });
    out.push(...(b[key] || []));
    token = b.pagination?.nextToken;
    if (!token) break;
  }
  return out;
}

async function pdfResponse(url: string, name: string) {
  const r = await fetch(url);
  if (!r.ok) throw new ShipError(`Couldn't download the label file from Amazon (HTTP ${r.status}).`);
  return new Response(r.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"` } });
}

const sum = (a: any[], f: (x: any) => number) => a.reduce((s, x) => s + (f(x) || 0), 0);
export const optionFee = (o: any) => sum(o.fees || [], (f) => f.value?.amount) - sum(o.discounts || [], (f) => f.value?.amount);

// ---------- plan storage ----------

export function getPlan(S: Store, id: number) {
  const p = S.one(`SELECT * FROM ship_plans WHERE id=?`, id);
  if (!p) throw new ShipError("Shipment plan not found.");
  const items = S.all(`SELECT i.*, p.title, p.image, p.fnsku AS cur_fnsku, p.asin AS cur_asin, inv.fulfillable,
                         b.units_per_box, b.length, b.width, b.height, b.weight
                       FROM ship_items i LEFT JOIN products p ON p.sku=i.sku LEFT JOIN inventory inv ON inv.sku=i.sku
                       LEFT JOIN box_specs b ON b.sku=i.sku WHERE i.plan_id=? ORDER BY i.sku`, id);
  const data = JSON.parse(p.data || "{}");
  data.target = normTarget(data.target || {});
  return { ...p, data, address: JSON.parse(p.address || "null"), items };
}

function saveData(S: Store, id: number, data: any, status?: string) {
  S.run(`UPDATE ship_plans SET data=?, updated_at=?${status ? ", status=?" : ""} WHERE id=?`,
    JSON.stringify(data), Date.now(), ...(status ? [status] : []), id);
}

/** Resolves pasted identifiers (SKU, ASIN or FNSKU) to SKUs. */
export function parseLines(S: Store, text: string) {
  const ok: { sku: string; qty: number; line: string }[] = [];
  const bad: { line: string; reason: string }[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\t,;]+\s*(-?\d+)\s*$/) || line.match(/^(.*\S)\s+(-?\d+)$/);
    if (!m) { bad.push({ line, reason: "needs a quantity at the end" }); continue; }
    const id = m[1].trim(), qty = Number(m[2]);
    if (!(qty > 0)) { bad.push({ line, reason: "quantity must be more than 0" }); continue; }
    let rows = S.all(`SELECT sku FROM products WHERE sku=?`, id);
    if (!rows.length) rows = S.all(`SELECT sku FROM products WHERE lower(sku)=lower(?)`, id);
    if (!rows.length) rows = S.all(`SELECT sku FROM products WHERE fnsku=? OR asin=? ORDER BY (fulfillment='FBA') DESC`, id, id.toUpperCase());
    if (!rows.length) { bad.push({ line, reason: "unknown SKU / ASIN / FNSKU" }); continue; }
    if (rows.length > 1 && !S.one(`SELECT 1 x FROM products WHERE sku=?`, id)) { bad.push({ line, reason: `matches ${rows.length} SKUs — use the exact SKU` }); continue; }
    ok.push({ sku: rows[0].sku, qty, line });
  }
  // merge duplicates
  const merged = new Map<string, number>();
  for (const x of ok) merged.set(x.sku, (merged.get(x.sku) || 0) + x.qty);
  return { items: [...merged].map(([sku, qty]) => ({ sku, qty })), bad };
}

export function createDraft(S: Store, name: string, items: { sku: string; qty: number }[], user: string) {
  const clean = items.filter((i) => i.sku && Number(i.qty) > 0);
  if (!clean.length) throw new ShipError("Add at least one product with a quantity.");
  S.run(`INSERT INTO ship_plans (name, status, data, created_by, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?)`,
    name || `Shipment ${new Date().toISOString().slice(0, 10)}`, JSON.stringify({ target: { ...DEFAULT_TARGET, ...S.setting("ship_target", {}) } }), user, Date.now(), Date.now());
  const id = S.one(`SELECT MAX(id) id FROM ship_plans`).id;
  setItems(S, id, clean);
  return id;
}

export function setItems(S: Store, id: number, items: { sku: string; qty: number }[]) {
  const p = S.one(`SELECT status FROM ship_plans WHERE id=?`, id);
  if (!p) throw new ShipError("Plan not found.");
  if (p.status !== "draft") throw new ShipError("Products can only be changed before the plan is sent to Amazon.");
  S.run(`DELETE FROM ship_items WHERE plan_id=?`, id);
  for (const it of items) {
    if (!(Number(it.qty) > 0)) continue;
    const pr = S.one(`SELECT asin, fnsku FROM products WHERE sku=?`, it.sku);
    if (!pr) throw new ShipError(`Unknown SKU ${it.sku}`);
    S.run(`INSERT OR REPLACE INTO ship_items (plan_id, sku, asin, fnsku, qty) VALUES (?,?,?,?,?)`, id, it.sku, pr.asin, pr.fnsku, Math.round(Number(it.qty)));
  }
  S.run(`UPDATE ship_plans SET updated_at=? WHERE id=?`, Date.now(), id);
}

export async function defaultAddress(S: Store) {
  const saved = S.setting<any>("ship_from", null);
  if (saved) return saved;
  try {
    const b = await call(S, "GET", `${BASE}/inboundPlans`, { pageSize: 1, sortBy: "LAST_UPDATED_TIME", sortOrder: "DESC" });
    const a = b.inboundPlans?.[0]?.sourceAddress;
    if (a) return { name: a.name || "", companyName: a.companyName || "", addressLine1: a.addressLine1 || "", addressLine2: a.addressLine2 || "",
      city: a.city || "", stateOrProvinceCode: a.stateOrProvinceCode || "", postalCode: a.postalCode || "", countryCode: a.countryCode || "US",
      phoneNumber: a.phoneNumber || "", email: a.email || "" };
  } catch { /* not connected */ }
  return null;
}

// ---------- labels ----------

export async function unitLabels(S: Store, list: { sku: string; qty: number }[], kind: string) {
  const mskuQuantities = list.filter((x) => x.qty > 0).map((x) => ({ msku: x.sku, quantity: Math.round(x.qty) }));
  if (!mskuQuantities.length) throw new ShipError("Nothing to print.");
  const body: any = { marketplaceId: S.amz.marketplaceId, mskuQuantities, localeCode: "en_US" };
  if (kind === "thermal") Object.assign(body, { labelType: "THERMAL_PRINTING", width: 57, height: 32 });
  else Object.assign(body, { labelType: "STANDARD_FORMAT", pageType: "Letter_30" });
  const b = await call(S, "POST", `${BASE}/items/labels`, null, body);
  const url = b.documentDownloads?.[0]?.uri;
  if (!url) throw new ShipError("Amazon didn't return a label file.");
  return pdfResponse(url, "unit-labels.pdf");
}

export async function shipmentLabels(S: Store, plan: any, shipmentId: string, kind: string) {
  const sh = await call(S, "GET", `${BASE}/inboundPlans/${plan.inbound_plan_id}/shipments/${shipmentId}`);
  const confirmationId = sh.shipmentConfirmationId;
  if (!confirmationId) throw new ShipError("This shipment has no Amazon shipment ID yet.");
  let q: any;
  if (kind === "pallet") {
    const s = (plan.data.shipments || []).find((x: any) => x.shipmentId === shipmentId);
    const pallets = s?.freight?.pallets || 0;
    if (!pallets) throw new ShipError("Enter the pallets in the freight step first.");
    q = { PageType: "PackageLabel_Letter_4", LabelType: "PALLET", NumberOfPallets: pallets };
  } else {
    const boxes = await listAll(S, `${BASE}/inboundPlans/${plan.inbound_plan_id}/shipments/${shipmentId}/boxes`, "boxes");
    const ids = boxes.map((b) => b.boxId).filter(Boolean);
    if (!ids.length) throw new ShipError("Amazon has no boxes on this shipment yet — submit the boxes first.");
    q = { PageType: kind === "box6" ? "PackageLabel_Letter_6" : "PackageLabel_Letter_2", LabelType: "UNIQUE", PackageLabelsToPrint: ids.join(",") };
  }
  const b = await call(S, "GET", `/fba/inbound/v0/shipments/${confirmationId}/labels`, q);
  const url = b.payload?.DownloadURL;
  if (!url) throw new ShipError("Amazon didn't return a label file.");
  return pdfResponse(url, `${kind}-labels-${confirmationId}.pdf`);
}

// ---------- warehouse targeting ----------

function evaluate(opts: any[], target: any) {
  const wanted = new Set(normTarget(target).warehouses);
  for (const o of opts) {
    const dests = (o.destinations || []).map((d: any) => String(d.warehouse || "").toUpperCase());
    const hits = dests.filter((d: string) => wanted.has(d)).length;
    o.matchesTarget = !!dests.length && (target.match === "partial" ? hits > 0 : hits === dests.length)
      && (target.maxFee === null || target.maxFee === undefined || optionFee(o) <= Number(target.maxFee));
  }
  return opts.filter((o) => o.matchesTarget).sort((a, b) => optionFee(a) - optionFee(b));
}

async function checkPlacement(S: Store, id: number) {
  const plan = getPlan(S, id);
  const data = plan.data, pid = plan.inbound_plan_id;
  const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/placementOptions`);
  await waitOp(S, g.operationId, "Getting warehouse options");
  const opts = await listAll(S, `${BASE}/inboundPlans/${pid}/placementOptions`, "placementOptions");
  for (const o of opts) {
    o.destinations = [];
    for (const sid of o.shipmentIds || []) {
      try {
        const sh = await call(S, "GET", `${BASE}/inboundPlans/${pid}/shipments/${sid}`);
        const items = await listAll(S, `${BASE}/inboundPlans/${pid}/shipments/${sid}/items`, "items");
        o.destinations.push({ shipmentId: sid, warehouse: sh.destination?.warehouseId || "", city: sh.destination?.address?.city || "",
          state: sh.destination?.address?.stateOrProvinceCode || "", units: sum(items, (x) => x.quantity) });
      } catch { o.destinations.push({ shipmentId: sid }); }
    }
  }
  const matches = evaluate(opts, data.target);
  data.placementOptions = opts;
  data.checks = (data.checks || 0) + 1;
  data.lastCheck = Date.now();
  data.history = [...(data.history || []), { at: Date.now(), offered: [...new Set(opts.flatMap((o: any) => o.destinations.map((d: any) => d.warehouse)))].join(", "), match: matches.length > 0 }].slice(-30);
  if (matches.length) {
    data.nextCheck = null;
    saveData(S, id, data, "found");
    if (plan.status !== "found") await notifyFound(S, plan, matches[0]);
  } else {
    data.nextCheck = Date.now() + Math.max(1, Number(data.target.everyHours) || 2) * 3_600_000;
    saveData(S, id, data, "targeting");
  }
  return getPlan(S, id);
}

async function notifyFound(S: Store, plan: any, o: any) {
  try {
    const to = S.alertRecipients();
    if (!to.length) return;
    const link = S.publicOrigin() ? `${S.publicOrigin()}/#/shipping?id=${plan.id}` : undefined;
    await sendMail(S.secretGetter(), {
      to, subject: `${(o.destinations || []).map((d: any) => d.warehouse).join(" + ")} offered for "${plan.name}"`,
      html: emailLayout(`Your warehouse is available`, `<p>Amazon now offers <b>${(o.destinations || []).map((d: any) => d.warehouse).join(" + ")}</b> for <b>${plan.name}</b> (you're accepting ${plan.data.target.warehouses.join(", ")}).</p>
        <p>${(o.destinations || []).map((d: any) => `${d.warehouse} ${d.city || ""} — ${d.units || "?"} units`).join("<br>")}</p>
        <p>Placement fee: <b>$${optionFee(o).toFixed(2)}</b>. Open the shipment to confirm — options expire, so don't wait too long.</p>`, link),
    });
    S.mailLog("shipping", `Target warehouse found for ${plan.name}`, "sent");
  } catch (e: any) { S.mailLog("shipping", `Target warehouse found for ${plan.name}`, "error", e.message); }
}

/** Scheduler hook: re-check plans that are hunting for their target warehouse. */
export async function runTargeting(S: Store) {
  const plans = S.all(`SELECT id, data FROM ship_plans WHERE status='targeting'`);
  for (const p of plans) {
    const d = JSON.parse(p.data || "{}");
    if (d.paused || (d.nextCheck && d.nextCheck > Date.now())) continue;
    if (S.budgetLeft() < 15) return;
    try { await checkPlacement(S, p.id); S.run(`UPDATE ship_plans SET last_error=NULL WHERE id=?`, p.id); }
    catch (e: any) {
      d.nextCheck = Date.now() + 3_600_000; // retry in an hour
      S.run(`UPDATE ship_plans SET data=?, last_error=? WHERE id=?`, JSON.stringify(d), `Automatic warehouse check: ${String(e.message).slice(0, 500)}`, p.id);
    }
    return; // one plan per tick
  }
}

// ---------- workflow steps ----------

const OWNER_OF: Record<string, string> = { SELLER_ONLY: "SELLER", NONE_ONLY: "NONE", AMAZON_ONLY: "AMAZON" };

/**
 * Who preps / labels each SKU. Amazon publishes hard constraints per SKU (SELLER_ONLY, NONE_ONLY, AMAZON_ONLY, and
 * "owners must match"); those always win. Where Amazon allows a choice we use the per-item override, else the plan's
 * default (`prepDefault`: SELLER or NONE).
 */
export async function ownersFor(S: Store, items: { sku: string; fnsku?: string }[], prepDefault = "NONE", overrides: Record<string, any> = {}) {
  const details: Record<string, any> = {};
  const skus = items.map((i) => i.sku);
  for (let i = 0; i < skus.length; i += 50) {
    try {
      const b = await call(S, "GET", `${BASE}/items/prepDetails`, { marketplaceId: S.amz.marketplaceId, mskus: skus.slice(i, i + 50) });
      for (const d of b.mskuPrepDetails || []) details[d.msku] = d;
    } catch { /* fall back to defaults */ }
  }
  const out: Record<string, any> = {};
  for (const it of items) {
    const d = details[it.sku] || {};
    const ov = overrides[it.sku] || {};
    const prepFixed = OWNER_OF[d.prepOwnerConstraint];
    const labelFixed = OWNER_OF[d.labelOwnerConstraint];
    let prepOwner = prepFixed || ov.prepOwner || prepDefault;
    let labelOwner = labelFixed || ov.labelOwner || (it.fnsku && /^X0/.test(it.fnsku) ? "SELLER" : "NONE");
    if (d.allOwnersConstraint === "MUST_MATCH") {
      // label and prep owner must be the same party
      if (prepFixed && !labelFixed) labelOwner = prepOwner;
      else if (labelFixed && !prepFixed) prepOwner = labelOwner;
      else if (!prepFixed && !labelFixed) prepOwner = labelOwner;
    }
    out[it.sku] = {
      prepOwner, labelOwner, prepFixed: !!prepFixed, labelFixed: !!labelFixed, mustMatch: d.allOwnersConstraint === "MUST_MATCH",
      prepTypes: (d.prepTypes || []).filter((t: string) => t !== "ITEM_LABELING"), prepCategory: d.prepCategory || null, known: !!details[it.sku],
    };
  }
  return out;
}

/** Recent ship-from addresses used on this account (newest first, de-duplicated). */
export async function recentAddresses(S: Store) {
  const cached = S.setting<any>("recent_ship_from", null);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.list;
  const seen = new Set<string>(), list: any[] = [];
  try {
    const plans = await call(S, "GET", `${BASE}/inboundPlans`, { pageSize: 30, sortBy: "CREATION_TIME", sortOrder: "DESC" });
    for (const pl of plans.inboundPlans || []) {
      const a = pl.sourceAddress; if (!a) continue;
      const key = [a.addressLine1, a.city, a.stateOrProvinceCode, a.postalCode, a.countryCode].join("|").toLowerCase();
      if (seen.has(key)) continue; seen.add(key);
      list.push({ name: a.name || "", companyName: a.companyName || "", addressLine1: a.addressLine1 || "", addressLine2: a.addressLine2 || "", city: a.city || "",
        stateOrProvinceCode: a.stateOrProvinceCode || "", postalCode: a.postalCode || "", countryCode: a.countryCode || "US", phoneNumber: a.phoneNumber || "", email: a.email || "" });
    }
  } catch { /* not connected */ }
  S.setSetting("recent_ship_from", { at: Date.now(), list });
  return list;
}

/** Fulfillment centers this account has shipped to in the last year, with counts (cached daily). */
export async function knownWarehouses(S: Store) {
  const cached = S.setting<any>("known_fcs", null);
  if (cached && Date.now() - cached.at < 24 * 3600_000) return cached.list;
  const counts: Record<string, { code: string; shipments: number; last: string | null }> = {};
  let token: string | undefined;
  const after = new Date(Date.now() - 365 * 86_400_000).toISOString(), before = new Date(Date.now() - 60_000).toISOString();
  for (let i = 0; i < 15; i++) {
    const q: any = token ? { QueryType: "NEXT_TOKEN", NextToken: token }
      : { QueryType: "DATE_RANGE", LastUpdatedAfter: after, LastUpdatedBefore: before, ShipmentStatusList: "WORKING,SHIPPED,RECEIVING,CLOSED,IN_TRANSIT,DELIVERED,CHECKED_IN" };
    let b: any;
    try { b = await call(S, "GET", "/fba/inbound/v0/shipments", q); } catch { break; }
    for (const sh of b.payload?.ShipmentData || []) {
      const c = sh.DestinationFulfillmentCenterId; if (!c) continue;
      counts[c] = counts[c] || { code: c, shipments: 0, last: null };
      counts[c].shipments++;
    }
    token = b.payload?.NextToken;
    if (!token) break;
  }
  const list = Object.values(counts).sort((x, y) => y.shipments - x.shipments);
  if (list.length) S.setSetting("known_fcs", { at: Date.now(), list });
  return list;
}

/** Actions a Warehouse-role user may run (no fees involved). */
export const WAREHOUSE_ACTIONS = new Set(["boxes_submit", "refresh"]);

export async function step(S: Store, id: number, action: string, args: any) {
  const plan = getPlan(S, id);
  const data = plan.data;
  const pid = plan.inbound_plan_id;
  const need = (cond: any, msg: string) => { if (!cond) throw new ShipError(msg); };

  switch (action) {
    case "create": {
      need(plan.status === "draft", "This plan was already sent to Amazon.");
      need(plan.items.length, "Add products first.");
      const a = args.address || plan.address;
      need(a && a.addressLine1 && a.city && a.postalCode && a.stateOrProvinceCode && a.phoneNumber && a.name, "Fill in the full ship-from address (name, street, city, state, ZIP, phone).");
      S.setSetting("ship_from", a);
      if (args.target) { data.target = normTarget({ ...data.target, ...args.target }); S.setSetting("ship_target", { warehouses: data.target.warehouses, match: data.target.match, everyHours: data.target.everyHours }); }
      if (args.prepDefault) { data.prepDefault = args.prepDefault; S.setSetting("prep_default", args.prepDefault); }
      if (args.owners) data.ownerOverrides = args.owners;
      S.run(`UPDATE ship_plans SET address=? WHERE id=?`, JSON.stringify(a), id);
      const owners = await ownersFor(S, plan.items.map((i: any) => ({ sku: i.sku, fnsku: i.fnsku || i.cur_fnsku })),
        data.prepDefault || S.setting("prep_default", "NONE"), data.ownerOverrides || {});
      const items = plan.items.map((i: any) => ({
        msku: i.sku, quantity: i.qty, labelOwner: owners[i.sku].labelOwner, prepOwner: owners[i.sku].prepOwner,
      }));
      const address: any = { ...a, countryCode: a.countryCode || "US" };
      for (const k of Object.keys(address)) if (address[k] === "" || address[k] === null) delete address[k];
      const b = await call(S, "POST", `${BASE}/inboundPlans`, null, {
        destinationMarketplaces: [S.amz.marketplaceId], sourceAddress: address, items, name: plan.name.slice(0, 40),
      });
      S.run(`UPDATE ship_plans SET inbound_plan_id=?, status='creating', updated_at=? WHERE id=?`, b.inboundPlanId, Date.now(), id);
      data.itemOwners = Object.fromEntries(items.map((x: any) => [x.msku, { labelOwner: x.labelOwner, prepOwner: x.prepOwner }]));
      saveData(S, id, data);
      await waitOp(S, b.operationId, "Creating the plan");
      // packing option: Amazon normally offers one; take it (fewest packing groups if several)
      const g = await call(S, "POST", `${BASE}/inboundPlans/${b.inboundPlanId}/packingOptions`);
      await waitOp(S, g.operationId, "Getting packing options");
      const popts = await listAll(S, `${BASE}/inboundPlans/${b.inboundPlanId}/packingOptions`, "packingOptions");
      need(popts.length, "Amazon offered no packing option for these products.");
      popts.sort((x: any, y: any) => (x.packingGroups || []).length - (y.packingGroups || []).length);
      const c = await call(S, "POST", `${BASE}/inboundPlans/${b.inboundPlanId}/packingOptions/${popts[0].packingOptionId}/confirmation`);
      await waitOp(S, c.operationId, "Confirming packing");
      data.packingOptionId = popts[0].packingOptionId;
      saveData(S, id, data, "targeting");
      return checkPlacement(S, id);
    }

    case "check": {
      need(pid && ["targeting", "found"].includes(plan.status), "Nothing to check at this stage.");
      return checkPlacement(S, id);
    }

    case "target": { // change target / schedule while hunting
      data.target = normTarget({ ...data.target, ...args.target });
      if (args.paused !== undefined) data.paused = !!args.paused;
      if (data.placementOptions && evaluate(data.placementOptions, data.target).length) { saveData(S, id, data, "found"); }
      else { data.nextCheck = Date.now() + Math.max(1, Number(data.target.everyHours) || 2) * 3_600_000; saveData(S, id, data, pid ? "targeting" : plan.status); }
      return getPlan(S, id);
    }

    case "placement_confirm": {
      need(pid && args.placementOptionId, "Pick a warehouse option.");
      const opt = (data.placementOptions || []).find((o: any) => o.placementOptionId === args.placementOptionId);
      need(opt, "That option is no longer listed — check again.");
      need(!opt.expiration || Date.parse(opt.expiration) > Date.now(), "That option has expired — check again for fresh options.");
      const c = await call(S, "POST", `${BASE}/inboundPlans/${pid}/placementOptions/${args.placementOptionId}/confirmation`);
      await waitOp(S, c.operationId, "Confirming warehouses");
      data.placementOptionId = args.placementOptionId;
      data.placementFee = optionFee(opt);
      data.shipments = [];
      for (const d of opt.destinations || []) {
        const items = await listAll(S, `${BASE}/inboundPlans/${pid}/shipments/${d.shipmentId}/items`, "items");
        data.shipments.push({ ...d, items: items.map((x: any) => ({ msku: x.msku, quantity: x.quantity })) });
      }
      saveData(S, id, data, "boxes");
      return step(S, id, "refresh", {});
    }

    case "boxes_submit": {
      need(pid && data.shipments?.length, "Confirm the warehouses first.");
      // args.boxes: { [shipmentId]: [{ count, length, width, height, weight, items: [{ msku, qty }] }] }
      const input = args.boxes || {};
      const owners = data.itemOwners || {};
      const packageGroupings = data.shipments.map((s: any) => {
        const lines: any[] = input[s.shipmentId] || [];
        need(lines.length, `Enter the boxes for the shipment to ${s.warehouse || s.shipmentId}.`);
        const totals: Record<string, number> = {};
        const boxes = lines.map((l) => {
          const count = Math.max(1, Math.round(Number(l.count) || 1));
          const items = (l.items || []).filter((x: any) => Number(x.qty) > 0).map((x: any) => {
            totals[x.msku] = (totals[x.msku] || 0) + Number(x.qty) * count;
            return { msku: x.msku, quantity: Math.round(Number(x.qty)), labelOwner: owners[x.msku]?.labelOwner || "SELLER", prepOwner: owners[x.msku]?.prepOwner || "NONE" };
          });
          need(items.length, "Every box needs at least one product.");
          for (const k of ["length", "width", "height", "weight"]) need(Number(l[k]) > 0, "Every box needs its size and weight.");
          need(Math.max(+l.length, +l.width, +l.height) <= 25, "Boxes can't be longer than 25 inches on any side.");
          need(+l.weight <= 50, "Boxes can't weigh more than 50 lb.");
          return {
            contentInformationSource: "BOX_CONTENT_PROVIDED", quantity: count, items,
            dimensions: { length: +l.length, width: +l.width, height: +l.height, unitOfMeasurement: "IN" },
            weight: { value: +l.weight, unit: "LB" },
          };
        });
        for (const it of s.items || []) {
          need((totals[it.msku] || 0) === it.quantity, `${s.warehouse}: ${it.msku} — boxes hold ${totals[it.msku] || 0} units but the shipment has ${it.quantity}.`);
        }
        return { shipmentId: s.shipmentId, boxes };
      });
      data.boxes = input;
      saveData(S, id, data);
      const r = await call(S, "POST", `${BASE}/inboundPlans/${pid}/packingInformation`, null, { packageGroupings });
      await waitOp(S, r.operationId, "Submitting box contents");
      // remember single-product box specs for next time
      for (const lines of Object.values(input) as any[][]) for (const l of lines) {
        const its = (l.items || []).filter((x: any) => Number(x.qty) > 0);
        if (its.length === 1) S.run(`INSERT OR REPLACE INTO box_specs (sku, units_per_box, length, width, height, weight, updated_at) VALUES (?,?,?,?,?,?,?)`,
          its[0].msku, Number(its[0].qty), +l.length, +l.width, +l.height, +l.weight, Date.now());
      }
      saveData(S, id, data, "freight");
      return step(S, id, "refresh", {});
    }

    case "freight_quote": {
      need(pid && data.placementOptionId, "Confirm the warehouses first.");
      const ready = args.readyDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const mode = args.mode === "parcel" ? "parcel" : "freight";
      const contact = args.contact || data.contact || {};
      if (mode === "freight") need(contact.name && contact.phoneNumber && contact.email, "Enter the freight contact (name, phone, email).");
      data.freightMode = mode; data.readyDate = ready; data.contact = contact;
      S.setSetting("freight_contact", contact);
      const cfgs = data.shipments.map((s: any) => {
        const f = (args.freight || {})[s.shipmentId] || s.freight || {};
        s.freight = f;
        const base: any = { shipmentId: s.shipmentId, readyToShipWindow: { start: `${ready}T12:00:00Z` } };
        if (mode === "freight") {
          need(Number(f.pallets) > 0 && Number(f.length) > 0 && Number(f.width) > 0 && Number(f.height) > 0 && Number(f.weight) > 0,
            `Enter pallet count, size and weight for ${s.warehouse || s.shipmentId}.`);
          base.contactInformation = { name: contact.name, phoneNumber: contact.phoneNumber, email: contact.email };
          base.pallets = [{ quantity: Math.round(+f.pallets), stackability: f.stackable === false ? "NON_STACKABLE" : "STACKABLE",
            dimensions: { length: +f.length, width: +f.width, height: +f.height, unitOfMeasurement: "IN" }, weight: { value: +f.weight, unit: "LB" } }];
          base.freightInformation = { declaredValue: { amount: Number(f.declaredValue) || 1000, code: "USD" }, freightClass: f.freightClass || "FC_125" };
        }
        return base;
      });
      saveData(S, id, data);
      const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/transportationOptions`, null, {
        placementOptionId: data.placementOptionId, shipmentTransportationConfigurations: cfgs,
      });
      await waitOp(S, g.operationId, "Getting freight quotes");
      for (const s of data.shipments) {
        const opts = await listAll(S, `${BASE}/inboundPlans/${pid}/transportationOptions`, "transportationOptions",
          { placementOptionId: data.placementOptionId, shipmentId: s.shipmentId });
        s.transportOptions = opts.map((o: any) => ({
          transportationOptionId: o.transportationOptionId, carrier: o.carrier?.name || o.carrier?.alphaCode || "", mode: o.shippingMode,
          solution: o.shippingSolution, cost: o.quote?.cost?.amount ?? null, preconditions: o.preconditions || [], expiration: o.quote?.expiration || null,
        })).sort((a: any, b: any) => {
          const pa = /FREIGHT/.test(a.mode) === (mode === "freight") ? 0 : 1, pb = /FREIGHT/.test(b.mode) === (mode === "freight") ? 0 : 1;
          return pa - pb || (a.solution === "AMAZON_PARTNERED_CARRIER" ? -1 : 1) - (b.solution === "AMAZON_PARTNERED_CARRIER" ? -1 : 1) || (a.cost ?? 1e9) - (b.cost ?? 1e9);
        });
      }
      saveData(S, id, data, "freight");
      return getPlan(S, id);
    }

    case "freight_confirm": {
      need(pid && data.shipments?.length, "Get quotes first.");
      const sel: Record<string, string> = args.selections || {};
      for (const s of data.shipments) {
        need(sel[s.shipmentId], "Pick an option for every shipment.");
        const opt = (s.transportOptions || []).find((o: any) => o.transportationOptionId === sel[s.shipmentId]);
        if (opt?.preconditions?.includes("CONFIRMED_DELIVERY_WINDOW") && !s.deliveryWindowConfirmed) {
          const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/shipments/${s.shipmentId}/deliveryWindowOptions`);
          await waitOp(S, g.operationId, "Getting delivery windows");
          const w = await listAll(S, `${BASE}/inboundPlans/${pid}/shipments/${s.shipmentId}/deliveryWindowOptions`, "deliveryWindowOptions");
          need(w.length, "Amazon offered no delivery window for this shipment.");
          const c = await call(S, "POST", `${BASE}/inboundPlans/${pid}/shipments/${s.shipmentId}/deliveryWindowOptions/${w[0].deliveryWindowOptionId}/confirmation`);
          await waitOp(S, c.operationId, "Confirming delivery window");
          s.deliveryWindowConfirmed = { start: w[0].startDate, end: w[0].endDate };
          saveData(S, id, data);
        }
      }
      const c = await call(S, "POST", `${BASE}/inboundPlans/${pid}/transportationOptions/confirmation`, null, {
        transportationSelections: data.shipments.map((s: any) => ({ shipmentId: s.shipmentId, transportationOptionId: sel[s.shipmentId] })),
      });
      await waitOp(S, c.operationId, "Confirming freight");
      for (const s of data.shipments) s.selected = sel[s.shipmentId];
      saveData(S, id, data, "confirmed");
      return step(S, id, "refresh", {});
    }

    case "refresh": {
      need(pid, "Not sent to Amazon yet.");
      for (const s of data.shipments || []) {
        try {
          const sh = await call(S, "GET", `${BASE}/inboundPlans/${pid}/shipments/${s.shipmentId}`);
          Object.assign(s, { confirmationId: sh.shipmentConfirmationId || null, status: sh.status || null, warehouse: sh.destination?.warehouseId || s.warehouse,
            city: sh.destination?.address?.city || s.city, state: sh.destination?.address?.stateOrProvinceCode || s.state, amazonReferenceId: sh.amazonReferenceId || null });
          const boxes = await listAll(S, `${BASE}/inboundPlans/${pid}/shipments/${s.shipmentId}/boxes`, "boxes");
          s.boxCount = boxes.length;
        } catch { /* keep old */ }
      }
      saveData(S, id, data);
      return getPlan(S, id);
    }

    case "cancel": {
      if (pid) {
        const c = await call(S, "PUT", `${BASE}/inboundPlans/${pid}/cancellation`);
        if (c.operationId) await waitOp(S, c.operationId, "Cancelling");
      }
      saveData(S, id, data, "cancelled");
      return getPlan(S, id);
    }
  }
  throw new ShipError(`Unknown step ${action}`);
}
