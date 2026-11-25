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

# 9Yard data model (what each thing means, as observed Nov 9–17 2026)

## Products vs SKUs vs mappings — the core idea
- **Product** (a.k.a. item / master item, `ItemId`): the physical thing you stock, with a short internal name
  ("Alum Pan Round 9in") and a Title. Stock is counted per product.
  List: POST /api/Repricer/GetPurchasingProductList (`globalSearch`, `isForecasting:false`, filter `DeleteFlag=false`).
  Fields: ItemId, Name, Title, AccountSkuIds (comma list of mapped SKU ids), Mappings (count), DuplicateSkus, InboundQty,
  AvailbaleStock [sic], Reserved, OutboundUndeductedItems, Restock (suggested buy qty; negative = overstocked), FbaQty,
  TotalStock, Working, Tags, Upc, DefaultLocation, ProfitEach, VendorCost, AvgPrice, LastPoReceived, DeleteFlag.
  Example: "Alum Pan Round 8in" — TotalStock 78,050 = InboundQty 70,300 (on POs) + FBA 7,420 + local; Reserved 63,300; Restock −4,656.
  Detail: GET /api/inventory/GetProductDetails?id=, ItemSalesSummary?ProductId=, ItemGraphSummary|ItemGraphDetail?ProductId=&StartDate=&EndDate=,
  GetLocationByItemId?Id=, GetForecastingProductMappings?ProductId=&IsForecasting=&IsActive=.
- **SKU** (channel listing, `AccountSkuId`): one listing on one channel account (Amazon SKU/ASIN/FNSKU, Walmart item…).
  List: POST /api/Repricer/GetSkuList1 (Inventory → SKUs showed ~679 active results). Fields: AccountSkuId, Sku, Asin, FnSku, UPC/Gtin,
  Title, Account ("Mr Miracle"), AccountType (Amazon/Walmart/…), FulfillmentType (FBA/FBM), FbaType (Standard/Oversized),
  AvailableFbastock, FbaStock, AwdStock, LocalStock, WarehouseLocalStock, LocalMinusReserved, AmountInShipment, Working,
  Price, Minpr, MapPrice, FbaBBPrice, FbmBBPrice, BBAIsYours, BBIsAmazon, Rank, Category, SkuCost, PrepCost, ShipCost, FbaValue,
  CaseQty, ReplenishByCase, Case L/W/H/Weight, PalletQty, SafetyStock, SyncStockEnabled, SyncPct, MaxSyncQty, ChannelStatus,
  IsPrepV2Set/PrepTypes/PrepCategory, Expirable, Tags, CustomField1–5, ProductsMapped (names of mapped products).
- **Mapping** = SKU ↔ product link, many-to-many:
  - one product → many SKUs (e.g. "Alum Pan Round 9in" is mapped to 6 SKUs across pack sizes/channels);
  - one SKU → several products = a **kit/bundle** (e.g. the 9" pan SKU maps to "Alum Pan Round 9in" + "Plastic Lid 9in Pan").
  Selling/shipping a SKU deducts its mapped products' stock. Endpoints: /api/inventory/SetItemSkuMapping, SetItemMapping, EditMappings,
  ProductMappingList, ProductMappingDetails, GetSkuQuickMappings; listing-level: /api/Listing/GetListingSkuMappings, AddListingMapping,
  EditListingSkuMapping. Health alerts (dashboard): GetUnmappedDuplicateSkuCount, GetDuplicateSkuCount, GetItemStockWithNoMappingCount,
  MappedWithSyncOffCount, GetMapUnmapSkusCount, GetSkuNotOnSellerCount, GetMappedInactiveProductCount.

## Sales channels ("accounts")
- GET /api/settings/GetAccountsByType → 3 accounts. Per account: name, type, seller, marketplaceID, isActive, syncInventory, syncPct,
  safetyStock, defaultMax, deductStock, defaultWarehouseId, deductWarehouseId, fbmWarehouseId, handlingTime, storeUrl.
  → inventory sync pushes local stock to FBM channels as (stock × syncPct − safetyStock, capped at defaultMax).
- Channels 9Yard can connect: Amazon, Walmart (incl. WFS), Shopify, eBay, Etsy, TikTok Shop, Temu, Target Plus, Wayfair,
  WooCommerce, BigCommerce, Mirakl, ShipStation, UPS.
- Amazon (SP-API) marketplaces the seller participates in: US (main, store "Mr Miracle"), CA, MX, BR.

## Warehouses & bins
- GET /api/settings/getallwarehouses → 2 warehouses: fields id, name, address, priority, isfba, isfbm, isvendor, picktp, ispicking,
  isCarriesInventory, isTemp. Seen: "Mr Miracle" (Brooklyn, 319 Moffat St — carries inventory, ships to FBA) and
  "Mr Miracle FBA INTERIM" (chosen as the deduct warehouse for FBA shipments).
- Locations/bins: POST /api/logistics/GetWhLocationList (WarehouseId, LocationCode, ItemCount, Qty, TotalValue, FBMEnabled, Note).
  Put-away / adjust: POST /api/logistics/SaveLocationSummery {warehouseId, locationCode, locationId, itemId, qty, action, isEdit, …}.
  History: GetAllLocationItemsHistory. Per-product stock by warehouse: POST /api/logistics/GetItemWarehouseSummary.
  Transfers between warehouses = "work orders": GetWorkOrderList / GetWorkOrderStatus / SaveWorkOrders.
- Stock terms: LocalStock (in your warehouse), Reserved (committed to shipments/orders), LocalMinusReserved (free to use),
  InboundQty (on open POs), FbaQty/AvailableFbastock (at Amazon), AwdStock, Working (in shipments being built).

## Purchase orders
- Vendors (35): POST /api/inventory/GetVendorList — VendorId, VendorName, address, Phone, Email, LeadDays, PurchaseDays.
- Vendor items (~476 incl. deleted): POST /api/Repricer/GetItemList — VendorItemName, VendorName, Price, AvgPrice, CaseQty,
  MinimumOrderQty, QtyPerVendorUnit, dims, OutOfStock, UPC, IsDefault (default vendor for the product), DeleteFlag.
  Links product ↔ vendor with buy price and case pack.
- PO list: POST /api/purchasing/PurchaseOrderList — PurchaseOrderId, Vendor, TotalItems, TotalQty, TotalRecievedQty, SubTotal, Status,
  InvoiceNumber, InvoiceDate, DateCreated, DateSubmited, ExpectedOn, TotalReceivedValue, WharehouseName, SubmittedBy, Notes, Balance, AmountPaid.
  Status tabs (GET /api/purchasing/GetPoStatuses): Draft 2 · Working 12 · Inbound 1 · Receiving 4 · Closed 856 (All 875).
- PO detail: POST /api/purchasing/GetPoDetails {poId} → vendor + address, dates (created/submitted/expected/arrived/received), status,
  itemsCost, shippingCost, discountAmount/Pct, otherCost, subTotal, invoiceNumber/Date, isFullyRecieved, warehouse, purchaseOrderItems
  (vendorItemName, qty, qtyPerCase/cases, price, discount, additionalCost, totalPrice, received). Example PO 2036: Dixie 16 oz cups,
  2 items, 56,400 ordered, 12,288 received.
- Lifecycle: Forecasting → **Purchasing by SKU** / purchasing queue (POST CreatePurchasingQueue {skus}) → **PO plan** (SavePoPlan {vendorId, itemQtyList},
  SelectItemVendor {VendorItemId, planId}, SelectItemPo {itemVendorID, poId, planId}) → **ConvertToPoSignalR {planId}** → set warehouse
  (UpdatePoWarehouse {poId, wharehouse}) → Draft → Working → Inbound → Receiving (Edit → status, **Receive All**, Save =
  POST EditPurchaseOrder with the whole PO) → Closed. Attach files: SavePoAttachment {poId, logoBase64, logoExtension, fileName}.
  Then put received stock into a bin (SaveLocationSummery). PDFs/exports: PurchaseOrderPDF, ExportPoItems.

## Pricing
- Per-SKU price data lives on the SKU: Price, Minpr (min), MapPrice, FbaBBPrice / FbmBBPrice (Buy Box price), BBAIsYours / BBIsAmazon
  (who holds it), Rank, plus SkuCost/PrepCost/ShipCost → ProfitEach.
- 9Yard's repricer module **Priceyard** (/priceyard/models, pricing-list, sellers, history, settings) — endpoints ListRepriceModels,
  GetRepricingModel2, SaveRepriceModel2, UpdateSkuPricingModel, UpdateSkuPricingActive, ChangeMinPrice, ChangeMaxPrice, ChangeCost,
  ChangePriceFactor, SkuRepriceHistory, GetCompetitionList, SkuCompetition. **Not explored**: those pages redirected for this account
  (user flag isPriceYard is empty → probably not subscribed). The seller's actual repricing tool is unknown — ask.
- Profit reporting: POST /api/reports/ByDate and /BySku {dateFrom, dateTo, columns} — Sales, Cogs, Commission/Fulfillment/Storage fees,
  Refunds, Promotions, PPC (spend, sales, ACoS, TACoS), Profit, margin, ROI. KPI tiles: POST /api/reports/KpiDashboard {dateFrom, dateTo}.
- Direct Amazon pricing (via the commerce-mcp server's SP-API tools): amazon_offers (all offers + Buy Box), getCompetitiveSummary,
  getFeaturedOfferExpectedPriceBatch. As of Nov 18 these returned 403 until the SP-API app's Pricing role + a new refresh token are in place.
