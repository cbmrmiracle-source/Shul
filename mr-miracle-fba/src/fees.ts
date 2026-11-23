// FBA fee change detection + daily email report.
import type { Store } from "./store";
import { emailLayout, emailTable, sendMail } from "./email";
import { addDays, esc, money, tzParts } from "./util";

const changed = (a: any, b: any, tol = 0.001) => (a ?? null) !== (b ?? null) && !(a !== null && b !== null && Math.abs(a - b) <= tol);
const band = (p: number | null) => (p === null ? null : p < 10 ? "under $10" : p <= 50 ? "$10–$50" : "over $50");
const dims = (r: any) => r ? `${r.longest ?? "?"} × ${r.median ?? "?"} × ${r.shortest ?? "?"} ${r.dim_unit || ""}, ${r.weight ?? "?"} ${r.weight_unit || ""}` : "";

/** Compare today's fee snapshot with each SKU's previous snapshot and record changes. */
export function diffFees(S: Store, day: string) {
  const rows = S.all(`SELECT f.*, pl.low_inv_applied AS li, pl.low_inv_exempt AS lie FROM fee_snapshots f LEFT JOIN planning pl ON pl.sku=f.sku WHERE f.day=?`, day);
  let n = 0;
  S.ctx.storage.transactionSync(() => {
    S.run(`DELETE FROM fee_changes WHERE day=?`, day);
    for (const cur of rows) {
      // store today's low-inventory status on the snapshot so tomorrow can compare
      S.run(`UPDATE fee_snapshots SET low_inv=?, low_inv_exempt=? WHERE day=? AND sku=?`, cur.li ?? null, cur.lie ?? null, day, cur.sku);
      const prev = S.one(`SELECT * FROM fee_snapshots WHERE sku=? AND day<? ORDER BY day DESC LIMIT 1`, cur.sku, day);
      if (!prev) continue;
      const dimChanged = changed(cur.longest, prev.longest, 0.01) || changed(cur.median, prev.median, 0.01) || changed(cur.shortest, prev.shortest, 0.01)
        || changed(cur.weight, prev.weight, 0.005) || (cur.size_tier || "") !== (prev.size_tier || "");
      const feeChanged = changed(cur.fulfil_fee, prev.fulfil_fee, 0.004);
      const add = (category: string, note: string) => {
        n++;
        S.run(`INSERT INTO fee_changes (day, sku, asin, category, old_fee, new_fee, old_dims, new_dims, old_tier, new_tier, old_price, new_price, note, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          day, cur.sku, cur.asin, category, prev.fulfil_fee, cur.fulfil_fee, dims(prev), dims(cur), prev.size_tier, cur.size_tier,
          prev.price, cur.price, note, Date.now());
      };
      if (dimChanged) add("dimensions", feeChanged ? "Amazon re-measured the item; fulfillment fee changed" : "Amazon re-measured the item; fee unchanged");
      else if (feeChanged && band(prev.price) !== band(cur.price)) add("price_band", `Price moved from ${band(prev.price)} to ${band(cur.price)} fee band`);
      else if (feeChanged) add("rate", "Fee changed with no dimension or price-band change (Amazon rate change)");
      const prevLi = (prev.low_inv || "").trim(), curLi = (cur.li || "").trim();
      if (curLi && prevLi && curLi !== prevLi) {
        add("low_inventory", /yes/i.test(curLi) ? "Low-inventory-level fee now APPLIED this week" : "Low-inventory-level fee no longer applied");
      }
    }
  });
  S.setSetting("fees_diff_day", day);
  S.log("fees", `Fee changes for ${day}: ${n}`);
  return n;
}

export function feeChanges(S: Store, from: string, to: string) {
  return S.all(`SELECT c.*, p.title, p.image, COALESCE(p.is_mrm, p.mrm_auto, 0) AS mrm, sd.units30
                FROM fee_changes c LEFT JOIN products p ON p.sku=c.sku
                LEFT JOIN (SELECT sku, SUM(units) units30 FROM sales_daily WHERE day > ? GROUP BY sku) sd ON sd.sku=c.sku
                WHERE c.day>=? AND c.day<=? ORDER BY c.day DESC, c.category, ABS(COALESCE(c.new_fee,0)-COALESCE(c.old_fee,0)) DESC`,
    addDays(to, -30), from, to);
}

export const DEFAULT_FEE_EMAIL = {
  enabled: true, days: [1, 2, 3, 4, 5], hour: 8,
  categories: ["dimensions", "low_inventory", "rate", "price_band"],
  products: "all" as "all" | "mrm" | "non_mrm", minDelta: 0, includeLowInvList: true, includeUnchanged: false,
  recipients: [] as string[],
};

const CAT_LABEL: Record<string, string> = {
  dimensions: "Dimension / weight change", low_inventory: "Low-inventory-level fee", rate: "Fee rate change", price_band: "Price-band change",
};

export function buildFeeEmail(S: Store, cfg: typeof DEFAULT_FEE_EMAIL, from: string, to: string) {
  let rows = feeChanges(S, from, to).filter((r) => cfg.categories.includes(r.category));
  if (cfg.products === "mrm") rows = rows.filter((r) => r.mrm);
  if (cfg.products === "non_mrm") rows = rows.filter((r) => !r.mrm);
  if (cfg.minDelta > 0) rows = rows.filter((r) => r.category === "low_inventory" || Math.abs((r.new_fee ?? 0) - (r.old_fee ?? 0)) >= cfg.minDelta);
  const link = S.publicOrigin() ? S.publicOrigin() + "/#/fees" : undefined;
  let html = `<p style="margin-top:0">Fee changes detected ${from === to ? "on " + from : `from ${from} to ${to}`}: <b>${rows.length}</b></p>`;
  for (const cat of cfg.categories) {
    const list = rows.filter((r) => r.category === cat);
    if (!list.length) continue;
    html += `<h3 style="margin:22px 0 8px;font-size:16px">${CAT_LABEL[cat]} (${list.length})</h3>`;
    if (cat === "dimensions") {
      html += emailTable(["Date", "SKU / ASIN", "Old dimensions", "New dimensions", "Size tier", "Fee", "Units 30d"],
        list.map((r) => [r.day, `<b>${esc(r.sku)}</b><br><span style="color:#5b6575">${r.asin}</span>`, esc(r.old_dims), `<b>${esc(r.new_dims)}</b>`,
          r.old_tier === r.new_tier ? esc(r.new_tier) : `${esc(r.old_tier)} → <b>${esc(r.new_tier)}</b>`, feeCell(r), r.units30 ?? 0]));
    } else if (cat === "low_inventory") {
      html += emailTable(["Date", "SKU / ASIN", "Status", "Units 30d"],
        list.map((r) => [r.day, `<b>${esc(r.sku)}</b><br><span style="color:#5b6575">${r.asin}</span>`, esc(r.note), r.units30 ?? 0]));
    } else {
      html += emailTable(["Date", "SKU / ASIN", "Price", "Fee", "Note", "Units 30d"],
        list.map((r) => [r.day, `<b>${esc(r.sku)}</b><br><span style="color:#5b6575">${r.asin}</span>`, `${money(r.old_price)} → ${money(r.new_price)}`, feeCell(r), esc(r.note), r.units30 ?? 0]));
    }
  }
  if (cfg.includeLowInvList) {
    const li = S.all(`SELECT pl.sku, pl.asin, pl.hist_dos, pl.min_level, pl.health, p.title FROM planning pl LEFT JOIN products p ON p.sku=pl.sku
                      WHERE pl.low_inv_applied LIKE 'Y%' ORDER BY pl.sku`);
    if (li.length) {
      html += `<h3 style="margin:22px 0 8px;font-size:16px">SKUs currently paying the low-inventory-level fee (${li.length})</h3>`;
      html += emailTable(["SKU / ASIN", "Historical days of supply", "Min level", "Health"],
        li.map((r) => [`<b>${esc(r.sku)}</b><br><span style="color:#5b6575">${r.asin}</span>`, r.hist_dos ?? "—", r.min_level ?? "—", esc(r.health)]));
    }
  }
  if (!rows.length && !cfg.includeUnchanged) html += `<p style="color:#5b6575">No fee changes matched your report settings.</p>`;
  return { subject: `FBA fee changes ${to}: ${rows.length} change${rows.length === 1 ? "" : "s"}`, html: emailLayout("Daily FBA fee report", html, link), count: rows.length };
}

function feeCell(r: any) {
  const d = (r.new_fee ?? 0) - (r.old_fee ?? 0);
  const color = d > 0 ? "#b42318" : d < 0 ? "#067647" : "#5b6575";
  return `${money(r.old_fee)} → <b>${money(r.new_fee)}</b> <span style="color:${color}">(${d >= 0 ? "+" : ""}${d.toFixed(2)})</span>`;
}

/** Called every tick; sends the daily report if it's due. */
export async function maybeSendFeeEmail(S: Store) {
  const cfg = { ...DEFAULT_FEE_EMAIL, ...S.setting("fee_email", {}) };
  if (!cfg.enabled) return;
  const tz = S.tz();
  const p = tzParts(Date.now(), tz);
  const localDay = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  if (!cfg.days.includes(p.wd) || p.h < cfg.hour) return;
  if (S.setting("fee_email_sent_day", "") === localDay) return;
  // wait (up to 3 hours past send time) for today's fee comparison to finish
  const diffDay: string = S.setting("fees_diff_day", "");
  if (diffDay < S.salesToday() && p.h < cfg.hour + 3) return;
  const lastSent: string = S.setting("fee_email_last_covered", "");
  const to = diffDay || S.salesToday();
  const from = lastSent && lastSent < to ? addDays(lastSent, 1) : to;
  const recipients = cfg.recipients.length ? cfg.recipients : S.alertRecipients();
  const m = buildFeeEmail(S, cfg, from, to);
  S.setSetting("fee_email_sent_day", localDay);
  try {
    await sendMail(S.secretGetter(), { to: recipients, subject: m.subject, html: m.html });
    S.setSetting("fee_email_last_covered", to);
    S.mailLog("fees", m.subject, "sent");
  } catch (e: any) {
    S.mailLog("fees", m.subject, "error", e.message);
  }
}
