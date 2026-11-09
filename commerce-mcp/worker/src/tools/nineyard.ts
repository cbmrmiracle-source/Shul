import { type Tool, type Env, s, schema, ToolError } from "../mcp";
import { callBridge } from "./browser";
import { NINEYARD_CATALOG } from "./nineyard-catalog";

// 9Yard (app.nineyard.com) has no public API, but its web app talks to an
// internal JSON API at /api/... using the login token it keeps in
// localStorage.User (token + tenantId). These tools run those calls inside the
// owner's logged-in Chrome tab through the bridge, so no key is stored here.

const ORIGIN = "https://app.nineyard.com";

async function nineyardTab(env: Env, computer?: string): Promise<string> {
  const tabs = (await callBridge(env, "tabs", { computer })) as { tabId: string; url: string; incognito: boolean }[];
  const hit = tabs.find((t) => !t.incognito && t.url.startsWith(ORIGIN) && !t.url.includes("/account/login"));
  if (hit) return hit.tabId;
  const t = (await callBridge(env, "tab_new", { computer, url: `${ORIGIN}/dashboard` })) as { tabId: string; url: string };
  if (t.url.includes("/account/login")) throw new ToolError("9Yard is logged out in the Claude Chrome — ask the owner to log in at app.nineyard.com, then retry.");
  return t.tabId;
}

async function nineyardFetch(env: Env, a: { method: string; path: string; query?: Record<string, unknown>; body?: unknown; computer?: string }) {
  if (!a.path.startsWith("/api/")) throw new ToolError("path must start with /api/");
  const tabId = await nineyardTab(env, a.computer);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(a.query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
  const url = a.path + (qs.toString() ? `?${qs}` : "");
  const expression = `(async () => {
    const u = JSON.parse(localStorage.getItem('User') || 'null');
    if (!u || !u.token) return { loggedOut: true };
    const r = await fetch(${JSON.stringify(url)}, {
      method: ${JSON.stringify(a.method)},
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + u.token, tenantid: String(u.tenantId) },
      body: ${a.body === undefined ? "undefined" : JSON.stringify(JSON.stringify(a.body))},
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 20000); }
    return { status: r.status, body };
  })()`;
  const out = (await callBridge(env, "evaluate", { computer: a.computer, tabId, expression })) as any;
  if (out?.loggedOut || out?.status === 401) throw new ToolError("9Yard session expired — ask the owner to log in again in the Claude Chrome.");
  return out;
}

const SKU_COLUMNS = ["AccountSkuId", "Active", "Sku", "Asin", "Title", "AccountType", "FulfillmentType", "FnSku", "UPC", "FbaType",
  "AvailableFbastock", "FbaStock", "AwdStock", "LocalStock", "WarehouseLocalStock", "LocalMinusReserved", "AmountInShipment", "Working",
  "Price", "Minpr", "FbaBBPrice", "FbmBBPrice", "BBAIsYours", "BBIsAmazon", "Rank", "Category", "SkuCost", "PrepCost", "ShipCost",
  "CaseQty", "ReplenishByCase", "Tags", "ChannelStatus", "ProductsMapped", "Note"];


// The main 9Yard screens. All use the ag-grid "server side row model" body.
interface Grid { path: string; columns: string[]; extra?: Record<string, unknown>; filters?: Record<string, unknown>; dated?: boolean; about: string }
const ACCOUNT = (a: string) => ({ Account: { filterType: "set", values: [a] } });
const GRIDS: Record<string, Grid> = {
  skus: { path: "/api/Repricer/GetSkuList1", columns: SKU_COLUMNS, extra: { missingCost: false }, about: "Channel SKUs (Inventory → SKUs): price, Buy Box, FBA/AWD/local stock, in-shipment, cost, rank" },
  products: { path: "/api/Repricer/GetPurchasingProductList", extra: { globalSearch: "", isForecasting: false }, filters: { DeleteFlag: { filterType: "boolean", value: false } },
    columns: ["ItemId", "Title", "Name", "AccountSkuIds", "LastPoReceived", "AvgPrice", "Mappings", "DuplicateSkus", "InboundQty", "AvailbaleStock", "Reserved", "OutboundUndeductedItems", "Restock", "FbaQty", "TotalStock", "Working", "Tags", "Upc", "DefaultLocation", "ProfitEach", "VendorCost"],
    about: "Products / master items (Inventory → Products): stock across warehouse+FBA, inbound, reserved, restock suggestion, vendor cost, profit each" },
  vendor_items: { path: "/api/Repricer/GetItemList", filters: { DeleteFlag: { filterType: "boolean", value: false } }, columns: ["VendorItemName", "VendorName", "InboundStock", "Price", "AvgPrice", "Notes", "CaseQty", "MinimumOrderQty", "QtyPerVendorUnit", "VendorLength", "VendorWidth", "VendorHeight", "VendorWeight", "OutOfStock", "UPC", "IsDefault", "DeleteFlag"],
    about: "Vendor items (Inventory → Vendor Items): what each vendor sells you, price, case qty, MOQ" },
  vendors: { path: "/api/inventory/GetVendorList", columns: ["VendorId", "VendorName", "Address1", "City", "State", "Postal", "Country", "Phone", "Email", "LeadDays", "PurchaseDays"], about: "Vendors / suppliers with lead days" },
  purchase_orders: { path: "/api/purchasing/PurchaseOrderList", columns: ["PurchaseOrderId", "Vendor", "TotalItems", "TotalQty", "TotalRecievedQty", "SubTotal", "Status", "InvoiceNumber", "InvoiceDate", "DateCreated", "TotalReceivedValue", "SubmittedBy", "WharehouseName", "DateSubmited", "ExpectedOn", "Notes", "Balance", "AmountPaid"],
    about: "Purchase orders: vendor, qty ordered vs received, totals, status, expected date" },
  shipments: { path: "/api/Shipments/ShipmentHeaderList", columns: ["ShipmentName", "ShipmentHeaderId", "AmazonShipmentId", "Account", "AccountType", "IsStarred", "PlacementOptionFee", "TotalSkus", "TotalQty", "ReceivedQty", "BoxCount", "QtyBoxed", "AllBoxed", "DeductQtyPercent", "FromWCode", "DestinationWCode", "ToWCity", "ToWState", "ShipmentType", "Status", "Flow", "IsComplete", "CreatedByNineyard", "PlannedOn", "UserNote", "CreatedOn", "InboundPlanId", "SubmittedBy"],
    about: "FBA shipments: Amazon shipment id, destination FC, qty vs received, boxes, placement fee, status" },
  inbound_plans: { path: "/api/Shipments/GetInboundPlansList", columns: ["Name", "Id", "RelatedShipment", "Status", "TotalSku", "TotalQty", "BoxCount", "AllBoxed", "DestinationWCode", "CreatedAt", "CreatedByNineyard", "Flow", "SubmittedBy", "IsCreated", "InboundPlanId", "JobId", "IsPartOfJob"],
    about: "Send-to-Amazon inbound plans (Shipyard → Plans)" },
  fbm_orders: { path: "/api/PickingBatchs/FBMOrderList", extra: { globalSearch: "" }, columns: ["Orderid", "Purchased", "BatchId", "BatchName", "Updated", "Asin", "Sku", "Title", "AccountType", "Qty", "TotalOrder", "ShipDate", "ShipByDate", "Pricetotal", "Status", "InternalStatus", "Account", "Channel", "Currency", "ShipWarehouse", "State", "CountryCode", "FulfillmentType", "Poid"],
    filters: { InternalStatus: { filterType: "set", values: ["Acknowledged", "Unshipped", "Pending", "Unfulfilled", "awaiting_shipment", "Ready_To_Pick", "Created", "PARTIALLY_FULFILLED", "EbayPending", "TargetPending", "WholesalePending", "UN_SHIPPING"] } },
    about: "FBM (merchant-fulfilled) orders waiting to ship, across channels. Pass filters:{} to see all statuses" },
  profit_by_date: { path: "/api/reports/ByDate", dated: true, columns: ["Date", "Account", "Orders", "QtySold", "QtyReturned", "ReturnRate", "Sales", "Cogs", "CommissionFees", "FulfillmentFees", "Fees", "Misc", "Refunds", "StorageFees", "Shipping", "Promotions", "Other", "Profit", "TotalProfitmargin", "PpcSales", "PpcSpend", "PpcAcos", "PpcTacos", "TotalProfit", "TotalProfitMargin", "Roi"],
    about: "Profit & loss per day (Analytics → Profit by date): sales, COGS, fees, refunds, PPC, profit, margin, ROI" },
  profit_by_sku: { path: "/api/reports/BySku", dated: true, columns: ["Sku", "FnSku", "FulfillmentType", "Marketplace", "Account", "Brand", "Vendors", "Orders", "QtySold", "Sales", "QtyReturned", "ReturnRate", "Cogs", "SellingFees", "FulfillmentFees", "Fees", "StorageFees", "Shipping", "Promotions", "Refunds", "PpcCost", "PPCSales", "PpcAcos", "PpcTacos", "Profit", "TotalProfit", "TotalProfitMargin", "Roi", "AvgNetProfitPerUnit"],
    about: "Profit & loss per SKU for a date range" },
  inventory_summary: { path: "/api/reports/GetInventorySummaries", extra: { sumColumns: [] }, columns: ["Name", "Account", "Asin", "SnapshotDate", "Month", "YEAR", "AvgPrice", "Cost", "QtyOnHand", "InventoryValue", "ValueLocal", "QtyOutbound", "QtyOnPo", "ValueOnPo", "QtyFba", "ValueFBA", "QtyAwd", "ValueAWD", "TotalQty", "TotalValue", "Brand", "Title"],
    about: "Monthly inventory snapshots: quantity and value on hand, on PO, at FBA, AWD" },
  warehouse_locations: { path: "/api/logistics/GetWhLocationList", columns: ["WarehouseId", "locationid", "WarehouseName", "LocationCode", "ItemCount", "Qty", "LastUpdate", "FBMEnabled", "TotalValue", "WId", "Note", "Items"],
    about: "Your warehouse locations / bins with item counts, qty and value" },
};

export const nineyardTools: Tool[] = [
  {
    name: "nineyard_list",
    description: "Reads any main 9Yard screen as data: " + Object.entries(GRIDS).map(([k, g]) => `${k} (${g.about})`).join("; ") +
      ". Filters use ag-grid format, e.g. {Status:{filterType:'set',values:['IN_TRANSIT']}} or {Sku:{filterType:'text',type:'contains',filter:'foil'}}. Sort: [{colId:'CreatedOn',sort:'desc'}].",
    inputSchema: schema({
      grid: s.enum(Object.keys(GRIDS), "Which screen"),
      filters: s.obj("ag-grid filterModel (merged over the defaults; pass {} keys with null to drop a default)"),
      sort: s.arr({ type: "object" }, "ag-grid sortModel"),
      account: s.str("Limit to a 9Yard account, e.g. 'Mr Miracle' (adds an Account filter)"),
      dateFrom: s.str("YYYY-MM-DD — for profit_by_date / profit_by_sku (default 30 days ago)"),
      dateTo: s.str("YYYY-MM-DD (default today)"),
      start: s.int("Row offset (default 0)"),
      limit: s.int("Rows (default 50, max 500)"),
      columns: s.arr({ type: "string" }, "Override the columns returned"),
      computer: s.str("Which connected computer"),
    }, ["grid"]),
    annotations: { readOnlyHint: true },
    run: async ({ grid, filters = {}, sort = [], account, dateFrom, dateTo, start = 0, limit = 50, columns, computer }, env) => {
      const g = GRIDS[grid];
      if (!g) throw new ToolError(`Unknown grid. Options: ${Object.keys(GRIDS).join(", ")}`);
      const filterModel: Record<string, unknown> = { ...(g.filters ?? {}), ...(account ? ACCOUNT(account) : {}), ...filters };
      for (const [k, v] of Object.entries(filterModel)) if (v === null) delete filterModel[k];
      const body: Record<string, unknown> = {
        startRow: start, endRow: start + Math.min(limit, 500), rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false, groupKeys: [],
        filterModel, sortModel: sort, columns: columns?.length ? columns : g.columns, ...(g.extra ?? {}),
      };
      if (g.dated) {
        const today = new Date();
        body.dateFrom = dateFrom ?? new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);
        body.dateTo = dateTo ?? today.toISOString().slice(0, 10);
      }
      const out = await nineyardFetch(env, { method: "POST", path: g.path, body, computer });
      if (out.status !== 200) return out;
      const rows = (out.body?.data ?? []).map((r: any) => {
        const { s: _s, ...rest } = r;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== ""));
      });
      return { grid, totalCount: out.body?.totalCount ?? out.body?.lastRow, start, returned: rows.length, summaries: out.body?.summaries, rows };
    },
  },
  {
    name: "nineyard_dashboard",
    description: "9Yard at a glance: KPIs for a date range (revenue, orders, units, refunds, returns, profit), FBM orders to ship (pending/late), purchasing & shipment queues, picking batches, and inventory alerts (unmapped/duplicate SKUs, expiring stock, missing placement fees).",
    inputSchema: schema({
      dateFrom: s.str("YYYY-MM-DD (default 7 days ago)"),
      dateTo: s.str("YYYY-MM-DD (default today)"),
      account: s.str("Account for queue counts (default 'Mr Miracle')"),
      computer: s.str("Which connected computer"),
    }),
    annotations: { readOnlyHint: true },
    run: async ({ dateFrom, dateTo, account = "Mr Miracle", computer }, env) => {
      const today = new Date();
      const from = dateFrom ?? new Date(today.getTime() - 7 * 864e5).toISOString().slice(0, 10);
      const to = dateTo ?? today.toISOString().slice(0, 10);
      const get = (path: string, query?: Record<string, unknown>) => nineyardFetch(env, { method: "GET", path, query, computer }).then((r) => r.body).catch((e) => ({ error: (e as Error).message }));
      const post = (path: string, body: unknown) => nineyardFetch(env, { method: "POST", path, body, computer }).then((r) => r.body).catch((e) => ({ error: (e as Error).message }));
      const [kpis, fbm, purchasingQueue, shipmentQueue, batches, unmappedDup, dupSkus, notOnSeller, expiring, placementFees, deductionAlerts] = await Promise.all([
        post("/api/reports/KpiDashboard", { dateFrom: from, dateTo: to }),
        post("/api/PickingBatchs/GetFBMOrdersSummaries", {}),
        get("/api/purchasing/GetPurchasingQueueDetails"),
        get("/api/Shipments/GetShipmentQueueDetails", { Account: account }),
        get("/api/PickingBatchs/GetPickingBatchCount"),
        get("/api/inventory/GetUnmappedDuplicateSkuCount", { Account: account }),
        get("/api/inventory/GetDuplicateSkuCount"),
        get("/api/inventory/GetSkuNotOnSellerCount"),
        get("/api/inventory/GetExpireSkuList"),
        get("/api/Shipments/MissingPlacementFeeAlertDetail"),
        get("/api/Shipments/ShipmentDeductionAlertCount"),
      ]);
      return { range: { from, to }, kpis, fbmOrdersToShip: fbm, purchasingQueue, shipmentQueue, pickingBatches: batches,
        alerts: { unmappedDuplicateSkus: unmappedDup, duplicateSkus: dupSkus, skusNotOnSeller: notOnSeller, expiringSkus: expiring, missingPlacementFees: placementFees, shipmentDeductionAlerts: deductionAlerts } };
    },
  },
  {
    name: "nineyard_catalog",
    description: "Lists every 9Yard internal API operation (~1,100, grouped), to find the right endpoint for nineyard_request. Read-only list operations (Get…/…List) are safe; Save/Create/Delete/Update/Confirm/Purchase change live data — confirm with the owner first.",
    inputSchema: schema({ group: s.str("Group name, e.g. purchasing, Shipments, reports. Omit for all groups."), search: s.str("Filter operation names by text") }),
    annotations: { readOnlyHint: true },
    run: async ({ group, search }) => {
      const q = search?.toLowerCase();
      const out: Record<string, string[]> = {};
      for (const [g, ops] of Object.entries(NINEYARD_CATALOG)) {
        if (group && g.toLowerCase() !== group.toLowerCase()) continue;
        const list = ops.split(" ").filter((o) => !q || o.toLowerCase().includes(q));
        if (list.length) out[`/api/${g}/`] = list;
      }
      return { note: "Call with nineyard_request. Grid/list endpoints take the ag-grid body (see nineyard_list for working column sets); GETs mostly take query params.", operations: out };
    },
  },

  {
    name: "nineyard_skus",
    description: "9Yard SKU list (Inventory → SKUs): price, Buy Box price, FBA/AWD/local stock, in-shipment qty, cost, rank, category, mapped products. Filter by account, active, or search text; pages of up to 500.",
    inputSchema: schema({
      search: s.str("Text to match in SKU, ASIN or title (filtered after fetching)"),
      account: s.str("9Yard account name (default 'Mr Miracle')"),
      activeOnly: s.bool("Only active SKUs (default true)"),
      start: s.int("Row offset (default 0)"),
      limit: s.int("Rows (default 100, max 500)"),
      columns: s.arr({ type: "string" }, "Columns to return (default: the useful ones)"),
      computer: s.str("Which connected computer"),
    }),
    annotations: { readOnlyHint: true },
    run: async ({ search, account = "Mr Miracle", activeOnly = true, start = 0, limit = 100, columns, computer }, env) => {
      const filterModel: Record<string, unknown> = { Account: { filterType: "set", values: [account] } };
      if (activeOnly) filterModel.Active = { filterType: "boolean", value: true };
      const cols = columns?.length ? columns : SKU_COLUMNS;
      const rows = search ? 5000 : Math.min(limit, 500);
      const out = await nineyardFetch(env, {
        method: "POST", path: "/api/Repricer/GetSkuList1", computer,
        body: { startRow: search ? 0 : start, endRow: (search ? 0 : start) + rows, rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false, groupKeys: [], filterModel, sortModel: [], columns: cols, missingCost: false },
      });
      if (out.status !== 200) return out;
      let data: any[] = out.body?.data ?? [];
      if (search) {
        const q = String(search).toLowerCase();
        data = data.filter((r) => [r.Sku, r.Asin, r.Title, r.FnSku, r.UPC].some((v) => String(v ?? "").toLowerCase().includes(q))).slice(start, start + Math.min(limit, 500));
      }
      const slim = data.map((r) => Object.fromEntries(cols.filter((c: string) => r[c] !== null && r[c] !== undefined).map((c: string) => [c, r[c]])));
      return { totalCount: out.body?.totalCount ?? out.body?.lastRow, returned: slim.length, start, rows: slim };
    },
  },
  {
    name: "nineyard_request",
    description: "Calls any 9Yard internal API endpoint through the owner's logged-in Chrome (auth handled). Known endpoints: POST /api/Repricer/GetSkuList1 (SKUs, ag-grid body), GET /api/settings/getallwarehouses, POST /api/common/getcategorylist, GET /api/Shipments/GetShipmentQueueCount?Account=, GET /api/purchasing/GetPurchasingQueueCount, POST /api/PickingBatchs/GetFBMOrdersSummaries, GET /api/PickingBatchs/GetPickingBatchCount, GET /api/inventory/GetDuplicateSkuCount, GET /api/inventory/GetSkuNotOnSellerCount, GET /api/inventory/GetExpireSkuList, GET /api/Shipments/MissingPlacementFeeAlertDetail, POST /api/settings/GetSettings. Find others with browser_record_start while browsing 9Yard. Writes (anything that saves/changes data) need the owner's OK first.",
    inputSchema: schema({
      method: s.enum(["GET", "POST", "PUT", "PATCH", "DELETE"], "HTTP method"),
      path: s.str("Path starting with /api/"),
      query: s.obj("Query parameters"),
      body: { description: "JSON body" },
      computer: s.str("Which connected computer"),
    }, ["method", "path"]),
    annotations: { openWorldHint: true },
    run: (a, env) => nineyardFetch(env, a),
  },
];
