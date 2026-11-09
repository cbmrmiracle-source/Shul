import { type Tool, type Env, s, schema, ToolError } from "../mcp";
import { sp, spRequest, resolveMarketplace, downloadDocument, parseDocument, pollUntil, MARKETPLACES } from "../amazon/client";
import { OPERATIONS, findOperation, ambiguous } from "../amazon/operations";

const mpArg = s.str("Marketplace id or country code (US, CA, UK, DE…). Defaults to the Worker's SP_MARKETPLACE_ID.");

function fillPath(path: string, params: Record<string, unknown>, env: Env): string {
  return path.replace(/\{(\w+)\}/g, (_, key) => {
    let v = params[key];
    if (v === undefined && key === "sellerId") v = env.SP_SELLER_ID;
    if (v === undefined || v === null || v === "") throw new ToolError(`Missing path parameter "${key}"`);
    return encodeURIComponent(String(v));
  });
}

const GUIDES: Record<string, string> = {
  fba_inbound: `FBA inbound (Send to Amazon, API v2024-03-20). Every generate*/confirm*/create* call is async: it returns operationId → call amazon_wait_operation until SUCCESS.
1. createInboundPlan {destinationMarketplaces, sourceAddress, items:[{msku, quantity, labelOwner, prepOwner}]} → inboundPlanId
   (check listPrepDetails first; fix prep with setPrepDetails if needed)
2. generatePackingOptions → listPackingOptions → confirmPackingOption(packingOptionId)
   listPackingGroupItems for each packingGroupId to see what goes in which boxes
3. setPackingInformation {packageGroupings:[{packingGroupId, boxes:[...]}]}
4. generatePlacementOptions → listPlacementOptions (compare fees / # of shipments) → confirmPlacementOption
5. generateTransportationOptions {placementOptionId, shipmentTransportationConfigurations:[{shipmentId, readyToShipWindow:{start}}]}
   → listTransportationOptions (partnered carrier vs own carrier, SPD vs LTL)
6. Own carrier only: generateDeliveryWindowOptions → listDeliveryWindowOptions → confirmDeliveryWindowOptions
7. confirmTransportationOptions {transportationSelections:[{shipmentId, transportationOptionId}]}
8. Labels: createMarketplaceItemLabels (FNSKU) and fbaInboundV0.getLabels (box labels, needs the shipmentConfirmationId from getShipment)
9. Own carrier: updateShipmentTrackingDetails. Track with getShipment / fbaInboundV0.getShipments.
Confirm placement and transportation only after the owner approves the fees — those steps cost money.`,
  pricing: `Buy Box & competition:
- amazon_offers(asins) — every seller's offer, who has the Buy Box, FBA/FBM, feedback, shipping time (up to 20 ASINs/call).
- getCompetitiveSummary — featured offer per buying option + reference (was) prices.
- getFeaturedOfferExpectedPriceBatch — the price your SKU needs to win the Buy Box.
- getCompetitivePricing — Buy Box price + sales rank.
- getCatalogItem(includedData=salesRanks,summaries,attributes) — BSR, brand, dims.
- getMyFeesEstimateForASIN — fees for any ASIN to estimate profit.
Change your price: patchListingsItem (path /attributes/purchasable_offer) — preview with mode=VALIDATION_PREVIEW first.`,
  sales: `Sales:
- amazon_sales(start, end, granularity) — units, orders, revenue (Sales API).
- amazon_data_kiosk_query with analytics_salesAndTraffic_2024_04_24 — sessions, page views, conversion, Buy Box % by ASIN or date.
- amazon_run_report reportType GET_SALES_AND_TRAFFIC_REPORT (JSON), GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL (orders).
- getOrders / getOrderItems for individual orders; finances.listFinancialEvents for fees & payouts.`,
  reports: `Useful report types for amazon_run_report:
Inventory: GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA, GET_FBA_INVENTORY_PLANNING_DATA (age, storage fees, restock recs), GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT, GET_LEDGER_SUMMARY_VIEW_DATA, GET_STRANDED_INVENTORY_UI_DATA, GET_RESERVED_INVENTORY_DATA
Listings: GET_MERCHANT_LISTINGS_ALL_DATA, GET_MERCHANT_LISTINGS_DATA, GET_MERCHANTS_LISTINGS_FYP_REPORT (suppressed)
Orders: GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL, GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL
Returns: GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA
Fees: GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA, GET_FBA_STORAGE_FEE_CHARGES_DATA, GET_FBA_REIMBURSEMENTS_DATA
Finance: GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2 (can't be requested — list with getReports)
Brand Analytics (brand owners): GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT, GET_BRAND_ANALYTICS_MARKET_BASKET_REPORT, GET_BRAND_ANALYTICS_REPEAT_PURCHASE_REPORT (reportOptions {reportPeriod:'WEEK'})
Business: GET_SALES_AND_TRAFFIC_REPORT (reportOptions {dateGranularity:'DAY', asinGranularity:'CHILD'})`,
  listings: `Listings:
- searchListingsItems — page through all your SKUs (includedData=summaries,offers,fulfillmentAvailability,issues).
- getListingsItem(sku) — one SKU incl. issues.
- patchListingsItem — change price/qty/content. Body {productType, patches:[{op:'replace', path:'/attributes/<attr>', value:[...]}]}. Always run with mode=VALIDATION_PREVIEW first, show the owner, then run for real.
- getDefinitionsProductType — the schema of attributes for a product type.
- getListingsRestrictions(asin) — whether you're ungated for an ASIN.
- Bulk: amazon_submit_feed with feedType JSON_LISTINGS_FEED.`,
};

export const amazonTools: Tool[] = [
  {
    name: "amazon_guide",
    description: "How-to for Amazon SP-API workflows (fba_inbound, pricing/buy box, sales, reports, listings). Read before multi-step tasks.",
    inputSchema: schema({ topic: s.enum(Object.keys(GUIDES), "Workflow to explain") }, ["topic"]),
    annotations: { readOnlyHint: true },
    run: async ({ topic }) => GUIDES[topic] ?? `Topics: ${Object.keys(GUIDES).join(", ")}`,
  },
  {
    name: "amazon_list_operations",
    description: "Lists the Amazon SP-API operations amazon_call can run (orders, catalog, pricing, fees, listings, FBA inventory/inbound/outbound, reports, feeds, Data Kiosk, finances, notifications, shipping, A+, reviews…), with paths, query params and body hints.",
    inputSchema: schema({
      api: s.str("Filter by API group, e.g. 'fbaInbound', 'pricing'. Omit to list groups."),
      search: s.str("Filter by text in name/description."),
    }),
    annotations: { readOnlyHint: true },
    run: async ({ api, search }) => {
      if (!api && !search) {
        const groups: Record<string, number> = {};
        for (const o of OPERATIONS) groups[o.api] = (groups[o.api] ?? 0) + 1;
        return { apiGroups: groups, marketplaces: MARKETPLACES, tip: "Call again with api=<group> for operations." };
      }
      const q = search?.toLowerCase();
      return OPERATIONS.filter((o) => (!api || o.api === api) && (!q || `${o.name} ${o.description}`.toLowerCase().includes(q))).map((o) => ({
        operation: `${o.api}.${o.name}`,
        method: o.method,
        path: o.path,
        description: o.description,
        ...(o.query ? { query: o.query } : {}),
        ...(o.body ? { body: o.body } : {}),
      }));
    },
  },
  {
    name: "amazon_call",
    description: "Runs any SP-API operation from amazon_list_operations. Path params go in pathParams; marketplace and sellerId are filled in automatically. Write operations (PUT/POST/PATCH/DELETE that change listings, prices, shipments) act on the live account — confirm with the owner first.",
    inputSchema: schema({
      operation: s.str("Operation name, e.g. 'getItemOffers' or 'fbaInbound.getShipment' when ambiguous"),
      pathParams: s.obj("Values for {placeholders} in the path, e.g. {asin:'B0…'}"),
      query: s.obj("Query parameters. Arrays become comma-separated."),
      body: s.obj("JSON body for POST/PUT/PATCH"),
      marketplace: mpArg,
    }, ["operation"]),
    annotations: { openWorldHint: true },
    run: async ({ operation, pathParams = {}, query = {}, body, marketplace }, env) => {
      const amb = ambiguous(operation);
      if (amb.length && !operation.includes(".")) throw new ToolError(`"${operation}" exists in several APIs: ${amb.join(", ")} — use one of those.`);
      const op = findOperation(operation);
      if (!op) throw new ToolError(`Unknown operation "${operation}". Use amazon_list_operations, or amazon_raw_request for anything not listed.`);
      const q = { ...query };
      if (op.marketplaceParam && q[op.marketplaceParam] === undefined) q[op.marketplaceParam] = resolveMarketplace(env, marketplace);
      if (op.query?.includes("sellerId") && q.sellerId === undefined && env.SP_SELLER_ID && ["productTypes", "listings"].includes(op.api)) q.sellerId = env.SP_SELLER_ID;
      const res = await spRequest(env, { method: op.method, path: fillPath(op.path, pathParams, env), query: q, body, grantlessScope: op.grantlessScope });
      return { status: res.status, requestId: res.requestId, rateLimit: res.rateLimit, body: res.body };
    },
  },
  {
    name: "amazon_raw_request",
    description: "Calls any SP-API path directly (for operations not in the catalog, e.g. newer API versions). Same auth as amazon_call.",
    inputSchema: schema({
      method: s.enum(["GET", "POST", "PUT", "PATCH", "DELETE"], "HTTP method"),
      path: s.str("Path starting with /, e.g. /catalog/2022-04-01/items/B0..."),
      query: s.obj("Query parameters"),
      body: s.obj("JSON body"),
      grantlessScope: s.str("Only for grantless operations, e.g. sellingpartnerapi::notifications"),
    }, ["method", "path"]),
    annotations: { openWorldHint: true },
    run: async ({ method, path, query, body, grantlessScope }, env) => spRequest(env, { method, path, query, body, grantlessScope }),
  },
  {
    name: "amazon_offers",
    description: "Buy Box and competition for up to 20 ASINs: who holds the Buy Box, every competing offer (seller id, price+shipping, FBA/FBM, feedback, ship time), lowest prices and offer counts.",
    inputSchema: schema({
      asins: s.arr({ type: "string" }, "ASINs (max 20)"),
      condition: s.enum(["New", "Used", "Collectible", "Refurbished", "Club"], "Item condition (default New)"),
      marketplace: mpArg,
    }, ["asins"]),
    annotations: { readOnlyHint: true },
    run: async ({ asins, condition = "New", marketplace }, env) => {
      if (!asins?.length || asins.length > 20) throw new ToolError("Pass 1–20 ASINs.");
      const MarketplaceId = resolveMarketplace(env, marketplace);
      const out = await sp(env, {
        method: "POST",
        path: "/batches/products/pricing/v0/itemOffers",
        body: { requests: asins.map((a: string) => ({ uri: `/products/pricing/v0/items/${a}/offers`, method: "GET", MarketplaceId, ItemCondition: condition, CustomerType: "Consumer" })) },
      });
      const money = (m: any) => (m ? Number(m.Amount) : undefined);
      return (out.responses ?? []).map((r: any) => {
        const p = r.body?.payload;
        if (!p) return { asin: r.request?.Asin ?? r.request?.uri, error: r.body?.errors ?? r.status };
        const offers = (p.Offers ?? []).map((o: any) => ({
          sellerId: o.SellerId,
          buyBox: o.IsBuyBoxWinner,
          fba: o.IsFulfilledByAmazon,
          price: money(o.ListingPrice),
          shipping: money(o.Shipping),
          landed: (money(o.ListingPrice) ?? 0) + (money(o.Shipping) ?? 0),
          condition: o.SubCondition,
          feedbackPct: o.SellerFeedbackRating?.SellerPositiveFeedbackRating,
          feedbackCount: o.SellerFeedbackRating?.FeedbackCount,
          shipsInHours: o.ShippingTime ? [o.ShippingTime.minimumHours, o.ShippingTime.maximumHours] : undefined,
          prime: o.PrimeInformation?.IsPrime,
          featuredMerchant: o.IsFeaturedMerchant,
          shipsFrom: o.ShipsFrom?.Country,
        }));
        return {
          asin: p.ASIN,
          status: p.status,
          totalOffers: p.Summary?.TotalOfferCount,
          offerCounts: p.Summary?.NumberOfOffers,
          buyBoxPrices: p.Summary?.BuyBoxPrices,
          lowestPrices: p.Summary?.LowestPrices,
          listPrice: p.Summary?.ListPrice,
          salesRankings: p.Summary?.SalesRankings,
          buyBoxEligibleOffers: p.Summary?.BuyBoxEligibleOffers,
          buyBoxWinner: offers.find((o: any) => o.buyBox)?.sellerId ?? null,
          offers,
        };
      });
    },
  },
  {
    name: "amazon_sales",
    description: "Sales totals (units, orders, revenue, average price) per day/week/month for the account, or for one ASIN/SKU.",
    inputSchema: schema({
      start: s.str("Start date YYYY-MM-DD (inclusive)"),
      end: s.str("End date YYYY-MM-DD (exclusive)"),
      granularity: s.enum(["Hour", "Day", "Week", "Month", "Year", "Total"], "Bucket size (default Day)"),
      timeZone: s.str("IANA zone for buckets (default America/Los_Angeles)"),
      asin: s.str("Only this ASIN"),
      sku: s.str("Only this SKU"),
      marketplace: mpArg,
    }, ["start", "end"]),
    annotations: { readOnlyHint: true },
    run: async ({ start, end, granularity = "Day", timeZone = "America/Los_Angeles", asin, sku, marketplace }, env) => {
      const body = await sp(env, {
        method: "GET",
        path: "/sales/v1/orderMetrics",
        query: {
          marketplaceIds: resolveMarketplace(env, marketplace),
          interval: `${start}T00:00:00Z--${end}T00:00:00Z`,
          granularity,
          granularityTimeZone: granularity === "Total" || granularity === "Hour" ? undefined : timeZone,
          asin,
          sku,
        },
      });
      return body.payload;
    },
  },
  {
    name: "amazon_inventory",
    description: "FBA inventory per SKU: fulfillable, inbound (working/shipped/receiving), reserved, unfulfillable, researching. Follows pagination.",
    inputSchema: schema({
      skus: s.arr({ type: "string" }, "Only these SKUs (max 50)"),
      changedSince: s.str("Only items changed since this ISO date"),
      maxPages: s.int("Pages to fetch (50 SKUs each, default 10)"),
      marketplace: mpArg,
    }),
    annotations: { readOnlyHint: true },
    run: async ({ skus, changedSince, maxPages = 10, marketplace }, env) => {
      const mp = resolveMarketplace(env, marketplace);
      const items: any[] = [];
      let nextToken: string | undefined;
      for (let i = 0; i < maxPages; i++) {
        const body = await sp(env, {
          method: "GET",
          path: "/fba/inventory/v1/summaries",
          query: { granularityType: "Marketplace", granularityId: mp, marketplaceIds: mp, details: true, sellerSkus: skus, startDateTime: changedSince, nextToken },
        });
        for (const it of body.payload?.inventorySummaries ?? []) {
          const d = it.inventoryDetails ?? {};
          items.push({
            sku: it.sellerSku, asin: it.asin, fnsku: it.fnSku, name: it.productName, condition: it.condition,
            total: it.totalQuantity, fulfillable: d.fulfillableQuantity,
            inboundWorking: d.inboundWorkingQuantity, inboundShipped: d.inboundShippedQuantity, inboundReceiving: d.inboundReceivingQuantity,
            reserved: d.reservedQuantity?.totalReservedQuantity, unfulfillable: d.unfulfillableQuantity?.totalUnfulfillableQuantity,
            researching: d.researchingQuantity?.totalResearchingQuantity, lastUpdated: it.lastUpdatedTime,
          });
        }
        nextToken = body.pagination?.nextToken;
        if (!nextToken) break;
      }
      return { count: items.length, morePages: !!nextToken, items };
    },
  },
  {
    name: "amazon_orders",
    description: "Orders created (or updated) in a date range, with optional status/channel filters; follows pagination. Optionally includes line items.",
    inputSchema: schema({
      createdAfter: s.str("ISO date/time, e.g. 2025-01-01"),
      createdBefore: s.str("ISO date/time"),
      lastUpdatedAfter: s.str("Use instead of createdAfter to get recently changed orders"),
      statuses: s.arr({ type: "string" }, "Pending, Unshipped, PartiallyShipped, Shipped, Canceled, Unfulfillable…"),
      fulfillmentChannels: s.arr({ type: "string" }, "AFN (FBA) and/or MFN"),
      includeItems: s.bool("Also fetch order items (1 extra call per order — keep the range small)"),
      maxPages: s.int("Pages of 100 (default 5)"),
      marketplace: mpArg,
    }),
    annotations: { readOnlyHint: true },
    run: async ({ createdAfter, createdBefore, lastUpdatedAfter, statuses, fulfillmentChannels, includeItems, maxPages = 5, marketplace }, env) => {
      if (!createdAfter && !lastUpdatedAfter) throw new ToolError("Give createdAfter or lastUpdatedAfter.");
      const orders: any[] = [];
      let NextToken: string | undefined;
      for (let i = 0; i < maxPages; i++) {
        const body = await sp(env, {
          method: "GET",
          path: "/orders/v0/orders",
          query: NextToken
            ? { MarketplaceIds: resolveMarketplace(env, marketplace), NextToken }
            : { MarketplaceIds: resolveMarketplace(env, marketplace), CreatedAfter: createdAfter, CreatedBefore: createdBefore, LastUpdatedAfter: lastUpdatedAfter, OrderStatuses: statuses, FulfillmentChannels: fulfillmentChannels, MaxResultsPerPage: 100 },
        });
        orders.push(...(body.payload?.Orders ?? []));
        NextToken = body.payload?.NextToken;
        if (!NextToken) break;
      }
      const slim = orders.map((o) => ({
        orderId: o.AmazonOrderId, purchaseDate: o.PurchaseDate, status: o.OrderStatus, channel: o.FulfillmentChannel,
        total: o.OrderTotal, itemsShipped: o.NumberOfItemsShipped, itemsUnshipped: o.NumberOfItemsUnshipped,
        latestShipDate: o.LatestShipDate, isPrime: o.IsPrime, isBusiness: o.IsBusinessOrder, salesChannel: o.SalesChannel,
      }));
      if (includeItems) {
        for (const o of slim.slice(0, 40)) {
          const it = await sp(env, { method: "GET", path: `/orders/v0/orders/${o.orderId}/orderItems` });
          (o as any).items = (it.payload?.OrderItems ?? []).map((x: any) => ({ asin: x.ASIN, sku: x.SellerSKU, title: x.Title, qty: x.QuantityOrdered, price: x.ItemPrice, promo: x.PromotionDiscount }));
        }
      }
      return { count: slim.length, morePages: !!NextToken, orders: slim };
    },
  },
  {
    name: "amazon_run_report",
    description: "Requests an SP-API report, waits for it, downloads it and returns parsed rows (see amazon_guide topic=reports for report types). If it isn't ready in time, returns the reportId — finish with amazon_download_report.",
    inputSchema: schema({
      reportType: s.str("e.g. GET_MERCHANT_LISTINGS_ALL_DATA"),
      dataStartTime: s.str("ISO date/time (for reports that take a range)"),
      dataEndTime: s.str("ISO date/time"),
      reportOptions: s.obj("Report-specific options"),
      marketplaces: s.arr({ type: "string" }, "Marketplace ids or country codes (default: the account default)"),
      waitSeconds: s.int("How long to wait (default 120)"),
      maxRows: s.int("Rows to return (default 200)"),
    }, ["reportType"]),
    run: async ({ reportType, dataStartTime, dataEndTime, reportOptions, marketplaces, waitSeconds = 120, maxRows = 200 }, env) => {
      const marketplaceIds = (marketplaces?.length ? marketplaces : [undefined]).map((m: string | undefined) => resolveMarketplace(env, m));
      const { reportId } = await sp(env, { method: "POST", path: "/reports/2021-06-30/reports", body: { reportType, marketplaceIds, dataStartTime, dataEndTime, reportOptions } });
      const { value: report, finished } = await pollUntil(
        () => sp(env, { method: "GET", path: `/reports/2021-06-30/reports/${reportId}` }),
        (r: any) => ["DONE", "CANCELLED", "FATAL"].includes(r.processingStatus),
        { waitSeconds, intervalSeconds: 10 },
      );
      if (!finished) return { reportId, status: report.processingStatus, note: "Still processing — call amazon_download_report with this reportId shortly." };
      return downloadReport(env, report, maxRows, 0);
    },
  },
  {
    name: "amazon_download_report",
    description: "Downloads and parses an existing report by reportId (or reportDocumentId, e.g. settlement reports from getReports). Use offset to page through big reports.",
    inputSchema: schema({
      reportId: s.str("Report id"),
      reportDocumentId: s.str("Report document id (alternative to reportId)"),
      maxRows: s.int("Rows to return (default 200)"),
      offset: s.int("Skip this many rows"),
    }),
    annotations: { readOnlyHint: true },
    run: async ({ reportId, reportDocumentId, maxRows = 200, offset = 0 }, env) => {
      if (reportDocumentId) return downloadReport(env, { processingStatus: "DONE", reportDocumentId }, maxRows, offset);
      if (!reportId) throw new ToolError("Give reportId or reportDocumentId.");
      const report = await sp(env, { method: "GET", path: `/reports/2021-06-30/reports/${reportId}` });
      return downloadReport(env, report, maxRows, offset);
    },
  },
  {
    name: "amazon_data_kiosk_query",
    description: "Runs a Data Kiosk GraphQL query (sales & traffic by ASIN/date with sessions, page views, conversion, Buy Box %; seller economics), waits, and returns the rows.",
    inputSchema: schema({
      query: s.str(`GraphQL, e.g. query { analytics_salesAndTraffic_2024_04_24 { salesAndTrafficByAsin(startDate:"2025-01-01" endDate:"2025-01-31" aggregateBy:CHILD marketplaceIds:["ATVPDKIKX0DER"]) { childAsin sales { unitsOrdered orderedProductSales { amount } } traffic { sessions pageViews buyBoxPercentage unitSessionPercentage } } } }`),
      waitSeconds: s.int("Default 150"),
      maxRows: s.int("Default 300"),
    }, ["query"]),
    run: async ({ query, waitSeconds = 150, maxRows = 300 }, env) => {
      const { queryId } = await sp(env, { method: "POST", path: "/dataKiosk/2023-11-15/queries", body: { query } });
      const { value: q, finished } = await pollUntil(
        () => sp(env, { method: "GET", path: `/dataKiosk/2023-11-15/queries/${queryId}` }),
        (r: any) => ["DONE", "CANCELLED", "FATAL"].includes(r.processingStatus),
        { waitSeconds, intervalSeconds: 10 },
      );
      if (!finished) return { queryId, status: q.processingStatus, note: "Still running — check later with amazon_call getQuery." };
      const docId = q.dataDocumentId ?? q.errorDocumentId;
      if (!docId) return { queryId, status: q.processingStatus, note: "No data for this query (empty result)." };
      const doc = await sp(env, { method: "GET", path: `/dataKiosk/2023-11-15/documents/${docId}` });
      const text = await downloadDocument(doc.documentUrl);
      return { queryId, status: q.processingStatus, isError: !q.dataDocumentId, pagination: q.pagination, result: parseDocument(text, maxRows) };
    },
  },
  {
    name: "amazon_submit_feed",
    description: "Uploads and submits a feed (e.g. JSON_LISTINGS_FEED for bulk price/quantity/listing changes, POST_FLAT_FILE_* for flat files). Changes the live account — confirm with the owner first. Optionally waits for the processing report.",
    inputSchema: schema({
      feedType: s.str("e.g. JSON_LISTINGS_FEED"),
      content: s.str("Feed body as text (JSON string for JSON_LISTINGS_FEED; tab-separated for flat files)"),
      contentType: s.str("Default application/json; charset=UTF-8"),
      marketplaces: s.arr({ type: "string" }, "Marketplace ids/codes (default account default)"),
      waitSeconds: s.int("Wait for the result document (default 0 = don't wait)"),
    }, ["feedType", "content"]),
    run: async ({ feedType, content, contentType = "application/json; charset=UTF-8", marketplaces, waitSeconds = 0 }, env) => {
      const doc = await sp(env, { method: "POST", path: "/feeds/2021-06-30/documents", body: { contentType } });
      const up = await fetch(doc.url, { method: "PUT", headers: { "content-type": contentType }, body: content });
      if (!up.ok) throw new ToolError(`Feed upload failed: HTTP ${up.status}`);
      const marketplaceIds = (marketplaces?.length ? marketplaces : [undefined]).map((m: string | undefined) => resolveMarketplace(env, m));
      const { feedId } = await sp(env, { method: "POST", path: "/feeds/2021-06-30/feeds", body: { feedType, marketplaceIds, inputFeedDocumentId: doc.feedDocumentId } });
      if (!waitSeconds) return { feedId, note: "Submitted. Check with amazon_call getFeed {feedId}." };
      const { value: feed, finished } = await pollUntil(
        () => sp(env, { method: "GET", path: `/feeds/2021-06-30/feeds/${feedId}` }),
        (f: any) => ["DONE", "CANCELLED", "FATAL"].includes(f.processingStatus),
        { waitSeconds, intervalSeconds: 10 },
      );
      if (!finished || !feed.resultFeedDocumentId) return { feedId, status: feed.processingStatus };
      const rd = await sp(env, { method: "GET", path: `/feeds/2021-06-30/documents/${feed.resultFeedDocumentId}` });
      return { feedId, status: feed.processingStatus, result: parseDocument(await downloadDocument(rd.url, rd.compressionAlgorithm), 500) };
    },
  },
  {
    name: "amazon_wait_operation",
    description: "Waits for an async FBA inbound operation (operationId from createInboundPlan, generate*/confirm* calls) to finish and returns its status and any problems.",
    inputSchema: schema({ operationId: s.str("operationId"), waitSeconds: s.int("Default 90") }, ["operationId"]),
    annotations: { readOnlyHint: true },
    run: async ({ operationId, waitSeconds = 90 }, env) => {
      const { value } = await pollUntil(
        () => sp(env, { method: "GET", path: `/inbound/fba/2024-03-20/operations/${operationId}` }),
        (r: any) => r.operationStatus !== "IN_PROGRESS",
        { waitSeconds, intervalSeconds: 3 },
      );
      return value;
    },
  },
];

async function downloadReport(env: Env, report: any, maxRows: number, offset: number) {
  if (report.processingStatus !== "DONE" || !report.reportDocumentId) {
    let detail: unknown;
    if (report.reportDocumentId) {
      // FATAL reports often carry an error document explaining why.
      const d = await sp(env, { method: "GET", path: `/reports/2021-06-30/documents/${report.reportDocumentId}` });
      detail = parseDocument(await downloadDocument(d.url, d.compressionAlgorithm), 50);
    }
    return { reportId: report.reportId, status: report.processingStatus, detail };
  }
  const d = await sp(env, { method: "GET", path: `/reports/2021-06-30/documents/${report.reportDocumentId}` });
  const text = await downloadDocument(d.url, d.compressionAlgorithm);
  return { reportId: report.reportId, reportType: report.reportType, ...parseDocument(text, maxRows, offset) };
}
