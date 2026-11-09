// Catalog of Selling Partner API operations callable through amazon_call.
// Restricted (PII) operations — buyer info, shipping addresses, RDT tokens — are
// deliberately left out. Anything missing here can still be reached with
// amazon_raw_request using the path from the SP-API reference.

export interface Operation {
  api: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // {param} placeholders
  description: string;
  /** Query parameters the operation accepts (the important ones). */
  query?: string[];
  /** Query param that takes the marketplace; filled with the default if omitted. */
  marketplaceParam?: string;
  /** Grantless operations use client_credentials with this scope. */
  grantlessScope?: string;
  body?: string; // short hint of the body shape
}

const ops: Operation[] = [];
function add(api: string, list: [string, Operation["method"], string, string, Partial<Operation>?][]) {
  for (const [name, method, path, description, extra] of list) ops.push({ api, name, method, path, description, ...extra });
}

const MP = { marketplaceParam: "marketplaceIds" };
const MP1 = { marketplaceParam: "marketplaceId" };
const MPv0 = { marketplaceParam: "MarketplaceId" };

add("sellers", [
  ["getMarketplaceParticipations", "GET", "/sellers/v1/marketplaceParticipations", "Marketplaces the account sells in, with store names and participation status."],
  ["getAccount", "GET", "/sellers/v1/account", "Seller account details: business type, selling plan, primary contact business info."],
]);

add("orders", [
  ["getOrders", "GET", "/orders/v0/orders", "Search orders by date/status/fulfillment channel. Needs CreatedAfter or LastUpdatedAfter.", {
    query: ["MarketplaceIds", "CreatedAfter", "CreatedBefore", "LastUpdatedAfter", "LastUpdatedBefore", "OrderStatuses", "FulfillmentChannels", "PaymentMethods", "MaxResultsPerPage", "NextToken", "AmazonOrderIds", "SellerOrderId", "EasyShipShipmentStatuses", "IsISPU"],
    marketplaceParam: "MarketplaceIds" }],
  ["getOrder", "GET", "/orders/v0/orders/{orderId}", "One order (no buyer PII)."],
  ["getOrderItems", "GET", "/orders/v0/orders/{orderId}/orderItems", "Line items of an order: ASIN, SKU, qty, prices, promotions.", { query: ["NextToken"] }],
  ["updateShipmentStatus", "POST", "/orders/v0/orders/{orderId}/shipment", "Update shipment status (e.g. ReadyForPickup) for a merchant-fulfilled order.", { body: "{marketplaceId, shipmentStatus, orderItems?}" }],
  ["confirmShipment", "POST", "/orders/v0/orders/{orderId}/shipmentConfirmation", "Confirm shipment of an MFN order with carrier + tracking.", { body: "{packageDetail:{packageReferenceId, carrierCode, trackingNumber, shipDate, orderItems:[{orderItemId, quantity}]}, marketplaceId}" }],
]);

add("sales", [
  ["getOrderMetrics", "GET", "/sales/v1/orderMetrics", "Aggregated sales: units, order count, revenue, avg price per interval. interval='2025-01-01T00:00:00-05:00--2025-02-01T00:00:00-05:00'.", {
    query: ["marketplaceIds", "interval", "granularity", "granularityTimeZone", "buyerType", "fulfillmentNetwork", "firstDayOfWeek", "asin", "sku", "amount"], ...MP }],
]);

add("catalog", [
  ["searchCatalogItems", "GET", "/catalog/2022-04-01/items", "Search Amazon's catalog by keywords or identifiers (UPC/EAN/ASIN/SKU). Works for any product, not just yours.", {
    query: ["marketplaceIds", "keywords", "identifiers", "identifiersType", "includedData", "brandNames", "classificationIds", "pageSize", "pageToken", "keywordsLocale", "sellerId"], ...MP }],
  ["getCatalogItem", "GET", "/catalog/2022-04-01/items/{asin}", "Full catalog data for any ASIN. includedData: attributes,classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries.", {
    query: ["marketplaceIds", "includedData", "locale"], ...MP }],
]);

add("pricing", [
  ["getItemOffers", "GET", "/products/pricing/v0/items/{Asin}/offers", "Top 20 offers on an ASIN from all sellers, Buy Box winner, lowest prices, seller feedback.", {
    query: ["MarketplaceId", "ItemCondition", "CustomerType"], ...MPv0 }],
  ["getItemOffersBatch", "POST", "/batches/products/pricing/v0/itemOffers", "getItemOffers for up to 20 ASINs in one call.", { body: "{requests:[{uri:'/products/pricing/v0/items/{asin}/offers', method:'GET', MarketplaceId, ItemCondition:'New'}]}" }],
  ["getListingOffers", "GET", "/products/pricing/v0/listings/{SellerSKU}/offers", "Offers on the ASIN behind one of your SKUs.", { query: ["MarketplaceId", "ItemCondition", "CustomerType"], ...MPv0 }],
  ["getListingOffersBatch", "POST", "/batches/products/pricing/v0/listingOffers", "getListingOffers for up to 20 SKUs.", { body: "{requests:[{uri:'/products/pricing/v0/listings/{sku}/offers', method:'GET', MarketplaceId, ItemCondition:'New'}]}" }],
  ["getPricing", "GET", "/products/pricing/v0/price", "Your own price for SKUs or ASINs (up to 20).", { query: ["MarketplaceId", "Asins", "Skus", "ItemType", "ItemCondition", "OfferType"], ...MPv0 }],
  ["getCompetitivePricing", "GET", "/products/pricing/v0/competitivePrice", "Competitive (Buy Box) price, offer counts and sales ranks for ASINs/SKUs.", { query: ["MarketplaceId", "Asins", "Skus", "ItemType", "CustomerType"], ...MPv0 }],
  ["getCompetitiveSummary", "POST", "/batches/products/pricing/2022-05-01/items/competitiveSummary", "Featured offer (Buy Box) per buying option, reference prices (e.g. was price), lowest priced offers — up to 20 ASINs.", { body: "{requests:[{asin, marketplaceId, includedData:['featuredBuyingOptions','referencePrices','lowestPricedOffers'], lowestPricedOffersInputs:[{itemCondition:'New', offerType:'Consumer'}], method:'GET', uri:'/products/pricing/2022-05-01/items/competitiveSummary'}]}" }],
  ["getFeaturedOfferExpectedPriceBatch", "POST", "/batches/products/pricing/2022-05-01/offer/featuredOfferExpectedPrice", "Price at which your SKU would become the featured offer (Buy Box) — up to 40 SKUs.", { body: "{requests:[{marketplaceId, sku, method:'GET', uri:'/products/pricing/2022-05-01/offer/featuredOfferExpectedPrice'}]}" }],
]);

add("fees", [
  ["getMyFeesEstimateForSKU", "POST", "/products/fees/v0/listings/{SellerSKU}/feesEstimate", "Referral + FBA fee estimate for one of your SKUs at a price.", { body: "{FeesEstimateRequest:{MarketplaceId, IsAmazonFulfilled:true, PriceToEstimateFees:{ListingPrice:{CurrencyCode:'USD', Amount:19.99}}, Identifier:'any-id'}}" }],
  ["getMyFeesEstimateForASIN", "POST", "/products/fees/v0/items/{Asin}/feesEstimate", "Fee estimate for any ASIN at a price (great for sourcing).", { body: "same as getMyFeesEstimateForSKU" }],
  ["getMyFeesEstimates", "POST", "/products/fees/v0/feesEstimate", "Fee estimates for up to 20 ASINs/SKUs.", { body: "[{FeesEstimateRequest:{...}, IdType:'ASIN', IdValue:'B0...'}]" }],
]);

add("listings", [
  ["getListingsItem", "GET", "/listings/2021-08-01/items/{sellerId}/{sku}", "One of your listings: summaries, attributes, issues, offers, fulfillmentAvailability, procurement.", {
    query: ["marketplaceIds", "issueLocale", "includedData"], ...MP }],
  ["searchListingsItems", "GET", "/listings/2021-08-01/items/{sellerId}", "Search / page through all your listings (filter by sku, status, issues, dates).", {
    query: ["marketplaceIds", "identifiers", "identifiersType", "variationParentSku", "packageHierarchySku", "createdAfter", "createdBefore", "lastUpdatedAfter", "lastUpdatedBefore", "withIssueSeverity", "withStatus", "withoutStatus", "sortBy", "sortOrder", "pageSize", "pageToken", "includedData", "issueLocale"], ...MP }],
  ["putListingsItem", "PUT", "/listings/2021-08-01/items/{sellerId}/{sku}", "Create or fully replace a listing. Use mode=VALIDATION_PREVIEW first.", {
    query: ["marketplaceIds", "includedData", "mode", "issueLocale"], ...MP, body: "{productType, requirements:'LISTING', attributes:{...}}" }],
  ["patchListingsItem", "PATCH", "/listings/2021-08-01/items/{sellerId}/{sku}", "Partially update a listing — price, quantity, title, bullets… Use mode=VALIDATION_PREVIEW first.", {
    query: ["marketplaceIds", "includedData", "mode", "issueLocale"], ...MP,
    body: "{productType, patches:[{op:'replace', path:'/attributes/purchasable_offer', value:[{marketplace_id, currency:'USD', our_price:[{schedule:[{value_with_tax:19.99}]}]}]}]}" }],
  ["deleteListingsItem", "DELETE", "/listings/2021-08-01/items/{sellerId}/{sku}", "Delete a listing (SKU) from a marketplace.", { query: ["marketplaceIds", "issueLocale"], ...MP }],
  ["getListingsRestrictions", "GET", "/listings/2021-08-01/restrictions", "Can you list this ASIN? Shows gating/approval requirements per condition.", {
    query: ["asin", "conditionType", "sellerId", "marketplaceIds", "reasonLocale"], ...MP }],
]);

add("productTypes", [
  ["searchDefinitionsProductTypes", "GET", "/definitions/2020-09-01/productTypes", "Find product types by keyword or item name.", { query: ["marketplaceIds", "keywords", "itemName", "locale", "searchLocale"], ...MP }],
  ["getDefinitionsProductType", "GET", "/definitions/2020-09-01/productTypes/{productType}", "JSON schema for a product type (which attributes a listing needs).", {
    query: ["marketplaceIds", "sellerId", "productTypeVersion", "requirements", "requirementsEnforced", "locale"], ...MP }],
]);

add("fbaInventory", [
  ["getInventorySummaries", "GET", "/fba/inventory/v1/summaries", "FBA inventory: fulfillable, inbound, reserved, unfulfillable, researching quantities.", {
    query: ["granularityType", "granularityId", "marketplaceIds", "details", "startDateTime", "sellerSkus", "sellerSku", "nextToken"], ...MP }],
]);

const IB = "/inbound/fba/2024-03-20";
add("fbaInbound", [
  ["listInboundPlans", "GET", `${IB}/inboundPlans`, "List inbound plans (Send to Amazon).", { query: ["pageSize", "paginationToken", "status", "sortBy", "sortOrder"] }],
  ["createInboundPlan", "POST", `${IB}/inboundPlans`, "Step 1: create an inbound plan. Returns operationId — poll getInboundOperationStatus.", { body: "{destinationMarketplaces:['ATVPDKIKX0DER'], sourceAddress:{name, addressLine1, city, stateOrProvinceCode, postalCode, countryCode, phoneNumber}, items:[{msku, quantity, labelOwner:'SELLER'|'AMAZON'|'NONE', prepOwner:'SELLER'|'AMAZON'|'NONE'}], name?}" }],
  ["getInboundPlan", "GET", `${IB}/inboundPlans/{inboundPlanId}`, "Inbound plan details incl. packing/placement options and shipments."],
  ["updateInboundPlanName", "PUT", `${IB}/inboundPlans/{inboundPlanId}/name`, "Rename a plan.", { body: "{name}" }],
  ["cancelInboundPlan", "PUT", `${IB}/inboundPlans/{inboundPlanId}/cancellation`, "Cancel an inbound plan (and its shipments)."],
  ["listInboundPlanItems", "GET", `${IB}/inboundPlans/{inboundPlanId}/items`, "Items in a plan.", { query: ["pageSize", "paginationToken"] }],
  ["listInboundPlanBoxes", "GET", `${IB}/inboundPlans/{inboundPlanId}/boxes`, "Boxes in a plan.", { query: ["pageSize", "paginationToken"] }],
  ["listInboundPlanPallets", "GET", `${IB}/inboundPlans/{inboundPlanId}/pallets`, "Pallets in a plan.", { query: ["pageSize", "paginationToken"] }],
  ["generatePackingOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/packingOptions`, "Step 2a: generate packing options (async → operationId)."],
  ["listPackingOptions", "GET", `${IB}/inboundPlans/{inboundPlanId}/packingOptions`, "Step 2b: list packing options.", { query: ["pageSize", "paginationToken"] }],
  ["confirmPackingOption", "POST", `${IB}/inboundPlans/{inboundPlanId}/packingOptions/{packingOptionId}/confirmation`, "Step 2c: confirm a packing option (async)."],
  ["listPackingGroupItems", "GET", `${IB}/inboundPlans/{inboundPlanId}/packingGroups/{packingGroupId}/items`, "Items in a packing group (what must be packed together).", { query: ["pageSize", "paginationToken"] }],
  ["listPackingGroupBoxes", "GET", `${IB}/inboundPlans/{inboundPlanId}/packingGroups/{packingGroupId}/boxes`, "Boxes in a packing group.", { query: ["pageSize", "paginationToken"] }],
  ["setPackingInformation", "POST", `${IB}/inboundPlans/{inboundPlanId}/packingInformation`, "Step 3: box contents, weights and dimensions per packing group (async).", { body: "{packageGroupings:[{packingGroupId, boxes:[{contentInformationSource:'BOX_CONTENT_PROVIDED', dimensions:{length,width,height,unitOfMeasurement:'IN'}, weight:{value, unit:'LB'}, quantity, items:[{msku, quantity, labelOwner, prepOwner}]}]}]}" }],
  ["generatePlacementOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/placementOptions`, "Step 4a: generate placement options (which FCs, fees) — async."],
  ["listPlacementOptions", "GET", `${IB}/inboundPlans/{inboundPlanId}/placementOptions`, "Step 4b: list placement options with fees and shipmentIds.", { query: ["pageSize", "paginationToken"] }],
  ["confirmPlacementOption", "POST", `${IB}/inboundPlans/{inboundPlanId}/placementOptions/{placementOptionId}/confirmation`, "Step 4c: confirm placement (creates shipments; may incur placement fee) — async."],
  ["generateTransportationOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/transportationOptions`, "Step 5a: generate carrier options (SPD/LTL, partnered or own) — async.", { body: "{placementOptionId, shipmentTransportationConfigurations:[{shipmentId, readyToShipWindow:{start:'2025-01-10T00:00:00Z'}, freightInformation?, pallets?}]}" }],
  ["listTransportationOptions", "GET", `${IB}/inboundPlans/{inboundPlanId}/transportationOptions`, "Step 5b: list transportation options and quotes.", { query: ["pageSize", "paginationToken", "placementOptionId", "shipmentId"] }],
  ["generateDeliveryWindowOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions`, "Step 6a (non-partnered carriers): generate delivery windows — async."],
  ["listDeliveryWindowOptions", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions`, "Step 6b: list delivery windows.", { query: ["pageSize", "paginationToken"] }],
  ["confirmDeliveryWindowOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions/{deliveryWindowOptionId}/confirmation`, "Step 6c: confirm a delivery window — async."],
  ["confirmTransportationOptions", "POST", `${IB}/inboundPlans/{inboundPlanId}/transportationOptions/confirmation`, "Step 7: confirm carriers for every shipment — async. After this the shipments are live.", { body: "{transportationSelections:[{shipmentId, transportationOptionId}]}" }],
  ["getShipment", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}`, "Shipment details: destination FC, status, tracking, selected options."],
  ["listShipmentItems", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/items`, "Items in a shipment.", { query: ["pageSize", "paginationToken"] }],
  ["listShipmentBoxes", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/boxes`, "Boxes in a shipment (box ids for labels).", { query: ["pageSize", "paginationToken"] }],
  ["listShipmentPallets", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/pallets`, "Pallets in a shipment.", { query: ["pageSize", "paginationToken"] }],
  ["updateShipmentName", "PUT", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/name`, "Rename a shipment.", { body: "{name}" }],
  ["updateShipmentSourceAddress", "PUT", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/sourceAddress`, "Change ship-from address (async).", { body: "{address:{...}}" }],
  ["updateShipmentTrackingDetails", "PUT", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/trackingDetails`, "Add tracking numbers (own-carrier SPD) or LTL PRO/BOL.", { body: "{trackingDetails:{spdTrackingDetail:{spdTrackingItems:[{boxId, trackingId}]}}}" }],
  ["getSelfShipAppointmentSlots", "GET", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots`, "Available FC drop-off appointment slots.", { query: ["pageSize", "paginationToken"] }],
  ["generateSelfShipAppointmentSlots", "POST", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots`, "Generate drop-off slots.", { body: "{desiredStartDate?, desiredEndDate?}" }],
  ["scheduleSelfShipAppointment", "POST", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots/{slotId}/schedule`, "Book a drop-off slot.", { body: "{reasonComment?}" }],
  ["cancelSelfShipAppointment", "PUT", `${IB}/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentCancellation`, "Cancel a drop-off appointment.", { body: "{reasonComment?}" }],
  ["listItemComplianceDetails", "GET", `${IB}/items/compliance`, "Compliance details (e.g. HS code) for SKUs.", { query: ["mskus", "marketplaceId"], ...MP1 }],
  ["updateItemComplianceDetails", "PUT", `${IB}/items/compliance`, "Update compliance details (async).", { query: ["marketplaceId"], ...MP1, body: "{msku, taxDetails:{...}}" }],
  ["listPrepDetails", "GET", `${IB}/items/prepDetails`, "Prep requirements (poly bag, bubble wrap…) for SKUs.", { query: ["marketplaceId", "mskus"], ...MP1 }],
  ["setPrepDetails", "POST", `${IB}/items/prepDetails`, "Set prep category/types for SKUs (async).", { body: "{marketplaceId, mskuPrepDetails:[{msku, prepCategory, prepTypes}]}" }],
  ["createMarketplaceItemLabels", "POST", `${IB}/items/labels`, "FNSKU item labels PDF for SKUs.", { body: "{marketplaceId, labelType:'STANDARD_FORMATTED'|'THERMAL_PRINTING', mskuQuantities:[{msku, quantity}], pageType?:'A4_21'...}" }],
  ["getInboundOperationStatus", "GET", `${IB}/operations/{operationId}`, "Status of an async inbound operation: IN_PROGRESS / SUCCESS / FAILED (+ problems)."],
]);

add("fbaInboundV0", [
  ["getShipments", "GET", "/fba/inbound/v0/shipments", "Shipments by status or id (works for shipments made in Seller Central too).", { query: ["MarketplaceId", "QueryType", "ShipmentStatusList", "ShipmentIdList", "LastUpdatedAfter", "LastUpdatedBefore", "NextToken"], ...MPv0 }],
  ["getShipmentItems", "GET", "/fba/inbound/v0/shipmentItems", "Items across shipments by date range.", { query: ["MarketplaceId", "QueryType", "LastUpdatedAfter", "LastUpdatedBefore", "NextToken"], ...MPv0 }],
  ["getShipmentItemsByShipmentId", "GET", "/fba/inbound/v0/shipments/{shipmentId}/items", "Items (shipped vs received) in a shipment.", { query: ["MarketplaceId"], ...MPv0 }],
  ["getLabels", "GET", "/fba/inbound/v0/shipments/{shipmentId}/labels", "Box/pallet shipping labels (PDF URL).", { query: ["PageType", "LabelType", "NumberOfPackages", "PackageLabelsToPrint", "NumberOfPallets", "PageSize", "PageStartIndex"] }],
  ["getBillOfLading", "GET", "/fba/inbound/v0/shipments/{shipmentId}/billOfLading", "Bill of lading for partnered LTL."],
  ["getPrepInstructions", "GET", "/fba/inbound/v0/prepInstructions", "Prep instructions by SKU or ASIN.", { query: ["ShipToCountryCode", "SellerSKUList", "ASINList"] }],
]);

add("fbaEligibility", [
  ["getItemEligibilityPreview", "GET", "/fba/inbound/v1/eligibility/itemPreview", "Is this ASIN eligible for FBA inbound / commingling?", { query: ["marketplaceIds", "asin", "program"], ...MP }],
]);

const OB = "/fba/outbound/2020-07-01";
add("fbaOutbound", [
  ["getFulfillmentPreview", "POST", `${OB}/fulfillmentOrders/preview`, "Multi-Channel Fulfillment quote: fees and ship dates for shipping FBA stock to any address.", { body: "{marketplaceId, address:{...}, items:[{sellerSku, quantity, sellerFulfillmentOrderItemId}], shippingSpeedCategories:['Standard']}" }],
  ["createFulfillmentOrder", "POST", `${OB}/fulfillmentOrders`, "Create an MCF order (ship FBA inventory for another channel's sale).", { body: "{sellerFulfillmentOrderId, displayableOrderId, displayableOrderDate, displayableOrderComment, shippingSpeedCategory, destinationAddress, items:[...]}" }],
  ["listAllFulfillmentOrders", "GET", `${OB}/fulfillmentOrders`, "List MCF orders.", { query: ["queryStartDate", "nextToken"] }],
  ["getFulfillmentOrder", "GET", `${OB}/fulfillmentOrders/{sellerFulfillmentOrderId}`, "MCF order status, shipments and tracking."],
  ["updateFulfillmentOrder", "PUT", `${OB}/fulfillmentOrders/{sellerFulfillmentOrderId}`, "Update an MCF order before it ships."],
  ["cancelFulfillmentOrder", "PUT", `${OB}/fulfillmentOrders/{sellerFulfillmentOrderId}/cancel`, "Cancel an MCF order."],
  ["getPackageTrackingDetails", "GET", `${OB}/tracking`, "Tracking events for an MCF package.", { query: ["packageNumber"] }],
  ["listReturnReasonCodes", "GET", `${OB}/returnReasonCodes`, "Return reason codes for an SKU.", { query: ["sellerSku", "marketplaceId", "sellerFulfillmentOrderId", "language"] }],
  ["createFulfillmentReturn", "PUT", `${OB}/fulfillmentOrders/{sellerFulfillmentOrderId}/return`, "Create a return authorization for an MCF order."],
  ["getFeatures", "GET", `${OB}/features`, "MCF features available (e.g. BLANK_BOX, BLOCK_AMZL).", { query: ["marketplaceId"], ...MP1 }],
  ["getFeatureInventory", "GET", `${OB}/features/inventory/{featureName}`, "SKUs eligible for an MCF feature.", { query: ["marketplaceId", "nextToken"], ...MP1 }],
]);

const RP = "/reports/2021-06-30";
add("reports", [
  ["createReport", "POST", `${RP}/reports`, "Request a report (or use amazon_run_report which waits + downloads).", { body: "{reportType, marketplaceIds, dataStartTime?, dataEndTime?, reportOptions?}" }],
  ["getReports", "GET", `${RP}/reports`, "List previously requested reports.", { query: ["reportTypes", "processingStatuses", "marketplaceIds", "pageSize", "createdSince", "createdUntil", "nextToken"] }],
  ["getReport", "GET", `${RP}/reports/{reportId}`, "Report status + reportDocumentId."],
  ["cancelReport", "DELETE", `${RP}/reports/{reportId}`, "Cancel a queued report."],
  ["getReportDocument", "GET", `${RP}/documents/{reportDocumentId}`, "Download URL for a report (use amazon_download_report to fetch & parse)."],
  ["getReportSchedules", "GET", `${RP}/schedules`, "Scheduled reports.", { query: ["reportTypes"] }],
  ["createReportSchedule", "POST", `${RP}/schedules`, "Schedule a recurring report.", { body: "{reportType, marketplaceIds, period:'PT1H'|'P1D'..., nextReportCreationTime?}" }],
  ["getReportSchedule", "GET", `${RP}/schedules/{reportScheduleId}`, "One report schedule."],
  ["cancelReportSchedule", "DELETE", `${RP}/schedules/{reportScheduleId}`, "Delete a report schedule."],
]);

const FD = "/feeds/2021-06-30";
add("feeds", [
  ["createFeedDocument", "POST", `${FD}/documents`, "Get an upload URL for a feed (amazon_submit_feed does all steps).", { body: "{contentType:'application/json; charset=UTF-8'}" }],
  ["createFeed", "POST", `${FD}/feeds`, "Submit an uploaded feed document.", { body: "{feedType:'JSON_LISTINGS_FEED', marketplaceIds, inputFeedDocumentId}" }],
  ["getFeeds", "GET", `${FD}/feeds`, "List feeds.", { query: ["feedTypes", "marketplaceIds", "pageSize", "processingStatuses", "createdSince", "createdUntil", "nextToken"] }],
  ["getFeed", "GET", `${FD}/feeds/{feedId}`, "Feed status + resultFeedDocumentId."],
  ["cancelFeed", "DELETE", `${FD}/feeds/{feedId}`, "Cancel a feed that hasn't started."],
  ["getFeedDocument", "GET", `${FD}/documents/{feedDocumentId}`, "Download URL for a feed or feed result document."],
]);

const DK = "/dataKiosk/2023-11-15";
add("dataKiosk", [
  ["createQuery", "POST", `${DK}/queries`, "Run a Data Kiosk GraphQL query (sales & traffic by ASIN/date, economics…). amazon_data_kiosk_query waits + downloads.", { body: "{query:'query { analytics_salesAndTraffic_2024_04_24 { ... } }', paginationToken?}" }],
  ["getQueries", "GET", `${DK}/queries`, "List Data Kiosk queries.", { query: ["processingStatuses", "pageSize", "createdSince", "createdUntil", "paginationToken"] }],
  ["getQuery", "GET", `${DK}/queries/{queryId}`, "Query status + dataDocumentId / errorDocumentId."],
  ["cancelQuery", "DELETE", `${DK}/queries/{queryId}`, "Cancel a query."],
  ["getDocument", "GET", `${DK}/documents/{documentId}`, "Download URL for a Data Kiosk result."],
]);

add("finances", [
  ["listFinancialEventGroups", "GET", "/finances/v0/financialEventGroups", "Settlement / disbursement groups (payouts).", { query: ["MaxResultsPerPage", "FinancialEventGroupStartedBefore", "FinancialEventGroupStartedAfter", "NextToken"] }],
  ["listFinancialEventsByGroupId", "GET", "/finances/v0/financialEventGroups/{eventGroupId}/financialEvents", "All financial events in a settlement group.", { query: ["MaxResultsPerPage", "PostedAfter", "PostedBefore", "NextToken"] }],
  ["listFinancialEventsByOrderId", "GET", "/finances/v0/orders/{orderId}/financialEvents", "Fees, charges, refunds for one order.", { query: ["MaxResultsPerPage", "NextToken"] }],
  ["listFinancialEvents", "GET", "/finances/v0/financialEvents", "Financial events in a date range (max 180 days).", { query: ["MaxResultsPerPage", "PostedAfter", "PostedBefore", "NextToken"] }],
  ["listTransactions", "GET", "/finances/2024-06-19/transactions", "Newer transactions API (incl. deferred transactions).", { query: ["postedAfter", "postedBefore", "marketplaceId", "transactionStatus", "nextToken"] }],
]);

add("notifications", [
  ["getSubscription", "GET", "/notifications/v1/subscriptions/{notificationType}", "Your subscription to a notification type (ANY_OFFER_CHANGED, ORDER_CHANGE, …).", { query: ["payloadVersion"] }],
  ["createSubscription", "POST", "/notifications/v1/subscriptions/{notificationType}", "Subscribe to a notification type.", { body: "{payloadVersion:'1.0', destinationId, processingDirective?}" }],
  ["getSubscriptionById", "GET", "/notifications/v1/subscriptions/{notificationType}/{subscriptionId}", "Subscription by id (grantless).", { grantlessScope: "sellingpartnerapi::notifications" }],
  ["deleteSubscriptionById", "DELETE", "/notifications/v1/subscriptions/{notificationType}/{subscriptionId}", "Unsubscribe (grantless).", { grantlessScope: "sellingpartnerapi::notifications" }],
  ["getDestinations", "GET", "/notifications/v1/destinations", "SQS / EventBridge destinations (grantless).", { grantlessScope: "sellingpartnerapi::notifications" }],
  ["createDestination", "POST", "/notifications/v1/destinations", "Create an SQS/EventBridge destination (grantless).", { grantlessScope: "sellingpartnerapi::notifications", body: "{name, resourceSpecification:{sqs:{arn}} | {eventBridge:{region, accountId}}}" }],
  ["getDestination", "GET", "/notifications/v1/destinations/{destinationId}", "One destination (grantless).", { grantlessScope: "sellingpartnerapi::notifications" }],
  ["deleteDestination", "DELETE", "/notifications/v1/destinations/{destinationId}", "Delete a destination (grantless).", { grantlessScope: "sellingpartnerapi::notifications" }],
]);

add("merchantFulfillment", [
  ["getEligibleShipmentServices", "POST", "/mfn/v0/eligibleShippingServices", "Buy Shipping rates for an MFN order.", { body: "{ShipmentRequestDetails:{AmazonOrderId, ItemList, ShipFromAddress, PackageDimensions, Weight, ShippingServiceOptions}}" }],
  ["createShipment", "POST", "/mfn/v0/shipments", "Buy a shipping label for an MFN order.", { body: "{ShipmentRequestDetails:{...}, ShippingServiceId}" }],
  ["getShipment", "GET", "/mfn/v0/shipments/{shipmentId}", "MFN shipment + label."],
  ["cancelShipment", "DELETE", "/mfn/v0/shipments/{shipmentId}", "Cancel (void) an MFN label."],
  ["getAdditionalSellerInputs", "POST", "/mfn/v0/additionalSellerInputs", "Extra fields a carrier needs."],
]);

add("shipping", [
  ["getRates", "POST", "/shipping/v2/shipments/rates", "Amazon Shipping v2 rate shopping.", { body: "{shipTo, shipFrom, packages, channelDetails:{channelType:'AMAZON', amazonOrderDetails:{orderId}}}" }],
  ["purchaseShipment", "POST", "/shipping/v2/shipments", "Buy a label from a rate.", { body: "{requestToken, rateId, requestedDocumentSpecification}" }],
  ["getTracking", "GET", "/shipping/v2/tracking", "Tracking for an Amazon Shipping label.", { query: ["trackingId", "carrierId"] }],
  ["getShipmentDocuments", "GET", "/shipping/v2/shipments/{shipmentId}/documents", "Re-print label documents.", { query: ["packageClientReferenceId", "format", "dpi"] }],
  ["cancelShipmentV2", "PUT", "/shipping/v2/shipments/{shipmentId}/cancel", "Void an Amazon Shipping label."],
]);

add("replenishment", [
  ["getSellingPartnerMetrics", "POST", "/replenishment/2022-11-07/sellingPartners/metrics/search", "Subscribe & Save performance metrics.", { body: "{aggregationFrequency, timeInterval:{startDate,endDate}, metrics, timePeriodType:'PERFORMANCE', marketplaceId, programTypes:['SUBSCRIBE_AND_SAVE']}" }],
  ["listOfferMetrics", "POST", "/replenishment/2022-11-07/offers/metrics/search", "Subscribe & Save metrics per ASIN.", { body: "{pagination:{limit, offset}, filters:{...}}" }],
  ["listOffers", "POST", "/replenishment/2022-11-07/offers/search", "Your Subscribe & Save offers.", { body: "{pagination:{limit, offset}, filters:{marketplaceId, programTypes:['SUBSCRIBE_AND_SAVE']}}" }],
]);

add("aplus", [
  ["searchContentDocuments", "GET", "/aplus/2020-11-01/contentDocuments", "List your A+ content documents.", { query: ["marketplaceId", "pageToken"], ...MP1 }],
  ["getContentDocument", "GET", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}", "One A+ document.", { query: ["marketplaceId", "includedDataSet"], ...MP1 }],
  ["createContentDocument", "POST", "/aplus/2020-11-01/contentDocuments", "Create A+ content.", { query: ["marketplaceId"], ...MP1, body: "{contentDocument:{name, contentType:'EBC', locale, contentModuleList:[...]}}" }],
  ["updateContentDocument", "POST", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}", "Update A+ content.", { query: ["marketplaceId"], ...MP1 }],
  ["listContentDocumentAsinRelations", "GET", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/asins", "ASINs using an A+ document.", { query: ["marketplaceId", "includedDataSet", "asinSet", "pageToken"], ...MP1 }],
  ["postContentDocumentAsinRelations", "POST", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/asins", "Attach ASINs to A+ content.", { query: ["marketplaceId"], ...MP1, body: "{asinSet:[...]}" }],
  ["validateContentDocumentAsinRelations", "POST", "/aplus/2020-11-01/contentAsinValidations", "Validate A+ content against ASINs.", { query: ["marketplaceId", "asinSet"], ...MP1 }],
  ["searchContentPublishRecords", "GET", "/aplus/2020-11-01/contentPublishRecords", "A+ publish history for an ASIN.", { query: ["marketplaceId", "asin", "pageToken"], ...MP1 }],
  ["postContentDocumentApprovalSubmission", "POST", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/approvalSubmissions", "Submit A+ for approval.", { query: ["marketplaceId"], ...MP1 }],
  ["postContentDocumentSuspendSubmission", "POST", "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/suspendSubmissions", "Suspend A+ content.", { query: ["marketplaceId"], ...MP1 }],
]);

add("customerFeedback", [
  ["getItemReviewTopics", "GET", "/customerFeedback/2024-06-01/items/{asin}/reviews/topics", "What reviewers praise/complain about for an ASIN (brand-registered).", { query: ["marketplaceId", "sortBy"], ...MP1 }],
  ["getItemReviewTrends", "GET", "/customerFeedback/2024-06-01/items/{asin}/reviews/trends", "Review topic trends over time.", { query: ["marketplaceId"], ...MP1 }],
  ["getItemBrowseNode", "GET", "/customerFeedback/2024-06-01/items/{asin}/browseNode", "Browse node used for review benchmarking.", { query: ["marketplaceId"], ...MP1 }],
  ["getBrowseNodeReviewTopics", "GET", "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/reviews/topics", "Review topics across a category.", { query: ["marketplaceId", "sortBy"], ...MP1 }],
  ["getBrowseNodeReviewTrends", "GET", "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/reviews/trends", "Category review trends.", { query: ["marketplaceId"], ...MP1 }],
  ["getBrowseNodeReturnTopics", "GET", "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/returns/topics", "Return reasons across a category.", { query: ["marketplaceId"], ...MP1 }],
  ["getBrowseNodeReturnTrends", "GET", "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/returns/trends", "Category return trends.", { query: ["marketplaceId"], ...MP1 }],
]);

add("messaging", [
  ["getMessagingActionsForOrder", "GET", "/messaging/v1/orders/{amazonOrderId}", "Which buyer-message types you may send for an order.", { query: ["marketplaceIds"], ...MP }],
  ["confirmCustomizationDetails", "POST", "/messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails", "Ask the buyer to confirm customization details.", { query: ["marketplaceIds"], ...MP, body: "{text, attachments?}" }],
  ["createConfirmDeliveryDetails", "POST", "/messaging/v1/orders/{amazonOrderId}/messages/confirmDeliveryDetails", "Message to confirm delivery details.", { query: ["marketplaceIds"], ...MP, body: "{text}" }],
  ["createUnexpectedProblem", "POST", "/messaging/v1/orders/{amazonOrderId}/messages/unexpectedProblem", "Tell the buyer about an unexpected problem.", { query: ["marketplaceIds"], ...MP, body: "{text}" }],
  ["createWarranty", "POST", "/messaging/v1/orders/{amazonOrderId}/messages/warranty", "Send warranty info.", { query: ["marketplaceIds"], ...MP, body: "{attachments?, coverageStartDate?, coverageEndDate?}" }],
]);

add("solicitations", [
  ["getSolicitationActionsForOrder", "GET", "/solicitations/v1/orders/{amazonOrderId}", "Can you request a review for this order?", { query: ["marketplaceIds"], ...MP }],
  ["createProductReviewAndSellerFeedbackSolicitation", "POST", "/solicitations/v1/orders/{amazonOrderId}/solicitations/productReviewAndSellerFeedback", "Send Amazon's 'Request a Review' email for an order.", { query: ["marketplaceIds"], ...MP }],
]);

add("uploads", [
  ["createUploadDestinationForResource", "POST", "/uploads/2020-11-01/uploadDestinations/{resource}", "Upload URL for A+ images / message attachments.", { query: ["marketplaceIds", "contentMD5", "contentType"], ...MP }],
]);

add("supplySources", [
  ["getSupplySources", "GET", "/supplySources/2020-07-01/supplySources", "Your supply sources (ship-from locations).", { query: ["nextPageToken", "pageSize"] }],
  ["getSupplySource", "GET", "/supplySources/2020-07-01/supplySources/{supplySourceId}", "One supply source."],
]);

export const OPERATIONS: Operation[] = ops;

const byName = new Map<string, Operation[]>();
for (const op of OPERATIONS) byName.set(op.name, [...(byName.get(op.name) ?? []), op]);

/** Finds an operation by "name" or "api.name" (needed when two APIs share a name, e.g. getShipment). */
export function findOperation(id: string): Operation | undefined {
  if (id.includes(".")) {
    const [api, name] = id.split(".");
    return OPERATIONS.find((o) => o.api === api && o.name === name);
  }
  const found = byName.get(id);
  return found?.[0];
}

export function ambiguous(id: string): string[] {
  return (byName.get(id) ?? []).length > 1 ? byName.get(id)!.map((o) => `${o.api}.${o.name}`) : [];
}
