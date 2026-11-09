import { type Tool, type Env, s, schema, ToolError } from "../mcp";
import { callBridge } from "./browser";

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

export const nineyardTools: Tool[] = [
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
