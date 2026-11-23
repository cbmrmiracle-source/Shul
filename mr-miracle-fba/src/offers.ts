// Competitive offers: one shared queue feeds both the repricer and the seller-count monitor.
import type { Store } from "./store";
import { round2 } from "./util";
import { RateLimited } from "./amazon";

export const REASON_REPRICE = 1, REASON_SELLERS = 2, REASON_MANUAL = 4;
const AMAZON_RETAIL = "ATVPDKIKX0DER";

export function enqueueOffers(S: Store, asins: string[], reason: number) {
  const now = Date.now();
  for (const a of new Set(asins.filter(Boolean))) {
    S.run(`INSERT INTO offer_queue (asin, reasons, queued_at) VALUES (?,?,?)
           ON CONFLICT(asin) DO UPDATE SET reasons = offer_queue.reasons | excluded.reasons`, a, reason, now);
  }
}

export interface Offer { sellerId: string; price: number; shipping: number; landed: number; fba: boolean; buyBox: boolean; prime: boolean; feedbackPct: number | null; feedbackCount: number | null }

function parseOffers(payload: any, myId: string) {
  const sum = payload?.Summary || {};
  const offers: Offer[] = (payload?.Offers || []).map((o: any) => {
    const price = o.ListingPrice?.Amount ?? 0, ship = o.Shipping?.Amount ?? 0;
    return {
      sellerId: o.SellerId, price, shipping: ship, landed: round2(price + ship), fba: !!o.IsFulfilledByAmazon,
      buyBox: !!o.IsBuyBoxWinner, prime: !!o.PrimeInformation?.IsPrime,
      feedbackPct: o.SellerFeedbackRating?.SellerPositiveFeedbackRating ?? null, feedbackCount: o.SellerFeedbackRating?.FeedbackCount ?? null,
    };
  });
  const counts = (sum.NumberOfOffers || []).filter((x: any) => /new/i.test(x.condition));
  const fba = counts.filter((x: any) => x.fulfillmentChannel === "Amazon").reduce((s: number, x: any) => s + x.OfferCount, 0);
  const fbm = counts.filter((x: any) => x.fulfillmentChannel !== "Amazon").reduce((s: number, x: any) => s + x.OfferCount, 0);
  const totalOffers = sum.TotalOfferCount ?? offers.length;
  const sellerIds = [...new Set(offers.map((o) => o.sellerId))];
  // "number of sellers": unique seller ids when Amazon gave us the full list, else the offer count
  const sellers = offers.length >= totalOffers ? sellerIds.length : totalOffers;
  const bbPrice = (sum.BuyBoxPrices || []).find((x: any) => /new/i.test(x.condition))?.LandedPrice?.Amount ?? null;
  const bb = offers.find((o) => o.buyBox) || null;
  const mine = offers.find((o) => o.sellerId === myId) || null;
  return { offers, totalOffers, sellers, sellerIds, fba, fbm, bbPrice: bbPrice ?? bb?.landed ?? null, bbSeller: bb?.sellerId ?? null, mine };
}

/** Processes one batch (≤20 ASINs). Amazon allows ~1 batch per 10s. Returns number processed. */
export async function processOfferBatch(S: Store): Promise<number> {
  const last = S.setting("offers_last_batch", 0);
  if (Date.now() - last < 10_500) return 0;
  const rows = S.all(`SELECT asin, reasons FROM offer_queue ORDER BY queued_at LIMIT 20`);
  if (!rows.length) return 0;
  S.setSetting("offers_last_batch", Date.now());
  const r = await S.amz.req("POST", "/batches/products/pricing/v0/itemOffers", null, {
    requests: rows.map((x) => ({
      uri: `/products/pricing/v0/items/${x.asin}/offers`, method: "GET",
      MarketplaceId: S.amz.marketplaceId, ItemCondition: "New", CustomerType: "Consumer",
    })),
  });
  if (r.status === 429) return 0;
  if (r.status >= 300) throw new Error(`itemOffers batch → ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  const myId = S.amz.sellerId;
  const byAsin = new Map<string, any>();
  for (const resp of r.body?.responses || []) {
    const asin = resp.body?.payload?.ASIN || resp.request?.uri?.match(/items\/([^/]+)\/offers/)?.[1];
    if (asin) byAsin.set(asin, resp);
  }
  const now = Date.now();
  for (const row of rows) {
    const resp = byAsin.get(row.asin);
    const code = resp?.status?.statusCode ?? 0;
    if (code === 429) continue; // leave queued, retry next batch
    S.run(`DELETE FROM offer_queue WHERE asin=?`, row.asin);
    if (!resp || code >= 300) {
      S.run(`INSERT INTO offers_latest (asin, ts, error) VALUES (?,?,?) ON CONFLICT(asin) DO UPDATE SET error=excluded.error, ts=excluded.ts`,
        row.asin, now, (resp?.body?.errors?.[0]?.message || `HTTP ${code}`).slice(0, 200));
      continue;
    }
    const o = parseOffers(resp.body.payload, myId);
    const prev = S.one(`SELECT sellers, seller_ids FROM offers_latest WHERE asin=?`, row.asin);
    S.run(`INSERT OR REPLACE INTO offers_latest (asin, ts, total_offers, sellers, fba, fbm, bb_seller, bb_price, our_price, we_have_bb,
             lowest_fba, lowest, seller_ids, offers_json, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      row.asin, now, o.totalOffers, o.sellers, o.fba, o.fbm, o.bbSeller, o.bbPrice, o.mine?.price ?? null,
      o.bbSeller === myId ? 1 : 0,
      minOf(o.offers.filter((x) => x.fba && x.sellerId !== myId).map((x) => x.landed)),
      minOf(o.offers.filter((x) => x.sellerId !== myId).map((x) => x.landed)),
      JSON.stringify(o.sellerIds), JSON.stringify(o.offers));
    if (S.one(`SELECT 1 x FROM tracked_asins WHERE asin=?`, row.asin)) {
      S.run(`INSERT INTO seller_history (asin, ts, sellers, fba, fbm) VALUES (?,?,?,?,?)`, row.asin, now, o.sellers, o.fba, o.fbm);
      if (prev && prev.sellers !== null && prev.sellers !== o.sellers) {
        const before = new Set<string>(JSON.parse(prev.seller_ids || "[]"));
        const after = new Set<string>(o.sellerIds);
        const added = [...after].filter((x) => !before.has(x));
        const removed = [...before].filter((x) => !after.has(x));
        S.run(`INSERT INTO seller_events (ts, asin, old_count, new_count, added, removed, emailed) VALUES (?,?,?,?,?,?,0)`,
          now, row.asin, prev.sellers, o.sellers, JSON.stringify(added), JSON.stringify(removed));
      }
    }
    if (row.reasons & REASON_REPRICE) repriceAsin(S, row.asin, o);
  }
  return rows.length;
}

const minOf = (a: number[]) => (a.length ? Math.min(...a) : null);

// ---------- repricer ----------

export interface Rule {
  id?: number; name: string;
  strategy: "match_bb" | "beat_bb" | "beat_lowest_fba" | "beat_lowest";
  amount: number; amountType: "$" | "%";
  ignoreFbm: boolean; ignoreAmazon: boolean;
  minFeedbackPct: number; minFeedbackCount: number;
  whenWinning: "hold" | "raise";        // we already own the Buy Box
  noCompetition: "max" | "hold";        // nobody else on the listing (after filters)
  belowMin: "min" | "hold";             // target is under our minimum
}

export const DEFAULT_RULES: Rule[] = [
  { name: "Match Buy Box", strategy: "match_bb", amount: 0, amountType: "$", ignoreFbm: true, ignoreAmazon: false, minFeedbackPct: 0, minFeedbackCount: 0, whenWinning: "raise", noCompetition: "max", belowMin: "min" },
  { name: "Beat Buy Box by $0.01", strategy: "beat_bb", amount: 0.01, amountType: "$", ignoreFbm: true, ignoreAmazon: false, minFeedbackPct: 0, minFeedbackCount: 0, whenWinning: "raise", noCompetition: "max", belowMin: "min" },
  { name: "Beat lowest FBA by $0.05", strategy: "beat_lowest_fba", amount: 0.05, amountType: "$", ignoreFbm: true, ignoreAmazon: false, minFeedbackPct: 0, minFeedbackCount: 0, whenWinning: "raise", noCompetition: "max", belowMin: "min" },
];

export function decidePrice(rule: Rule, offers: Offer[], myId: string, current: number, min: number, max: number) {
  let comp = offers.filter((o) => o.sellerId !== myId);
  if (rule.ignoreFbm) comp = comp.filter((o) => o.fba);
  if (rule.ignoreAmazon) comp = comp.filter((o) => o.sellerId !== AMAZON_RETAIL);
  if (rule.minFeedbackPct) comp = comp.filter((o) => o.sellerId === AMAZON_RETAIL || (o.feedbackPct ?? 100) >= rule.minFeedbackPct);
  if (rule.minFeedbackCount) comp = comp.filter((o) => o.sellerId === AMAZON_RETAIL || (o.feedbackCount ?? 0) >= rule.minFeedbackCount);
  const weHaveBB = offers.some((o) => o.sellerId === myId && o.buyBox);
  const off = (p: number) => rule.amountType === "%" ? p * (1 - rule.amount / 100) : p - rule.amount;
  let target: number | null = null, reason = "";

  if (!comp.length) {
    if (rule.noCompetition === "max") { target = max; reason = "No competition → max price"; }
    else return { target: null, reason: "No competition → hold" };
  } else {
    const lowest = Math.min(...comp.map((o) => o.landed));
    const lowestFba = comp.filter((o) => o.fba).map((o) => o.landed);
    const bbOther = comp.find((o) => o.buyBox)?.landed ?? null;
    if (weHaveBB) {
      if (rule.whenWinning === "hold") return { target: null, reason: "We own the Buy Box → hold" };
      target = rule.strategy === "match_bb" ? lowest : off(lowest);
      reason = `Own Buy Box → raise toward lowest competitor $${lowest.toFixed(2)}`;
      if (target <= current) return { target: null, reason: "Own Buy Box, already at best price" };
    } else if (rule.strategy === "match_bb") {
      const ref = bbOther ?? lowest; target = ref; reason = `Match Buy Box $${ref.toFixed(2)}`;
    } else if (rule.strategy === "beat_bb") {
      const ref = bbOther ?? lowest; target = off(ref); reason = `Beat Buy Box $${ref.toFixed(2)}`;
    } else if (rule.strategy === "beat_lowest_fba") {
      const ref = lowestFba.length ? Math.min(...lowestFba) : lowest; target = off(ref); reason = `Beat lowest FBA $${ref.toFixed(2)}`;
    } else {
      target = off(lowest); reason = `Beat lowest $${lowest.toFixed(2)}`;
    }
  }
  target = round2(target!);
  if (target < min) {
    if (rule.belowMin === "hold") return { target: null, reason: reason + ` → below min $${min.toFixed(2)}, hold` };
    target = min; reason += ` → clamped to min`;
  }
  if (target > max) { target = max; reason += ` → clamped to max`; }
  target = round2(target);
  if (Math.abs(target - current) < 0.005) return { target: null, reason: reason + " (no change)" };
  return { target, reason };
}

function repriceAsin(S: Store, asin: string, o: ReturnType<typeof parseOffers>) {
  const cfg = S.setting("repricer", { enabled: false, dryRun: true });
  const skus = S.all(`SELECT r.*, p.price AS list_price FROM reprice_skus r JOIN products p ON p.sku=r.sku
                      WHERE p.asin=? AND r.enabled=1 AND r.rule_id IS NOT NULL AND r.min_price>0 AND r.max_price>0`, asin);
  for (const s of skus) {
    const rule = S.getRule(s.rule_id);
    if (!rule) continue;
    const current = o.mine?.price ?? s.list_price;
    let action = "", newPrice: number | null = null, status = "skip";
    if (!o.mine) { action = "Our offer isn't live on this listing (out of stock?)"; }
    else if (!current) { action = "Unknown current price"; }
    else {
      const d = decidePrice(rule, o.offers, S.amz.sellerId, current, s.min_price, s.max_price);
      action = d.reason;
      if (d.target !== null) {
        newPrice = d.target;
        if (!cfg.enabled || cfg.dryRun) status = "dry-run";
        else {
          S.run(`INSERT INTO price_queue (sku, price, source, user, status, created_at) VALUES (?,?,?,?, 'pending', ?)`, s.sku, newPrice, "repricer", "repricer", Date.now());
          status = "queued";
        }
      }
    }
    S.run(`UPDATE reprice_skus SET last_run=?, last_action=? WHERE sku=?`, Date.now(), (newPrice ? `$${current?.toFixed(2)} → $${newPrice.toFixed(2)}: ` : "") + action, s.sku);
    if (newPrice !== null || S.setting("repricer_log_all", false)) {
      S.run(`INSERT INTO reprice_log (ts, sku, asin, old_price, new_price, bb_price, we_had_bb, reason, status) VALUES (?,?,?,?,?,?,?,?,?)`,
        Date.now(), s.sku, asin, current ?? null, newPrice, o.bbPrice, o.bbSeller === S.amz.sellerId ? 1 : 0, action, status);
    }
  }
}

// ---------- price updates (repricer, manual, bulk) ----------

export async function processPriceQueue(S: Store) {
  const items = S.all(`SELECT * FROM price_queue WHERE status='pending' ORDER BY id LIMIT 8`);
  for (const it of items) {
    if (S.budgetLeft() < 3) return;
    try {
      const listing = await S.amz.getListing(it.sku, "summaries,attributes");
      const productType = listing.summaries?.[0]?.productType || "PRODUCT";
      const existing = (listing.attributes?.purchasable_offer || []).find((x: any) => !x.marketplace_id || x.marketplace_id === S.amz.marketplaceId);
      const offer: any = existing ? JSON.parse(JSON.stringify(existing)) : { marketplace_id: S.amz.marketplaceId, currency: "USD" };
      offer.marketplace_id = S.amz.marketplaceId;
      offer.currency = offer.currency || "USD";
      const minAllowed = offer.minimum_seller_allowed_price?.[0]?.schedule?.[0]?.value_with_tax;
      const maxAllowed = offer.maximum_seller_allowed_price?.[0]?.schedule?.[0]?.value_with_tax;
      if (minAllowed && it.price < minAllowed) throw new Error(`$${it.price} is below the minimum allowed price set in Seller Central ($${minAllowed})`);
      if (maxAllowed && it.price > maxAllowed) throw new Error(`$${it.price} is above the maximum allowed price set in Seller Central ($${maxAllowed})`);
      const oldPrice = offer.our_price?.[0]?.schedule?.[0]?.value_with_tax ?? null;
      offer.our_price = [{ schedule: [{ value_with_tax: round2(it.price) }] }];
      delete offer.audience; // let Amazon default
      const r = await S.amz.patchListing(it.sku, productType, [{ op: "replace", path: "/attributes/purchasable_offer", value: [offer] }]);
      const issues = (r.body?.issues || []).filter((x: any) => x.severity === "ERROR");
      if (r.status >= 300 || r.body?.status === "INVALID" || issues.length) {
        throw new Error(issues.map((x: any) => x.message).join("; ") || JSON.stringify(r.body).slice(0, 300));
      }
      S.run(`UPDATE price_queue SET status='done', done_at=?, old_price=? WHERE id=?`, Date.now(), oldPrice, it.id);
      S.run(`UPDATE products SET price=?, product_type=? WHERE sku=?`, it.price, productType, it.sku);
      S.run(`INSERT INTO price_history (sku, ts, old_price, new_price, source, user) VALUES (?,?,?,?,?,?)`,
        it.sku, Date.now(), oldPrice, it.price, it.source, it.user);
      S.run(`UPDATE reprice_log SET status='applied' WHERE sku=? AND status='queued'`, it.sku);
    } catch (e: any) {
      if (e instanceof RateLimited) return;
      S.run(`UPDATE price_queue SET status='error', error=?, done_at=? WHERE id=?`, String(e.message).slice(0, 500), Date.now(), it.id);
      S.run(`UPDATE reprice_log SET status='error' WHERE sku=? AND status='queued'`, it.sku);
    }
  }
}
