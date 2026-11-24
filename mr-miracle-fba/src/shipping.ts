// FBA inbound shipments (Send to Amazon, Fulfillment Inbound API v2024-03-20) + unit/box labels.
//
// Flow per plan (each step is a button in the Shipping page; each Amazon call is async and polled here):
//   draft → create (createInboundPlan) → packing (generate/list/confirm packing option) → boxes (setPackingInformation)
//   → placement (generate/list, owner confirms fees) → transport (generate/list, owner picks carrier; delivery window
//   if required; confirm) → labels (unit + box labels).
import type { Store } from "./store";
import { sleep } from "./util";

const BASE = "/inbound/fba/2024-03-20";

export class ShipError extends Error {}

// ---------- helpers ----------

async function waitOp(S: Store, operationId: string, label: string, maxMs = 90_000) {
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
    if (Date.now() - t0 > maxMs) throw new ShipError(`${label} is still running at Amazon — press "Check again" in a minute.`);
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

/** Fetches a short-lived document URL and returns the bytes as a PDF response. */
async function pdfResponse(url: string, name: string) {
  const r = await fetch(url);
  if (!r.ok) throw new ShipError(`Couldn't download the label file from Amazon (HTTP ${r.status}).`);
  return new Response(r.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"` } });
}

// ---------- plan storage ----------

export function getPlan(S: Store, id: number) {
  const p = S.one(`SELECT * FROM ship_plans WHERE id=?`, id);
  if (!p) throw new ShipError("Shipment plan not found.");
  const items = S.all(`SELECT i.*, p.title, p.image, p.fnsku AS cur_fnsku, p.asin AS cur_asin, inv.fulfillable
                       FROM ship_items i LEFT JOIN products p ON p.sku=i.sku LEFT JOIN inventory inv ON inv.sku=i.sku
                       WHERE i.plan_id=? ORDER BY i.sku`, id);
  return { ...p, data: JSON.parse(p.data || "{}"), address: JSON.parse(p.address || "null"), items };
}

function saveData(S: Store, id: number, data: any, status?: string) {
  S.run(`UPDATE ship_plans SET data=?, updated_at=?${status ? ", status=?" : ""} WHERE id=?`,
    JSON.stringify(data), Date.now(), ...(status ? [status] : []), id);
}

export function createDraft(S: Store, name: string, items: { sku: string; qty: number }[], user: string) {
  const clean = items.filter((i) => i.sku && Number(i.qty) > 0);
  if (!clean.length) throw new ShipError("Add at least one product with a quantity.");
  S.run(`INSERT INTO ship_plans (name, status, data, created_by, created_at, updated_at) VALUES (?, 'draft', '{}', ?, ?, ?)`,
    name || `Send list ${new Date().toISOString().slice(0, 10)}`, user, Date.now(), Date.now());
  const id = S.one(`SELECT MAX(id) id FROM ship_plans`).id;
  setItems(S, id, clean);
  return id;
}

export function setItems(S: Store, id: number, items: { sku: string; qty: number }[]) {
  const p = S.one(`SELECT status FROM ship_plans WHERE id=?`, id);
  if (!p) throw new ShipError("Plan not found.");
  if (p.status !== "draft") throw new ShipError("Items can only be changed before the plan is sent to Amazon.");
  S.run(`DELETE FROM ship_items WHERE plan_id=?`, id);
  for (const it of items) {
    if (!(Number(it.qty) > 0)) continue;
    const pr = S.one(`SELECT asin, fnsku FROM products WHERE sku=?`, it.sku);
    if (!pr) throw new ShipError(`Unknown SKU ${it.sku}`);
    S.run(`INSERT OR REPLACE INTO ship_items (plan_id, sku, asin, fnsku, qty) VALUES (?,?,?,?,?)`, id, it.sku, pr.asin, pr.fnsku, Math.round(Number(it.qty)));
  }
  S.run(`UPDATE ship_plans SET updated_at=? WHERE id=?`, Date.now(), id);
}

/** Default ship-from address: saved setting, else the address used on the most recent Amazon plan. */
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
  if (kind === "thermal") Object.assign(body, { labelType: "THERMAL_PRINTING", width: 57, height: 32 }); // 2.25" × 1.25"
  else Object.assign(body, { labelType: "STANDARD_FORMAT", pageType: kind === "a4" ? "A4_24" : "Letter_30" });
  const b = await call(S, "POST", `${BASE}/items/labels`, null, body);
  const url = b.documentDownloads?.[0]?.uri;
  if (!url) throw new ShipError("Amazon didn't return a label file.");
  return pdfResponse(url, "unit-labels.pdf");
}

export async function boxLabels(S: Store, plan: any, shipmentId: string, pageType: string) {
  const sh = await call(S, "GET", `${BASE}/inboundPlans/${plan.inbound_plan_id}/shipments/${shipmentId}`);
  const confirmationId = sh.shipmentConfirmationId;
  if (!confirmationId) throw new ShipError("This shipment has no Amazon shipment ID yet — finish the carrier step first.");
  const boxes = await listAll(S, `${BASE}/inboundPlans/${plan.inbound_plan_id}/shipments/${shipmentId}/boxes`, "boxes");
  const ids = boxes.map((b) => b.boxId).filter(Boolean);
  if (!ids.length) throw new ShipError("Amazon has no boxes on this shipment yet.");
  const b = await call(S, "GET", `/fba/inbound/v0/shipments/${confirmationId}/labels`, {
    PageType: pageType || "PackageLabel_Letter_2", LabelType: "UNIQUE", PackageLabelsToPrint: ids.join(","),
  });
  const url = b.payload?.DownloadURL;
  if (!url) throw new ShipError("Amazon didn't return a box label file.");
  return pdfResponse(url, `box-labels-${confirmationId}.pdf`);
}

// ---------- workflow steps ----------

async function prepOwners(S: Store, skus: string[]) {
  // Amazon rejects prepOwner=SELLER for items that need no prep (and vice versa), so ask first.
  const out: Record<string, string> = {};
  for (let i = 0; i < skus.length; i += 50) {
    try {
      const b = await call(S, "GET", `${BASE}/items/prepDetails`, { marketplaceId: S.amz.marketplaceId, mskus: skus.slice(i, i + 50) });
      for (const d of b.mskuPrepDetails || []) {
        const types: string[] = d.prepTypes || [];
        out[d.msku] = !types.length || types.every((t) => t === "ITEM_NO_PREP") ? "NONE" : "SELLER";
      }
    } catch { /* default below */ }
  }
  return out;
}

export async function step(S: Store, id: number, action: string, args: any) {
  const plan = getPlan(S, id);
  const data = plan.data;
  const pid = plan.inbound_plan_id;
  const need = (cond: any, msg: string) => { if (!cond) throw new ShipError(msg); };

  switch (action) {
    case "create": {
      need(plan.status === "draft" || plan.status === "error", "This plan was already sent to Amazon.");
      need(plan.items.length, "Add products first.");
      const a = args.address || plan.address;
      need(a && a.addressLine1 && a.city && a.postalCode && a.stateOrProvinceCode && a.phoneNumber && a.name, "Fill in the full ship-from address (name, street, city, state, ZIP, phone).");
      S.setSetting("ship_from", a);
      S.run(`UPDATE ship_plans SET address=? WHERE id=?`, JSON.stringify(a), id);
      const prep = await prepOwners(S, plan.items.map((i: any) => i.sku));
      const items = plan.items.map((i: any) => ({
        msku: i.sku, quantity: i.qty,
        // items that sell under the manufacturer barcode (FNSKU = ASIN) need no Amazon label
        labelOwner: args.labelOwner?.[i.sku] || (i.fnsku && /^X0/.test(i.fnsku) ? "SELLER" : "NONE"),
        prepOwner: args.prepOwner?.[i.sku] || prep[i.sku] || "NONE",
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
      saveData(S, id, data, "created");
      return step(S, id, "packing_generate", {});
    }

    case "packing_generate": {
      need(pid, "Create the plan first.");
      const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/packingOptions`);
      await waitOp(S, g.operationId, "Getting packing options");
      data.packingOptions = await listAll(S, `${BASE}/inboundPlans/${pid}/packingOptions`, "packingOptions");
      saveData(S, id, data, "packing");
      // one option and nothing to choose: confirm it straight away
      if (data.packingOptions.length === 1) return step(S, id, "packing_confirm", { packingOptionId: data.packingOptions[0].packingOptionId });
      return getPlan(S, id);
    }

    case "packing_confirm": {
      need(pid && args.packingOptionId, "Pick a packing option.");
      const c = await call(S, "POST", `${BASE}/inboundPlans/${pid}/packingOptions/${args.packingOptionId}/confirmation`);
      await waitOp(S, c.operationId, "Confirming packing");
      const opt = (data.packingOptions || []).find((o: any) => o.packingOptionId === args.packingOptionId) || {};
      data.packingOptionId = args.packingOptionId;
      data.packingGroups = [];
      for (const gid of opt.packingGroups || []) {
        const items = await listAll(S, `${BASE}/inboundPlans/${pid}/packingGroups/${gid}/items`, "items");
        data.packingGroups.push({ packingGroupId: gid, items: items.map((x: any) => ({ msku: x.msku, asin: x.asin, fnsku: x.fnsku, quantity: x.quantity, labelOwner: x.labelOwner, prepOwner: x.prepOwner })) });
      }
      saveData(S, id, data, "boxes");
      return getPlan(S, id);
    }

    case "boxes_submit": {
      need(pid && data.packingGroups?.length, "Confirm packing first.");
      // args.groups: { [packingGroupId]: [{ count, length, width, height, weight, items: [{ msku, qty }] }] }
      const groups = args.groups || {};
      const packageGroupings = data.packingGroups.map((g: any) => {
        const lines: any[] = groups[g.packingGroupId] || [];
        need(lines.length, "Enter boxes for every packing group.");
        const owner = Object.fromEntries(g.items.map((x: any) => [x.msku, x]));
        const totals: Record<string, number> = {};
        const boxes = lines.map((l) => {
          const count = Math.max(1, Math.round(Number(l.count) || 1));
          const items = (l.items || []).filter((x: any) => Number(x.qty) > 0).map((x: any) => {
            need(owner[x.msku], `${x.msku} isn't in this packing group.`);
            totals[x.msku] = (totals[x.msku] || 0) + Number(x.qty) * count;
            return { msku: x.msku, quantity: Math.round(Number(x.qty)), labelOwner: owner[x.msku].labelOwner, prepOwner: owner[x.msku].prepOwner };
          });
          need(items.length, "Every box needs at least one product.");
          for (const k of ["length", "width", "height", "weight"]) need(Number(l[k]) > 0, "Every box needs its dimensions and weight.");
          need(Math.max(+l.length, +l.width, +l.height) <= 25, "Boxes can't be longer than 25 inches on any side (Amazon's standard limit).");
          need(+l.weight <= 50, "Boxes can't weigh more than 50 lb (Amazon's standard limit).");
          return {
            contentInformationSource: "BOX_CONTENT_PROVIDED", quantity: count, items,
            dimensions: { length: +l.length, width: +l.width, height: +l.height, unitOfMeasurement: "IN" },
            weight: { value: +l.weight, unit: "LB" },
          };
        });
        for (const it of g.items) {
          need((totals[it.msku] || 0) === it.quantity, `${it.msku}: boxes hold ${totals[it.msku] || 0} units but the plan has ${it.quantity}.`);
        }
        return { packingGroupId: g.packingGroupId, boxes };
      });
      data.boxes = groups;
      saveData(S, id, data);
      const r = await call(S, "POST", `${BASE}/inboundPlans/${pid}/packingInformation`, null, { packageGroupings });
      await waitOp(S, r.operationId, "Saving box contents");
      saveData(S, id, data, "placement");
      return step(S, id, "placement_generate", {});
    }

    case "placement_generate": {
      need(pid, "Create the plan first.");
      const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/placementOptions`);
      await waitOp(S, g.operationId, "Getting placement options");
      const opts = await listAll(S, `${BASE}/inboundPlans/${pid}/placementOptions`, "placementOptions");
      // destination warehouse for each shipment in each option
      for (const o of opts) {
        o.destinations = [];
        for (const sid of o.shipmentIds || []) {
          try {
            const sh = await call(S, "GET", `${BASE}/inboundPlans/${pid}/shipments/${sid}`);
            const items = await listAll(S, `${BASE}/inboundPlans/${pid}/shipments/${sid}/items`, "items");
            o.destinations.push({ shipmentId: sid, warehouse: sh.destination?.warehouseId || "", city: sh.destination?.address?.city || "",
              state: sh.destination?.address?.stateOrProvinceCode || "", units: items.reduce((s: number, x: any) => s + (x.quantity || 0), 0) });
          } catch { o.destinations.push({ shipmentId: sid }); }
        }
      }
      data.placementOptions = opts;
      saveData(S, id, data, "placement");
      return getPlan(S, id);
    }

    case "placement_confirm": {
      need(pid && args.placementOptionId, "Pick a placement option.");
      const c = await call(S, "POST", `${BASE}/inboundPlans/${pid}/placementOptions/${args.placementOptionId}/confirmation`);
      await waitOp(S, c.operationId, "Confirming placement");
      const opt = (data.placementOptions || []).find((o: any) => o.placementOptionId === args.placementOptionId) || {};
      data.placementOptionId = args.placementOptionId;
      data.shipments = (opt.destinations || (opt.shipmentIds || []).map((s: string) => ({ shipmentId: s })));
      saveData(S, id, data, "transport");
      return getPlan(S, id);
    }

    case "transport_generate": {
      need(pid && data.placementOptionId, "Confirm placement first.");
      const ready = args.readyDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      data.readyDate = ready;
      const g = await call(S, "POST", `${BASE}/inboundPlans/${pid}/transportationOptions`, null, {
        placementOptionId: data.placementOptionId,
        shipmentTransportationConfigurations: data.shipments.map((s: any) => ({ shipmentId: s.shipmentId, readyToShipWindow: { start: `${ready}T12:00:00Z` } })),
      });
      await waitOp(S, g.operationId, "Getting carrier options");
      for (const s of data.shipments) {
        const opts = await listAll(S, `${BASE}/inboundPlans/${pid}/transportationOptions`, "transportationOptions",
          { placementOptionId: data.placementOptionId, shipmentId: s.shipmentId });
        s.transportOptions = opts.map((o: any) => ({
          transportationOptionId: o.transportationOptionId, carrier: o.carrier?.name || o.carrier?.alphaCode || "", mode: o.shippingMode,
          solution: o.shippingSolution, cost: o.quote?.cost?.amount ?? null, currency: o.quote?.cost?.code || "USD",
          preconditions: o.preconditions || [], expiration: o.quote?.expiration || null,
        }));
      }
      saveData(S, id, data, "transport");
      return getPlan(S, id);
    }

    case "transport_confirm": {
      need(pid && data.shipments?.length, "Get carrier options first.");
      const sel: Record<string, string> = args.selections || {};
      for (const s of data.shipments) {
        need(sel[s.shipmentId], "Pick a carrier option for every shipment.");
        const opt = (s.transportOptions || []).find((o: any) => o.transportationOptionId === sel[s.shipmentId]);
        // own-carrier options need a confirmed delivery window first
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
      await waitOp(S, c.operationId, "Confirming carriers");
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
