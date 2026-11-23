// Product image updates via the Listings Items API.
import type { Store } from "./store";
import { randomToken } from "./util";

export const SLOTS = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08", "SWCH"] as const;
const ATTR: Record<string, string> = {
  MAIN: "main_product_image_locator", SWCH: "swatch_product_image_locator",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`PT0${i}`, `other_product_image_locator_${i}`])),
};

/** Current images for an ASIN from the catalog, grouped by slot (largest version). */
export async function currentImages(S: Store, asin: string) {
  const b = await S.amz.ok("GET", `/catalog/2022-04-01/items/${asin}`, { marketplaceIds: S.amz.marketplaceId, includedData: "images,summaries" });
  const imgs = (b.images || []).find((x: any) => x.marketplaceId === S.amz.marketplaceId)?.images || b.images?.[0]?.images || [];
  const best: Record<string, any> = {};
  for (const im of imgs) if (!best[im.variant] || im.width > best[im.variant].width) best[im.variant] = im;
  return { title: b.summaries?.[0]?.itemName || "", images: best };
}

export async function storeUpload(S: Store, file: File) {
  if (!/^image\/(jpeg|png|tiff|gif)$/.test(file.type)) throw new Error("Use a JPEG, PNG, TIFF or GIF image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image must be under 10 MB.");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/tiff": "tif", "image/gif": "gif" }[file.type];
  const key = `${randomToken(12)}.${ext}`;
  await S.env.IMAGES.put(key, await file.arrayBuffer(), { metadata: { type: file.type, name: file.name }, expirationTtl: 60 * 86400 });
  return { key, url: `${S.publicOrigin()}/img/${key}` };
}

export function queueImageJob(S: Store, sku: string, asin: string, slots: Record<string, string | null>, user: string) {
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (!(SLOTS as readonly string[]).includes(k)) throw new Error(`Unknown image slot ${k}`);
    if (v !== null && !/^https:\/\//.test(v)) throw new Error(`Image for ${k} must be an https:// URL`);
    clean[k] = v;
  }
  if (!Object.keys(clean).length) throw new Error("No image changes selected.");
  if (clean.MAIN === null) throw new Error("The main image can be replaced but not removed.");
  S.run(`INSERT INTO image_jobs (sku, asin, slots, status, user, created_at) VALUES (?,?,?,'pending',?,?)`, sku, asin, JSON.stringify(clean), user, Date.now());
}

export async function processImageJobs(S: Store) {
  const job = S.one(`SELECT * FROM image_jobs WHERE status='pending' ORDER BY id LIMIT 1`);
  if (!job || S.budgetLeft() < 3) return;
  try {
    const listing = await S.amz.getListing(job.sku, "summaries");
    const productType = listing.summaries?.[0]?.productType || "PRODUCT";
    const slots = JSON.parse(job.slots);
    const mp = S.amz.marketplaceId;
    const patches = Object.entries(slots).map(([slot, url]) => url === null
      ? { op: "delete", path: `/attributes/${ATTR[slot]}`, value: [{ marketplace_id: mp }] }
      : { op: "replace", path: `/attributes/${ATTR[slot]}`, value: [{ marketplace_id: mp, media_location: url }] });
    const r = await S.amz.patchListing(job.sku, productType, patches);
    const issues = r.body?.issues || [];
    const ok = r.status < 300 && r.body?.status === "ACCEPTED" && !issues.some((x: any) => x.severity === "ERROR");
    S.run(`UPDATE image_jobs SET status=?, result=?, submission_id=?, done_at=? WHERE id=?`,
      ok ? "accepted" : "error",
      ok ? "Accepted by Amazon — images usually appear on the listing within 15 minutes to a few hours."
        : (issues.map((x: any) => `${x.severity}: ${x.message}`).join("\n") || JSON.stringify(r.body).slice(0, 500)),
      r.body?.submissionId || null, Date.now(), job.id);
  } catch (e: any) {
    S.run(`UPDATE image_jobs SET status='error', result=?, done_at=? WHERE id=?`, String(e.message).slice(0, 500), Date.now(), job.id);
  }
}
