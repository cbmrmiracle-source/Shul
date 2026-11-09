# 9Yard integration (learned from the web app)

9Yard (app.nineyard.com) has no public API. Its Angular web app calls an internal
JSON API at `https://app.nineyard.com/api/<Group>/<Operation>`:

- **Auth:** `Authorization: Bearer <token>` + `tenantid: <id>`, both from `localStorage.User` (`token`, `tenantId`).
  The commerce-mcp tools run every call inside the owner's logged-in Claude Chrome tab, so no key is stored on the server.
- **Lists** use the ag-grid server-side body:
  `{startRow, endRow, rowGroupCols:[], valueCols:[], pivotCols:[], pivotMode:false, groupKeys:[], filterModel, sortModel, columns:[…]}`.
  `columns` is required (an empty list returns only ids). Responses: `{data, lastRow, totalCount, summaries}`.
- **Reports** (`/api/reports/ByDate`, `BySku`, `KpiDashboard`) also take `dateFrom` / `dateTo` (YYYY-MM-DD).

## Tools
| Tool | What |
|---|---|
| `nineyard_dashboard` | KPIs, FBM orders to ship, queues, inventory alerts |
| `nineyard_list` | skus, products, vendor_items, vendors, purchase_orders, shipments, inbound_plans, fbm_orders, profit_by_date, profit_by_sku, inventory_summary, warehouse_locations |
| `nineyard_skus` | SKU list with text search |
| `nineyard_catalog` | All ~1,100 operations by group |
| `nineyard_request` | Call any operation (writes need the owner's OK) |

## Main screens → endpoints
| Screen | Endpoint |
|---|---|
| Inventory → SKUs | POST /api/Repricer/GetSkuList1 |
| Inventory → Products | POST /api/Repricer/GetPurchasingProductList |
| Inventory → Vendor Items | POST /api/Repricer/GetItemList |
| Inventory → Vendors | POST /api/inventory/GetVendorList |
| Purchase orders | POST /api/purchasing/PurchaseOrderList |
| Shipyard → Shipments | POST /api/Shipments/ShipmentHeaderList |
| Shipyard → Plans | POST /api/Shipments/GetInboundPlansList |
| Orders → FBM | POST /api/PickingBatchs/FBMOrderList |
| Orders → Wholesale | POST /api/WholesaleOrder/GetWholeSaleOrdersList |
| Orders → Returns | POST /api/ordertype/GetReturnOrdersList |
| Analytics → by date / by SKU | POST /api/reports/ByDate, /api/reports/BySku |
| Analytics → Monthly snapshots | POST /api/reports/GetInventorySummaries |
| Analytics → Inventory aging | POST /api/reports/GridInventoryAging |
| Logistics → Warehouses | POST /api/logistics/GetWhLocationList |
| Logistics → Warehouse transfer | POST /api/logistics/GetWorkOrderList |
