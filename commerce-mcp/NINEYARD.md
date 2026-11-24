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

## The owner's FBA shipment flow (from recordings, Nov 16–17 2026)

Ships from the Brooklyn warehouse ("Mr Miracle", 319 Moffat St) almost always to **HEA2** (Breinigsville, PA, ~91 mi).
Uses Amazon's Send-to-Amazon v2024 API via 9Yard, **Flow B ("Plan and Pack")**. The owner does **not** use the
final confirm-transport / tracking / receiving steps in 9Yard — the flow ends at step 7.

| # | Step in 9Yard | Endpoint(s) | Body / query |
|---|---|---|---|
| 1 | Shipments → Plan Shipment → Import Bulk (paste `SKU<TAB>qty` lines) → Validate → Confirm | POST /api/Shipments/ValidatBulkSkus/ | `skuQtyList, account, fulfillmentType` |
| 2 | Plan Or Scan FC → **Schedule Auto Plan** targeting HEA2 (Optimized / Minimal / Partial). A background job keeps regenerating Amazon placement options until the target FC is offered | GET /api/Shipments/GetFCForWarehouse, TypeaheadFcs, GetLocationRecommendations, GetFcBlacklists; POST /api/{dashboard}/ScheduleTargetFcJob; GET GetTargetFcJobs / GetTargetFcJob | `scheduleName, intervalHours, scheduledEndDate, account, targetOptimizationLevel, targetFulfillmentCenterIds, secondaryTargetFulfillmentCenterIds, ignoreOptimizationLevel, email, requiredPriorityAmount, requiredTotalPriorityAmount, targetType` |
| 3 | Plans → open plan → **Create All** → Confirm (accepts the placement option, creates the FBA shipment) | GET GetSellerCentralInboundPlanDetails, ListShipmentItemsByOptionId; POST ConfirmPlacementOption | `account, inboundPlanId, placementOptionId, isSendEmail, updateShipmentNameRequest` |
| 4 | Shipment → Labeling → **Create Multiple Boxes** (L×W×H in, weight lb) → Save & Print; or Print All item (FNSKU) labels | POST /api/Shipments/AddSkuToBox/, Print2dLabelVByUser, NewPrintSkuWithIdSPByUser/; UnpackAll/ to undo | `accountSkuId, shipmentHeaderId, boxQty, CreateIfNotExists, length, width, height, weight, expDate` / `shipmentHeaderId, boxes, isPrintWholeShipment` |
| 5 | **Deduct From Inventory** — choose deduct warehouse (e.g. "Mr Miracle FBA INTERIM") | POST CheckShipmentSkuNotMapped → CheckValidationForNegativeQty → ShipmentDeduction | `shipmentHeaderId, completed, isAllDeduct` (+ `isManual`) |
| 6 | **Submit Box Content** to Amazon | POST /api/{dashboard}/SetPackingInformation | `inboundPlanId, account, contentInformationSource` |
| 7 | **Buy Shipping** page: pallets/LTL or **Full Truckload (FTL)**, carrier **AMAZON_FREIGHT**, pallet dims/weight/count, freight-ready date, contact person → **Calculate** | POST GetPrepShipShipment, GetAmaoznFreightDetails, /api/buyshipping/saveShipmentPackingPallet, SavePrepShipShipment, GenerateTransportationOptions | pallets: `height, length, width, weight, totalWeight, noOfPallet, stackablePallets, shipmentHeaderId`; prep-ship: `shipments, isShippingMethodSPD, isShippingPartner, shippingMode, carrier, shippingCarrier, isShippingMethodFTL, shippingContactId, …`; transport: `account, inboundPlanId, placementOptionId, shippingMode` |

Cancel a plan: POST CancelInboundPlan `{account, inboundPlanId}`. Shipment detail: GET /api/Shipments/GetShipmentDetails?ShipmentHeaderID=&IsRefresh=;
boxes: GET GetShipmentsBoxDetail?InboundPlanId=. `{dashboard}` = the `/api/dashboard/` group (the recorder shows it as `{token}`).

Not yet observed: SPD partnered-carrier path, multi-FC splits, the exact printers/label stock (printer settings come from
GET /api/settings/GetSelectedPrinterByUser — 3 printers configured, thermal + sheet).

## Purchasing flow (Nov 17 recording)
Purchasing queue (POST CreatePurchasingQueue `{skus}`) → PO plan (SavePoPlan `{vendorId, itemQtyList}`, SelectItemVendor `{VendorItemId, planId}`)
→ **ConvertToPoSignalR** `{planId}` → UpdatePoWarehouse `{poId, wharehouse}`. PO statuses: Draft → Working → Inbound → Receiving → Closed.
Editing/receiving a PO: POST EditPurchaseOrder (whole PO incl. `isFullyRecieved`, invoice fields); attachments: SavePoAttachment
`{poId, logoBase64, logoExtension, fileName}`. Put stock in a bin: POST /api/logistics/SaveLocationSummery
`{warehouseId, locationCode, locationId, itemId, qty, action, isEdit, …}`.
