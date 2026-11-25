// The single Durable Object that owns all data (SQLite), the API, auth, and the background scheduler.
import { DurableObject } from "cloudflare:workers";
import { Amazon, RateLimited } from "./amazon";
import { MIGRATIONS, SCHEMA } from "./schema";
import { emailLayout, emailProvider, emailTable, sendMail } from "./email";
import { BACKFILL_DAYS, pendingReport, pollReports, requestOrders, requestReport, syncCatalog, syncInventory } from "./sync";
import { DEFAULT_RULES, REASON_MANUAL, REASON_REPRICE, REASON_SELLERS, enqueueOffers, processOfferBatch, processPriceQueue, type Rule } from "./offers";
import { DEFAULT_FEE_EMAIL, buildFeeEmail, diffFees, feeChanges, maybeSendFeeEmail } from "./fees";
import { DEFAULT_INV_SETTINGS, compareRanges, inventoryRows, priceAnalysis, productMeta, resolveSkus, salesGrid, salesReport } from "./analysis";
import { currentImages, processImageJobs, queueImageJob, storeUpload } from "./images";
import { DEFAULT_TARGET, ShipError, WAREHOUSE_ACTIONS, createDraft, defaultAddress, getPlan, knownWarehouses, normTarget, ownersFor, parseLines, recentAddresses, runTargeting, setItems, shipmentLabels, step as shipStep, unitLabels } from "./shipping";
import { SALES_TZ, addDays, esc, hashPassword, num, parseCsv, randomToken, round2, safeEqual, today } from "./util";


const SECRET_KEYS = ["COMMERCE_MCP_SECRET", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY"];
const MIN = 60_000, HOUR = 3_600_000;
const ROLES = ["admin", "manager", "warehouse", "viewer"];

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export class Store extends DurableObject {
  sql: SqlStorage;
  amz: Amazon;
  declare ctx: DurableObjectState;
  declare env: any;
  private budget = 0;
  private secretsCache: Record<string, string> | null = null;
  private rulesCache: Map<number, Rule> | null = null;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx = ctx; this.env = env;
    this.sql = ctx.storage.sql;
    // Startup must never fail, even when Cloudflare's daily storage-write limit is used up: then the
    // upgrade simply waits for the next start.
    const limitHit = (e: any) => /rows written|exceeded|limit/i.test(String(e?.message || e));
    try { this.sql.exec(SCHEMA); } catch (e) { if (!limitHit(e)) throw e; }
    let v = 0;
    try { v = Number(this.one(`SELECT v FROM settings WHERE k='schema_version'`)?.v || 0); } catch { /* fresh */ }
    upgrade: for (let i = v; i < MIGRATIONS.length; i++) {
      for (const m of MIGRATIONS[i]) {
        try { this.sql.exec(m); } catch (e) { if (limitHit(e)) break upgrade; /* else: already applied */ }
      }
      try { this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('schema_version', ?)`, String(i + 1)); v = i + 1; }
      catch { break; }
    }
    this.schemaVersion = v;
    this.amz = new Amazon(env, (k) => this.secret(k));
    try {
      if (!this.one(`SELECT 1 x FROM reprice_rules LIMIT 1`)) {
        for (const r of DEFAULT_RULES) this.run(`INSERT INTO reprice_rules (name, json) VALUES (?,?)`, r.name, JSON.stringify(r));
      }
    } catch { /* storage limit: seeded on a later start */ }
  }

  // ---------- sql helpers ----------
  all(q: string, ...p: any[]): any[] { return [...this.sql.exec(q, ...p)]; }
  one(q: string, ...p: any[]): any { return this.all(q, ...p)[0]; }
  /** Rows written this invocation (Cloudflare bills/limits Durable Object storage by rows written). */
  writes = 0;
  schemaVersion = 0;
  /** Daily totals table, or an equivalent live query until the upgrade that creates it has run. */
  get totals() { return this.schemaVersion >= 2 ? "sales_totals" : "(SELECT day, SUM(units) units, SUM(revenue) revenue FROM sales_daily GROUP BY day)"; }
  run(q: string, ...p: any[]) {
    const c = this.sql.exec(q, ...p);
    for (const _ of c) { /* drain */ }
    this.writes += c.rowsWritten;
  }
  /** In-memory work queue / timestamps (rebuilt by the scheduler if the object restarts). */
  offerQueue = new Map<string, { reasons: number; queuedAt: number }>();
  checkedAt = new Map<string, number>();

  writeBudget() { return Number(this.env.DAILY_WRITE_BUDGET || 70_000); }
  writesToday() {
    const s = this.setting<any>("writes", null);
    const d = new Date().toISOString().slice(0, 10);
    return (s && s.day === d ? s.n : 0) + this.writes;
  }
  overBudget(frac: number) { return this.writesToday() > this.writeBudget() * frac; }
  persistWrites() {
    if (!this.writes) return;
    const d = new Date().toISOString().slice(0, 10);
    const s = this.setting<any>("writes", null);
    const n = (s && s.day === d ? s.n : 0) + this.writes + 1;
    this.writes = 0;
    try { this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('writes', ?)`, JSON.stringify({ day: d, n })); } catch { /* limit */ }
  }

  setting<T = any>(k: string, def: T): T {
    const r = this.one(`SELECT v FROM settings WHERE k=?`, k);
    if (!r) return def;
    try { return JSON.parse(r.v); } catch { return def; }
  }
  setSetting(k: string, v: any) {
    if (v === null || v === undefined) this.run(`DELETE FROM settings WHERE k=?`, k);
    else this.run(`INSERT OR REPLACE INTO settings (k, v) VALUES (?,?)`, k, JSON.stringify(v));
  }
  secret(k: string): string | null {
    if (this.env[k]) return this.env[k];
    if (!this.secretsCache) this.secretsCache = this.setting("secrets", {});
    return this.secretsCache![k] || null;
  }
  secretGetter() { return (k: string) => this.secret(k); }
  log(area: string, msg: string) {
    try { this.run(`INSERT INTO logs (ts, area, msg) VALUES (?,?,?)`, Date.now(), area, String(msg).slice(0, 1000)); } catch { console.error(area, msg); }
  }
  mailLog(kind: string, subject: string, status: string, error?: string) {
    try { this.run(`INSERT INTO email_log (ts, kind, subject, status, error) VALUES (?,?,?,?,?)`, Date.now(), kind, subject, status, error ?? null); } catch { /* storage limit */ }
  }
  audit(user: string, action: string, detail: any) {
    try { this.auditRaw(user, action, detail); } catch { /* storage limit */ }
  }
  private auditRaw(user: string, action: string, detail: any) {
    this.run(`INSERT INTO audit (ts, user, action, detail) VALUES (?,?,?,?)`, Date.now(), user, action, typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 2000));
  }
  tz(): string { return this.setting("timezone", "America/New_York"); }
  salesToday() { return today(SALES_TZ); }
  publicOrigin(): string { return this.setting("public_origin", ""); }
  alertRecipients(): string[] {
    const r = this.setting<string[]>("alert_emails", []);
    if (r.length) return r;
    const g = this.secret("GMAIL_USER");
    return g ? [g] : [];
  }
  budgetLeft() { return this.budget - this.amz.calls; }
  getRule(id: number): Rule | null {
    if (!this.rulesCache) this.rulesCache = new Map(this.all(`SELECT id, json FROM reprice_rules`).map((r) => [r.id, { ...JSON.parse(r.json), id: r.id }]));
    return this.rulesCache.get(id) || null;
  }
  feesDiffIfReady(day: string) {
    const fees = this.one(`SELECT 1 x FROM report_jobs WHERE kind='fees' AND status='done' AND params LIKE ?`, `%"${day}"%`);
    const plan = this.one(`SELECT 1 x FROM report_jobs WHERE kind='planning' AND status IN ('done','error','empty') AND params LIKE ?`, `%"${day}"%`);
    if (fees && plan) diffFees(this, day);
  }

  // ---------- scheduler ----------

  async ensureAlarm(ms = 5_000) {
    try {
      const cur = await this.ctx.storage.getAlarm();
      if (!cur || cur > Date.now() + ms) await this.ctx.storage.setAlarm(Date.now() + ms);
    } catch { /* storage limit */ }
  }

  async alarm() {
    this.budget = this.env.SUBREQUEST_BUDGET ? Number(this.env.SUBREQUEST_BUDGET) : 40;
    this.amz.calls = 0;
    let busy = false;
    try {
      if (this.amz.mode()) busy = await this.tick();
    } catch (e: any) {
      this.log("scheduler", e.message || String(e));
    } finally {
      this.persistWrites();
      try { await this.ctx.storage.setAlarm(Date.now() + (busy ? 11_000 : this.overBudget(1) ? 15 * 60_000 : 60_000)); } catch { /* storage limit; cron retries */ }
    }
  }

  private due(name: string, every: number): boolean {
    const r = this.one(`SELECT last_run FROM jobs_state WHERE name=?`, name);
    return !r || Date.now() - r.last_run >= every;
  }
  private mark(name: string, ok = true, info = "") {
    this.run(`INSERT INTO jobs_state (name, last_run, last_ok, info) VALUES (?,?,?,?)
              ON CONFLICT(name) DO UPDATE SET last_run=excluded.last_run, last_ok=CASE WHEN ? THEN excluded.last_run ELSE jobs_state.last_ok END, info=excluded.info`,
      name, Date.now(), ok ? Date.now() : null, info, ok ? 1 : 0);
  }
  private async task(name: string, every: number, fn: () => Promise<string | void | boolean>, writeFrac = 0.85) {
    if (!this.due(name, every) || this.budgetLeft() < 4 || this.overBudget(writeFrac)) return;
    try {
      const r = await fn();
      if (r === false) return; // unfinished multi-tick job: don't mark, continue next tick
      this.mark(name, true, typeof r === "string" ? r : "");
    } catch (e: any) {
      if (e instanceof RateLimited) return;
      this.mark(name, false, String(e.message || e).slice(0, 300));
      this.log(name, e.message || String(e));
    }
  }

  /** One scheduler pass. Returns true if there is queued work that should run again soon. */
  async tick(): Promise<boolean> {
    const d = this.salesToday();
    await pollReports(this);

    await this.task("listings", 12 * HOUR, async () => {
      if (pendingReport(this, "listings")) return false;
      await requestReport(this, "listings", "GET_MERCHANT_LISTINGS_ALL_DATA");
      return "requested";
    });
    await this.task("orders_recent", HOUR, async () => {
      if (pendingReport(this, "orders_recent")) return false;
      await requestOrders(this, "orders_recent", addDays(d, -2), d);
      return "requested";
    }, 0.95);
    await this.task("orders_refresh", 24 * HOUR, async () => {
      if (pendingReport(this, "orders_refresh")) return false;
      await requestOrders(this, "orders_refresh", addDays(d, -20), addDays(d, -3));
      return "requested";
    });
    // two-year history backfill, one 30-day window at a time
    let bf = this.setting<any>("backfill", null);
    if (!bf) { bf = { cursor: addDays(d, -3), until: addDays(d, -BACKFILL_DAYS) }; this.setSetting("backfill", bf); }
    // history import pauses once half of today's storage-write budget is used (resumes after midnight UTC)
    if (bf.cursor >= bf.until && !pendingReport(this, "orders_backfill") && this.budgetLeft() > 4 && !this.overBudget(0.5)) {
      const from = addDays(bf.cursor, -29) < bf.until ? bf.until : addDays(bf.cursor, -29);
      try { await requestOrders(this, "orders_backfill", from, bf.cursor); }
      catch (e: any) { if (!(e instanceof RateLimited)) this.log("backfill", e.message); }
    }
    await this.task("inventory", HOUR, async () => (await syncInventory(this)) ? "complete" : false);
    await this.task("catalog", 6 * HOUR, async () => (await syncCatalog(this)) ? "complete" : false);
    await this.task("fees", 24 * HOUR, async () => {
      if (pendingReport(this, "fees") || pendingReport(this, "planning")) return false;
      const start = new Date(Date.now() - 60 * 86_400_000).toISOString();
      await requestReport(this, "planning", "GET_FBA_INVENTORY_PLANNING_DATA", { day: d });
      await requestReport(this, "fees", "GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA", { day: d }, start, new Date(Date.now() - 60_000).toISOString());
      return "requested";
    });
    await this.task("reprice", 15 * MIN, async () => {
      const asins = this.all(`SELECT DISTINCT p.asin FROM reprice_skus r JOIN products p ON p.sku=r.sku
                              WHERE r.enabled=1 AND r.rule_id IS NOT NULL AND COALESCE(p.is_mrm, p.mrm_auto, 0)=0`).map((r) => r.asin);
      enqueueOffers(this, asins, REASON_REPRICE);
      return `${asins.length} ASINs queued`;
    }, 0.97);
    const sellerCfg = this.setting("seller_alerts", { enabled: true, intervalMin: 30 });
    await this.task("sellers", (sellerCfg.intervalMin || 30) * MIN, async () => {
      const asins = this.all(`SELECT asin FROM tracked_asins`).map((r) => r.asin);
      enqueueOffers(this, asins, REASON_SELLERS);
      return `${asins.length} ASINs queued`;
    }, 0.97);

    await this.task("ship_target", 5 * MIN, async () => { await runTargeting(this); return ""; }, 0.97);
    try { await processOfferBatch(this); } catch (e: any) { if (!(e instanceof RateLimited)) this.log("offers", e.message); }
    await processPriceQueue(this);
    await processImageJobs(this);
    await this.maybeSendSellerAlerts();
    await maybeSendFeeEmail(this);
    if (this.due("cleanup", 24 * HOUR)) this.cleanup();

    return !!(this.offerQueue.size || this.one(`SELECT 1 x FROM price_queue WHERE status='pending' LIMIT 1`)
      || this.one(`SELECT 1 x FROM image_jobs WHERE status='pending' LIMIT 1`) || this.one(`SELECT 1 x FROM report_jobs WHERE status IN ('requested','processing') LIMIT 1`)
      || this.setting("inv_pass", null));
  }

  cleanup() {
    const cut = Date.now() - 90 * 86_400_000;
    this.run(`DELETE FROM reprice_log WHERE ts < ?`, Date.now() - 30 * 86_400_000);
    this.run(`DELETE FROM logs WHERE ts < ?`, cut);
    this.run(`DELETE FROM seller_history WHERE ts < ?`, Date.now() - 180 * 86_400_000);
    this.run(`DELETE FROM report_jobs WHERE created_at < ?`, cut);
    this.run(`DELETE FROM login_fail WHERE ts < ?`, Date.now() - HOUR);
    this.run(`DELETE FROM price_queue WHERE status<>'pending' AND created_at < ?`, cut);
    this.mark("cleanup");
  }

  async maybeSendSellerAlerts() {
    const cfg = { enabled: true, recipients: [] as string[], ...this.setting("seller_alerts", {}) };
    const evs = this.all(`SELECT e.*, p.title FROM seller_events e LEFT JOIN products p ON p.asin=e.asin WHERE e.emailed=0 GROUP BY e.id ORDER BY e.ts`);
    if (!evs.length) return;
    const ids = evs.map((e) => e.id);
    const mark = (v: number) => this.run(`UPDATE seller_events SET emailed=? WHERE id IN (${ids.map(() => "?").join(",")})`, v, ...ids);
    if (!cfg.enabled || !emailProvider(this.secretGetter())) { mark(2); return; }
    if (this.offerQueue.size && Date.now() - evs[0].ts < 10 * MIN) return; // batch a full pass into one email
    const sellerLink = (id: string) => `<a href="https://www.amazon.com/sp?seller=${id}">${id}</a>`;
    const rows = evs.map((e) => {
      const added = JSON.parse(e.added || "[]"), removed = JSON.parse(e.removed || "[]");
      const diff = e.new_count - e.old_count;
      return [
        new Date(e.ts).toLocaleString("en-US", { timeZone: this.tz(), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        `<a href="https://www.amazon.com/dp/${e.asin}"><b>${e.asin}</b></a><br><span style="color:#5b6575">${esc((e.title || "").slice(0, 70))}</span>`,
        `${e.old_count} → <b>${e.new_count}</b> <span style="color:${diff > 0 ? "#b42318" : "#067647"}">(${diff > 0 ? "+" : ""}${diff})</span>`,
        added.map(sellerLink).join("<br>") || "—", removed.map(sellerLink).join("<br>") || "—",
      ];
    });
    const subject = evs.length === 1
      ? `Seller count changed on ${evs[0].asin}: ${evs[0].old_count} → ${evs[0].new_count}`
      : `Seller count changed on ${new Set(evs.map((e) => e.asin)).size} listings`;
    const html = emailLayout("Seller count alert", emailTable(["When", "Listing", "Sellers", "New sellers", "Left"], rows),
      this.publicOrigin() ? this.publicOrigin() + "/#/sellers" : undefined);
    try {
      await sendMail(this.secretGetter(), { to: cfg.recipients.length ? cfg.recipients : this.alertRecipients(), subject, html });
      mark(1); this.mailLog("sellers", subject, "sent");
    } catch (e: any) {
      mark(3); this.mailLog("sellers", subject, "error", e.message);
    }
  }

  // ---------- HTTP API ----------

  async fetch(request: Request): Promise<Response> {
    this.budget = 25; this.amz.calls = 0;
    const url = new URL(request.url);
    await this.ensureAlarm(30_000);
    if (url.pathname === "/internal/cron") return Response.json({ ok: true });
    if (url.protocol === "https:" && this.publicOrigin() !== url.origin) { try { this.setSetting("public_origin", url.origin); } catch { /* limit */ } }
    try {
      const out = await this.route(request, url);
      this.persistWrites();
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e: any) {
      if (/rows written|exceeded allowed/i.test(String(e?.message))) {
        return Response.json({ error: "Cloudflare's free daily storage limit is used up, so changes can't be saved until midnight UTC. Viewing still works. (Upgrading to Workers Paid removes this limit.)" }, { status: 503 });
      }
      const status = e instanceof HttpError ? e.status : e instanceof ShipError ? 400 : 500;
      if (status === 500) this.log("api", `${request.method} ${url.pathname}: ${e.stack || e.message}`);
      return Response.json({ error: e.message || String(e) }, { status });
    }
  }

  // Sessions are signed cookies (no database write needed to sign in). Changing a user's password or
  // deactivating/deleting them invalidates their cookie, because the signature covers part of the password hash.
  private async sign(data: string) {
    const secret = this.env.SESSION_SECRET || this.env.SETUP_CODE || "mr-miracle-fba";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  private async makeToken(u: any) {
    const exp = Date.now() + 30 * 86_400_000;
    return `${u.id}.${exp}.${await this.sign(`${u.id}.${exp}.${u.pass_hash.slice(0, 24)}`)}`;
  }
  private async session(request: Request) {
    const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)mmfba=(\d+)\.(\d+)\.([a-f0-9]{64})/);
    if (!m || Number(m[2]) < Date.now()) return null;
    const u = this.one(`SELECT * FROM users WHERE id=? AND active=1`, Number(m[1]));
    if (!u) return null;
    const expect = await this.sign(`${u.id}.${m[2]}.${u.pass_hash.slice(0, 24)}`);
    return safeEqual(expect, m[3]) ? u : null;
  }

  private cookie(token: string, maxAge: number) {
    return `mmfba=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }

  private async login(email: string, password: string) {
    email = (email || "").trim().toLowerCase();
    const fails = this.one(`SELECT COUNT(*) n FROM login_fail WHERE email=? AND ts>?`, email, Date.now() - 15 * MIN).n;
    if (fails >= 8) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
    const u = this.one(`SELECT * FROM users WHERE email=? AND active=1`, email);
    const h = await hashPassword(password || "", u?.salt);
    if (!u || !safeEqual(h.hash, u.pass_hash)) {
      try { this.run(`INSERT INTO login_fail (email, ts) VALUES (?,?)`, email, Date.now()); } catch { /* storage limit */ }
      throw new HttpError(401, "Wrong email or password.");
    }
    const token = await this.makeToken(u);
    try { this.run(`UPDATE users SET last_login=? WHERE id=?`, Date.now(), u.id); } catch { /* storage limit: not critical */ }
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": this.cookie(token, 30 * 86400) } });
  }

  private async route(request: Request, url: URL): Promise<any> {
    const method = request.method;
    const path = url.pathname.replace(/\/+$/, "");
    const q = url.searchParams;
    const body = async () => { try { return await request.json<any>(); } catch { return {}; } };

    // ----- public -----
    if (path === "/api/setup-status") return { needsSetup: !this.one(`SELECT 1 x FROM users LIMIT 1`) };
    if (path === "/api/setup" && method === "POST") {
      if (this.one(`SELECT 1 x FROM users LIMIT 1`)) throw new HttpError(400, "Already set up.");
      const b = await body();
      if (!this.env.SETUP_CODE || !safeEqual(String(b.code || "").trim(), this.env.SETUP_CODE)) throw new HttpError(403, "Wrong setup code.");
      await this.createUser(b.email, b.name, "admin", b.password);
      return this.login(b.email, b.password);
    }
    if (path === "/api/login" && method === "POST") { const b = await body(); return this.login(b.email, b.password); }

    const me = await this.session(request);
    if (!me) throw new HttpError(401, "Please sign in.");
    if (path === "/api/logout" && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": this.cookie("", 0) } });
    }
    if (path === "/api/me") return { id: me.id, email: me.email, name: me.name, role: me.role };
    if (path === "/api/me/password" && method === "PUT") {
      const b = await body();
      const h = await hashPassword(b.current || "", me.salt);
      if (!safeEqual(h.hash, me.pass_hash)) throw new HttpError(400, "Current password is wrong.");
      await this.setPassword(me.id, b.password);
      return { ok: true };
    }
    const write = method !== "GET";
    if (write && me.role === "viewer") throw new HttpError(403, "View-only account.");
    if (me.role === "warehouse") {
      const okRead = /^\/api\/(products|inventory|inv-errors|ship\/|labels\/)/.test(path);
      const okWrite = /^\/api\/ship\/(plans(\/\d+(\/items)?)?|parse)$/.test(path) || /^\/api\/ship\/plans\/\d+\/step$/.test(path);
      if (!write && !okRead) throw new HttpError(403, "Warehouse accounts can use Inventory and Shipping only.");
      if (write && !okWrite) throw new HttpError(403, "Warehouse accounts can't change this.");
      if (write && /\/step$/.test(path)) {
        const peek = await request.clone().json<any>().catch(() => ({}));
        if (!WAREHOUSE_ACTIONS.has(peek.action)) throw new HttpError(403, "Only a manager or admin can do this step (it involves Amazon fees).");
      }
      if (method === "DELETE") throw new HttpError(403, "Warehouse accounts can't delete.");
    }
    const admin = () => { if (me.role !== "admin") throw new HttpError(403, "Admins only."); };
    const who = me.email;
    const list = (s: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : null);
    const d = this.salesToday();

    // ----- dashboard -----
    if (path === "/api/dashboard") return this.dashboard();

    // ----- products -----
    if (path === "/api/products" && method === "GET") {
      return this.all(`SELECT p.sku, p.asin, p.title, p.image, p.price, p.status, p.fulfillment, p.brand, p.cogs, p.discontinued, p.direct_fba,
                        p.errors, p.is_mrm, p.mrm_auto, COALESCE(p.is_mrm, p.mrm_auto, 0) mrm, COALESCE(s.u30,0) units30
                       FROM products p LEFT JOIN (SELECT sku, SUM(units) u30 FROM sales_daily WHERE day > ? GROUP BY sku) s ON s.sku=p.sku
                       ORDER BY units30 DESC, p.sku`, addDays(d, -30));
    }
    if (path === "/api/products" && method === "PATCH") {
      const b = await body();
      const items: any[] = Array.isArray(b) ? b : [b];
      for (const it of items) {
        const sets: string[] = [], args: any[] = [];
        for (const [k, col] of [["mrm", "is_mrm"], ["discontinued", "discontinued"], ["directFba", "direct_fba"], ["errors", "errors"], ["cogs", "cogs"]]) {
          if (k in it) { sets.push(`${col}=?`); args.push(it[k] === null || it[k] === "" ? null : typeof it[k] === "boolean" ? (it[k] ? 1 : 0) : Number(it[k])); }
        }
        if (sets.length) this.run(`UPDATE products SET ${sets.join(",")} WHERE sku=?`, ...args, it.sku);
      }
      this.audit(who, "products.update", items.length + " items");
      return { ok: true, updated: items.length };
    }
    if (path === "/api/products/cogs" && method === "POST") {
      const b = await body();
      const rows = parseCsv(String(b.csv || ""));
      let n = 0;
      for (const r of rows) {
        if (r.length < 2 || !/[0-9]/.test(r[1])) continue;
        const v = num(r[1]);
        const ids = resolveSkus(this, [r[0]]) || [];
        for (const sku of ids) { this.run(`UPDATE products SET cogs=? WHERE sku=?`, v, sku); n++; }
      }
      this.audit(who, "cogs.import", `${n} SKUs`);
      return { ok: true, updated: n };
    }

    // ----- sales -----
    if (path === "/api/sales") {
      return salesReport(this, q.get("from") || addDays(d, -30), q.get("to") || addDays(d, -1), resolveSkus(this, list(q.get("ids"))),
        (q.get("group") as any) || "asin", (q.get("interval") as any) || "day");
    }
    if (path === "/api/price-analysis") {
      const ids = list(q.get("ids"));
      if (!ids?.length) throw new HttpError(400, "Pick at least one product.");
      const from = q.get("from") || addDays(d, -90), to = q.get("to") || d;
      const win = Number(q.get("window") || 14), th = Number(q.get("threshold") || 3);
      const meta = productMeta(this);
      if (q.get("combine") === "1") {
        return { items: [{ key: ids.join(", "), title: "Combined", ...priceAnalysis(this, resolveSkus(this, ids)!, from, to, win, th) }] };
      }
      return {
        items: ids.map((id) => {
          const m = meta.byAsin.get(id) || meta.bySku.get(id);
          return { key: id, title: m?.title || "", image: m?.image, price: m?.price, ...priceAnalysis(this, resolveSkus(this, [id])!, from, to, win, th) };
        }),
      };
    }
    if (path === "/api/grid") {
      return salesGrid(this, q.get("from") || addDays(d, -60), q.get("to") || addDays(d, -1), resolveSkus(this, list(q.get("ids"))),
        (q.get("group") as any) || "asin", (q.get("metric") as any) || "units");
    }
    if (path === "/api/compare") {
      return compareRanges(this, [q.get("r1from")!, q.get("r1to")!], [q.get("r2from")!, q.get("r2to")!],
        resolveSkus(this, list(q.get("ids"))), (q.get("group") as any) || "asin");
    }

    // ----- inventory -----
    if (path === "/api/inventory") return { settings: { ...DEFAULT_INV_SETTINGS, ...this.setting("inventory_settings", {}) }, rows: inventoryRows(this), syncedAt: this.lastOk("inventory") };
    if (path === "/api/inventory/settings" && method === "PUT") {
      const b = await body();
      const s: any = {};
      for (const k of Object.keys(DEFAULT_INV_SETTINGS)) if (k in b) s[k] = k === "includeShipmentCreated" ? !!b[k] : Number(b[k]);
      this.setSetting("inventory_settings", { ...this.setting("inventory_settings", {}), ...s });
      return { ok: true };
    }

    // ----- repricer -----
    if (path === "/api/repricer" && method === "GET") return this.repricerView();
    if (path === "/api/repricer/settings" && method === "PUT") {
      const b = await body();
      this.setSetting("repricer", { enabled: !!b.enabled, dryRun: !!b.dryRun });
      this.audit(who, "repricer.settings", b);
      return { ok: true };
    }
    if (path === "/api/repricer/rules" && method === "POST") {
      const b = await body();
      const rule = sanitizeRule(b);
      if (b.id) this.run(`UPDATE reprice_rules SET name=?, json=? WHERE id=?`, rule.name, JSON.stringify(rule), b.id);
      else this.run(`INSERT INTO reprice_rules (name, json) VALUES (?,?)`, rule.name, JSON.stringify(rule));
      this.rulesCache = null;
      this.audit(who, "repricer.rule", rule);
      return { ok: true };
    }
    const ruleDel = path.match(/^\/api\/repricer\/rules\/(\d+)$/);
    if (ruleDel && method === "DELETE") {
      this.run(`DELETE FROM reprice_rules WHERE id=?`, Number(ruleDel[1]));
      this.run(`UPDATE reprice_skus SET rule_id=NULL, enabled=0 WHERE rule_id=?`, Number(ruleDel[1]));
      this.rulesCache = null;
      return { ok: true };
    }
    if (path === "/api/repricer/skus" && method === "PUT") {
      const b = await body();
      const items: any[] = b.items || [];
      for (const it of items) {
        const cur = this.one(`SELECT * FROM reprice_skus WHERE sku=?`, it.sku) || {};
        const v = {
          enabled: "enabled" in it ? (it.enabled ? 1 : 0) : cur.enabled ?? 0,
          rule_id: "ruleId" in it ? (it.ruleId ? Number(it.ruleId) : null) : cur.rule_id ?? null,
          min: "min" in it ? (it.min === "" || it.min === null ? null : Number(it.min)) : cur.min_price ?? null,
          max: "max" in it ? (it.max === "" || it.max === null ? null : Number(it.max)) : cur.max_price ?? null,
        };
        if (v.min !== null && v.max !== null && v.min > v.max) throw new HttpError(400, `${it.sku}: minimum price is above maximum.`);
        if (v.enabled && (!v.rule_id || !v.min || !v.max)) throw new HttpError(400, `${it.sku}: set a rule, min and max price before enabling.`);
        this.run(`INSERT INTO reprice_skus (sku, enabled, rule_id, min_price, max_price) VALUES (?,?,?,?,?)
                  ON CONFLICT(sku) DO UPDATE SET enabled=excluded.enabled, rule_id=excluded.rule_id, min_price=excluded.min_price, max_price=excluded.max_price`,
          it.sku, v.enabled, v.rule_id, v.min, v.max);
      }
      this.audit(who, "repricer.skus", `${items.length} SKUs`);
      return { ok: true };
    }
    if (path === "/api/repricer/run" && method === "POST") {
      this.run(`DELETE FROM jobs_state WHERE name='reprice'`);
      await this.ensureAlarm(1000);
      return { ok: true };
    }
    if (path === "/api/offers/refresh" && method === "POST") {
      const b = await body();
      enqueueOffers(this, (b.asins || []).slice(0, 500), REASON_MANUAL);
      await this.ensureAlarm(1000);
      return { ok: true };
    }

    // ----- manual / bulk pricing -----
    if (path === "/api/pricing" && method === "GET") return this.pricingView(q.get("scope") || "mrm");
    if (path === "/api/prices" && method === "POST") {
      const b = await body();
      const items: any[] = b.items || [];
      const now = Date.now();
      for (const it of items) {
        const p = round2(Number(it.price));
        if (!(p > 0)) throw new HttpError(400, `${it.sku}: invalid price`);
        if (!this.one(`SELECT 1 x FROM products WHERE sku=?`, it.sku)) throw new HttpError(400, `Unknown SKU ${it.sku}`);
      }
      for (const it of items) {
        this.run(`UPDATE price_queue SET status='replaced' WHERE sku=? AND status='pending'`, it.sku);
        this.run(`INSERT INTO price_queue (sku, price, source, user, status, created_at) VALUES (?,?,?,?, 'pending', ?)`,
          it.sku, round2(Number(it.price)), items.length > 1 ? "bulk" : "manual", who, now);
      }
      this.audit(who, "prices.queue", items.map((i) => `${i.sku}=${i.price}`).join(", "));
      await this.ensureAlarm(1000);
      return { ok: true, queued: items.length };
    }
    if (path === "/api/price-queue") {
      return this.all(`SELECT q.*, p.title, p.asin FROM price_queue q LEFT JOIN products p ON p.sku=q.sku ORDER BY q.id DESC LIMIT 300`);
    }

    // ----- fees -----
    if (path === "/api/fees") {
      const to = q.get("to") || d, from = q.get("from") || addDays(to, -6);
      const changes = feeChanges(this, from, to);
      const lowInv = this.all(`SELECT pl.*, p.title, p.image, COALESCE(p.is_mrm, p.mrm_auto, 0) mrm FROM planning pl LEFT JOIN products p ON p.sku=pl.sku
                               WHERE pl.low_inv_applied LIKE 'Y%' ORDER BY pl.sku`);
      const daily = this.all(`SELECT day, category, COUNT(*) n FROM fee_changes WHERE day > ? GROUP BY day, category ORDER BY day`, addDays(to, -30));
      return {
        from, to, changes, lowInv, daily,
        lastSnapshot: this.one(`SELECT MAX(day) d FROM fee_snapshots`)?.d || null,
        snapshotCount: this.one(`SELECT COUNT(DISTINCT day) n FROM fee_snapshots`)?.n || 0,
        email: { ...DEFAULT_FEE_EMAIL, ...this.setting("fee_email", {}) },
      };
    }
    if (path === "/api/fees/history") {
      return this.all(`SELECT * FROM fee_snapshots WHERE sku=? ORDER BY day DESC LIMIT 120`, q.get("sku"));
    }
    if (path === "/api/fees/email" && method === "PUT") {
      const b = await body();
      const cfg = {
        enabled: !!b.enabled, days: (b.days || []).map(Number).filter((x: number) => x >= 0 && x <= 6),
        hour: Math.min(23, Math.max(0, Number(b.hour ?? 8))),
        categories: (b.categories || []).filter((c: string) => ["dimensions", "low_inventory", "rate", "price_band"].includes(c)),
        products: ["all", "mrm", "non_mrm"].includes(b.products) ? b.products : "all",
        minDelta: Number(b.minDelta || 0), includeLowInvList: !!b.includeLowInvList, includeUnchanged: !!b.includeUnchanged,
        recipients: String(b.recipients || "").split(/[,\s]+/).filter((x: string) => /@/.test(x)),
      };
      this.setSetting("fee_email", cfg);
      return { ok: true };
    }
    if (path === "/api/fees/email/send" && method === "POST") {
      const b = await body();
      const cfg = { ...DEFAULT_FEE_EMAIL, ...this.setting("fee_email", {}) };
      const to = b.to || d, from = b.from || addDays(to, -6);
      const m = buildFeeEmail(this, cfg, from, to);
      await sendMail(this.secretGetter(), { to: cfg.recipients.length ? cfg.recipients : this.alertRecipients(), subject: m.subject, html: m.html });
      this.mailLog("fees", m.subject + " (manual)", "sent");
      return { ok: true, count: m.count };
    }
    if (path === "/api/fees/email/preview") {
      const cfg = { ...DEFAULT_FEE_EMAIL, ...this.setting("fee_email", {}) };
      const to = q.get("to") || d;
      return new Response(buildFeeEmail(this, cfg, q.get("from") || addDays(to, -6), to).html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/api/fees/recheck" && method === "POST") {
      this.run(`DELETE FROM jobs_state WHERE name='fees'`);
      await this.ensureAlarm(1000);
      return { ok: true };
    }

    // ----- sellers -----
    if (path === "/api/sellers" && method === "GET") {
      const tracked = this.all(`SELECT t.asin, t.added_at, t.note, o.sellers, o.fba, o.fbm, o.ts, o.bb_seller, o.bb_price, o.we_have_bb, o.error,
          (SELECT title FROM products WHERE asin=t.asin AND title<>'' LIMIT 1) title, (SELECT image FROM products WHERE asin=t.asin AND image IS NOT NULL LIMIT 1) image,
          (SELECT MAX(ts) FROM seller_events WHERE asin=t.asin) last_change
        FROM tracked_asins t LEFT JOIN offers_latest o ON o.asin=t.asin ORDER BY last_change DESC NULLS LAST, t.asin`)
        .map((t) => ({ ...t, ts: Math.max(t.ts || 0, this.checkedAt.get(t.asin) || 0) || null }));
      const days = Number(q.get("days") || 14);
      const events = this.all(`SELECT e.*, (SELECT title FROM products WHERE asin=e.asin AND title<>'' LIMIT 1) title FROM seller_events e WHERE ts > ? ORDER BY ts DESC LIMIT 500`,
        Date.now() - days * 86_400_000);
      return { tracked, events, settings: { enabled: true, intervalMin: 30, recipients: [], ...this.setting("seller_alerts", {}) } };
    }
    if (path === "/api/sellers/history") {
      return this.all(`SELECT ts, sellers, fba, fbm FROM seller_history WHERE asin=? AND ts > ? ORDER BY ts`, q.get("asin"), Date.now() - 60 * 86_400_000);
    }
    if (path === "/api/sellers/offers") {
      const o = this.one(`SELECT * FROM offers_latest WHERE asin=?`, q.get("asin"));
      return o ? { ...o, offers: JSON.parse(o.offers_json || "[]") } : null;
    }
    if (path === "/api/sellers/track" && method === "POST") {
      const b = await body();
      const asins = String(b.asins || "").toUpperCase().split(/[^A-Z0-9]+/).filter((x) => /^[A-Z0-9]{10}$/.test(x));
      for (const a of asins) this.run(`INSERT OR IGNORE INTO tracked_asins (asin, added_at, note) VALUES (?,?,?)`, a, Date.now(), b.note || null);
      enqueueOffers(this, asins, REASON_SELLERS);
      await this.ensureAlarm(1000);
      return { ok: true, added: asins.length };
    }
    if (path === "/api/sellers/untrack" && method === "POST") {
      const b = await body();
      for (const a of b.asins || []) this.run(`DELETE FROM tracked_asins WHERE asin=?`, a);
      return { ok: true };
    }
    if (path === "/api/sellers/settings" && method === "PUT") {
      const b = await body();
      this.setSetting("seller_alerts", {
        enabled: !!b.enabled, intervalMin: Math.max(15, Number(b.intervalMin || 30)),
        recipients: String(b.recipients || "").split(/[,\s]+/).filter((x: string) => /@/.test(x)),
      });
      return { ok: true };
    }

    // ----- images -----
    if (path === "/api/images/jobs") return this.all(`SELECT j.*, p.title FROM image_jobs j LEFT JOIN products p ON p.sku=j.sku ORDER BY j.id DESC LIMIT 100`);
    const imgMatch = path.match(/^\/api\/images\/([^/]+)$/);
    if (imgMatch && method === "GET") {
      const sku = decodeURIComponent(imgMatch[1]);
      const p = this.one(`SELECT * FROM products WHERE sku=?`, sku);
      if (!p) throw new HttpError(404, "Unknown SKU");
      const cur = await currentImages(this, p.asin);
      const jobs = this.all(`SELECT * FROM image_jobs WHERE sku=? ORDER BY id DESC LIMIT 20`, sku);
      return { product: p, ...cur, jobs };
    }
    if (path === "/api/images/upload" && method === "POST") {
      const fd = await request.formData();
      const f: any = fd.get("file");
      if (!f || typeof f === "string") throw new HttpError(400, "No file.");
      return storeUpload(this, f);
    }
    if (path === "/api/images/push" && method === "POST") {
      const b = await body();
      const p = this.one(`SELECT * FROM products WHERE sku=?`, b.sku);
      if (!p) throw new HttpError(404, "Unknown SKU");
      queueImageJob(this, p.sku, p.asin, b.slots || {}, who);
      this.audit(who, "images.push", { sku: p.sku, slots: b.slots });
      await this.ensureAlarm(1000);
      return { ok: true };
    }


    // ----- inventory errors (units to subtract until an end date) -----
    if (path === "/api/inv-errors" && method === "GET") {
      return this.all(`SELECT e.*, p.title, p.asin, p.image FROM inv_errors e LEFT JOIN products p ON p.sku=e.sku ORDER BY (e.end_day >= ?) DESC, e.end_day DESC, e.id DESC LIMIT 500`, d);
    }
    if (path === "/api/inv-errors" && method === "POST") {
      const b = await body();
      if (!this.one(`SELECT 1 x FROM products WHERE sku=?`, b.sku)) throw new HttpError(400, "Pick a product.");
      if (!(Number(b.qty) > 0)) throw new HttpError(400, "Enter the number of units.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.endDay || "")) throw new HttpError(400, "Pick an end date.");
      this.run(`INSERT INTO inv_errors (sku, qty, note, start_day, end_day, created_by, created_at) VALUES (?,?,?,?,?,?,?)`,
        b.sku, Math.round(Number(b.qty)), String(b.note || "").slice(0, 300), b.startDay || d, b.endDay, who, Date.now());
      this.audit(who, "inv-errors.add", b);
      return { ok: true };
    }
    const errDel = path.match(/^\/api\/inv-errors\/(\d+)$/);
    if (errDel && method === "DELETE") { this.run(`DELETE FROM inv_errors WHERE id=?`, Number(errDel[1])); return { ok: true }; }
    if (errDel && method === "PATCH") {
      const b = await body();
      if (b.endDay) this.run(`UPDATE inv_errors SET end_day=? WHERE id=?`, b.endDay, Number(errDel[1]));
      if (b.qty !== undefined) this.run(`UPDATE inv_errors SET qty=? WHERE id=?`, Math.round(Number(b.qty)), Number(errDel[1]));
      return { ok: true };
    }

    // ----- shipping (FBA inbound) -----
    if (path === "/api/ship/plans" && method === "GET") {
      return this.all(`SELECT s.id, s.name, s.status, s.inbound_plan_id, s.created_by, s.created_at, s.updated_at, s.last_error,
          (SELECT COUNT(*) FROM ship_items WHERE plan_id=s.id) skus, (SELECT SUM(qty) FROM ship_items WHERE plan_id=s.id) units
        FROM ship_plans s ORDER BY s.id DESC LIMIT 200`);
    }
    if (path === "/api/ship/plans" && method === "POST") {
      const b = await body();
      let items = b.items || [];
      if (b.text) { const r = parseLines(this, b.text); if (r.bad.length) throw new HttpError(400, `Fix these lines first: ${r.bad.map((x) => `"${x.line}" (${x.reason})`).join("; ")}`); items = r.items; }
      const id = createDraft(this, b.name, items, who);
      this.audit(who, "ship.create-draft", { id, items: (b.items || []).length });
      return { ok: true, id };
    }
    if (path === "/api/ship/address") return (await defaultAddress(this)) || {};
    if (path === "/api/ship/defaults") {
      return { address: (await defaultAddress(this)) || null, contact: this.setting("freight_contact", null), target: normTarget({ ...DEFAULT_TARGET, ...this.setting("ship_target", {}) }),
        prepDefault: this.setting("prep_default", "NONE"), recentAddresses: await recentAddresses(this), warehouses: await knownWarehouses(this) };
    }
    if (path === "/api/ship/parse" && method === "POST") {
      const b = await body();
      const r = parseLines(this, b.text || "");
      const info = r.items.map((it) => ({ ...it, ...(this.one(`SELECT p.title, p.asin, p.fnsku, p.image, i.fulfillable FROM products p LEFT JOIN inventory i ON i.sku=p.sku WHERE p.sku=?`, it.sku) || {}) }));
      return { items: info, bad: r.bad };
    }
    if (path === "/api/labels/units") {
      return unitLabels(this, [{ sku: q.get("sku") || "", qty: Number(q.get("qty") || 1) }], q.get("type") || "letter");
    }
    const sm = path.match(/^\/api\/ship\/plans\/(\d+)(?:\/([a-z-]+))?$/);
    if (sm) {
      const id = Number(sm[1]), sub = sm[2];
      if (!sub && method === "GET") return getPlan(this, id);
      if (!sub && method === "PUT") {
        const b = await body();
        if (b.name) this.run(`UPDATE ship_plans SET name=?, updated_at=? WHERE id=?`, String(b.name).slice(0, 80), Date.now(), id);
        if (b.address) this.run(`UPDATE ship_plans SET address=? WHERE id=?`, JSON.stringify(b.address), id);
        if (b.boxes) { const p = getPlan(this, id); p.data.boxes = b.boxes; this.run(`UPDATE ship_plans SET data=? WHERE id=?`, JSON.stringify(p.data), id); }
        return { ok: true };
      }
      if (!sub && method === "DELETE") {
        const p = getPlan(this, id);
        if (p.inbound_plan_id && !["cancelled", "draft"].includes(p.status)) throw new HttpError(400, "Cancel the plan in Amazon first.");
        this.run(`DELETE FROM ship_items WHERE plan_id=?`, id);
        this.run(`DELETE FROM ship_plans WHERE id=?`, id);
        return { ok: true };
      }
      if (sub === "prep" && method === "GET") {
        const p = getPlan(this, id);
        return ownersFor(this, p.items.map((i: any) => ({ sku: i.sku, fnsku: i.fnsku || i.cur_fnsku })),
          q.get("default") || p.data.prepDefault || this.setting("prep_default", "NONE"), p.data.ownerOverrides || {});
      }
      if (sub === "items" && method === "PUT") { const b = await body(); setItems(this, id, b.items || []); return getPlan(this, id); }
      if (sub === "step" && method === "POST") {
        const b = await body();
        this.audit(who, "ship.step", { id, action: b.action });
        try {
          const out = await shipStep(this, id, b.action, b);
          this.run(`UPDATE ship_plans SET last_error=NULL WHERE id=?`, id);
          return out;
        } catch (e: any) {
          console.error(`ship plan ${id} step ${b.action} failed: ${e.message}`);
          this.run(`UPDATE ship_plans SET last_error=?, updated_at=? WHERE id=?`, String(e.message).slice(0, 2000), Date.now(), id);
          // a failed create leaves nothing usable in Amazon: go back to draft so it can be fixed and retried
          if (b.action === "create") {
            // nothing was created in Amazon → back to draft to fix and retry; otherwise keep the plan id so "Continue" resumes it
            const cur = this.one(`SELECT inbound_plan_id FROM ship_plans WHERE id=?`, id);
            if (!cur?.inbound_plan_id) this.run(`UPDATE ship_plans SET status='draft' WHERE id=?`, id);
          }
          throw e;
        }
      }
      if (sub === "unit-labels") {
        const p = getPlan(this, id);
        const only = q.get("sku");
        const list = p.items.filter((i: any) => !only || i.sku === only).map((i: any) => ({ sku: i.sku, qty: Number(q.get("qty")) || i.qty }));
        return unitLabels(this, list, q.get("type") || "letter");
      }
      if (sub === "labels") return shipmentLabels(this, getPlan(this, id), q.get("shipmentId") || "", q.get("kind") || "box2");
    }

    // ----- system / settings -----
    if (path === "/api/system" && method === "GET") return this.systemView(me.role === "admin");
    if (path === "/api/system/sync" && method === "POST") {
      const b = await body();
      const names = b.task === "all" ? ["listings", "orders_recent", "inventory", "catalog", "fees", "reprice", "sellers"] : [b.task];
      for (const n of names) this.run(`DELETE FROM jobs_state WHERE name=?`, n);
      if (b.task === "catalog") this.run(`UPDATE products SET catalog_at=NULL`);
      await this.ensureAlarm(500);
      return { ok: true };
    }
    if (path === "/api/system/connections" && method === "PUT") {
      admin();
      const b = await body();
      const cur = this.setting<Record<string, string>>("secrets", {});
      for (const k of SECRET_KEYS) if (typeof b[k] === "string" && b[k].trim() !== "") cur[k] = b[k].trim();
      for (const k of b.clear || []) delete cur[k];
      this.setSetting("secrets", cur);
      this.secretsCache = null;
      if (b.alertEmails !== undefined) this.setSetting("alert_emails", String(b.alertEmails).split(/[,\s]+/).filter((x) => /@/.test(x)));
      if (b.timezone) this.setSetting("timezone", b.timezone);
      this.audit(who, "connections.update", Object.keys(b));
      await this.ensureAlarm(1000);
      return { ok: true };
    }
    if (path === "/api/system/test-amazon" && method === "POST") {
      const r = await this.amz.ok("GET", "/sellers/v1/marketplaceParticipations");
      const mps = (r.payload || []).map((x: any) => x.marketplace?.countryCode).filter(Boolean);
      return { ok: true, marketplaces: mps };
    }
    if (path === "/api/system/test-email" && method === "POST") {
      const to = this.alertRecipients();
      await sendMail(this.secretGetter(), { to, subject: "Mr Miracle FBA System — test email", html: emailLayout("Test email", "<p>Email alerts are working.</p>") });
      this.mailLog("test", "Test email", "sent");
      return { ok: true, to };
    }

    // ----- users -----
    if (path === "/api/users" && method === "GET") { admin(); return this.all(`SELECT id, email, name, role, active, created_at, last_login FROM users ORDER BY id`); }
    if (path === "/api/users" && method === "POST") {
      admin();
      const b = await body();
      await this.createUser(b.email, b.name, b.role, b.password);
      this.audit(who, "users.create", b.email);
      return { ok: true };
    }
    const um = path.match(/^\/api\/users\/(\d+)$/);
    if (um && method === "PATCH") {
      admin();
      const id = Number(um[1]); const b = await body();
      if (b.role) { if (!ROLES.includes(b.role)) throw new HttpError(400, "Bad role"); this.run(`UPDATE users SET role=? WHERE id=?`, b.role, id); }
      if ("active" in b) { this.run(`UPDATE users SET active=? WHERE id=?`, b.active ? 1 : 0, id); }
      if (b.name !== undefined) this.run(`UPDATE users SET name=? WHERE id=?`, b.name, id);
      if (b.password) await this.setPassword(id, b.password);
      if (!this.one(`SELECT 1 x FROM users WHERE role='admin' AND active=1`)) throw new HttpError(400, "There must be at least one active admin.");
      this.audit(who, "users.update", { id, ...b, password: b.password ? "***" : undefined });
      return { ok: true };
    }
    if (um && method === "DELETE") {
      admin();
      const id = Number(um[1]);
      if (id === me.id) throw new HttpError(400, "You can't delete yourself.");
      this.run(`DELETE FROM users WHERE id=?`, id);
      if (!this.one(`SELECT 1 x FROM users WHERE role='admin' AND active=1`)) throw new HttpError(400, "There must be at least one active admin.");
      return { ok: true };
    }
    if (path === "/api/audit") { admin(); return this.all(`SELECT * FROM audit ORDER BY id DESC LIMIT 300`); }

    throw new HttpError(404, "Not found");
  }

  private async createUser(email: string, name: string, role: string, password: string) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email.");
    if (!ROLES.includes(role)) throw new HttpError(400, "Bad role.");
    if (String(password || "").length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    if (this.one(`SELECT 1 x FROM users WHERE email=?`, email)) throw new HttpError(400, "That email already has an account.");
    const h = await hashPassword(password);
    this.run(`INSERT INTO users (email, name, role, pass_hash, salt, active, created_at) VALUES (?,?,?,?,?,1,?)`, email, name || "", role, h.hash, h.salt, Date.now());
  }
  private async setPassword(id: number, password: string) {
    if (String(password || "").length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    const h = await hashPassword(password);
    this.run(`UPDATE users SET pass_hash=?, salt=? WHERE id=?`, h.hash, h.salt, id);
  }

  private lastOk(name: string) { return this.one(`SELECT last_ok FROM jobs_state WHERE name=?`, name)?.last_ok || null; }

  // ---------- views ----------

  private dashboard() {
    const d = this.salesToday(), y = addDays(d, -1);
    const sum = (from: string, to: string) => this.one(`SELECT COALESCE(SUM(revenue),0) r, COALESCE(SUM(units),0) u FROM ${this.totals} WHERE day>=? AND day<=?`, from, to);
    const monthStart = d.slice(0, 8) + "01";
    const lastMonthStart = addDays(monthStart, -1).slice(0, 8) + "01";
    const lastMonthEnd = addDays(monthStart, -1);
    const daysInMonth = Number(addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1).slice(8));
    const elapsed = Number(y.slice(8)) >= 1 && y >= monthStart ? Number(y.slice(8)) : 0;
    const mtd = sum(monthStart, y);
    const months = this.all(`SELECT substr(day,1,7) m, SUM(revenue) r, SUM(units) u FROM ${this.totals} WHERE day >= ? GROUP BY m ORDER BY m`, addDays(monthStart, -365).slice(0, 8) + "01");
    const top = this.all(`SELECT asin, SUM(CASE WHEN day=? THEN units ELSE 0 END) y, SUM(CASE WHEN day>? THEN units ELSE 0 END) l7,
        SUM(units) l30, SUM(CASE WHEN day=? THEN revenue ELSE 0 END) yr FROM sales_daily WHERE day > ? AND day <= ? GROUP BY asin ORDER BY y DESC, l7 DESC LIMIT 25`,
      y, addDays(y, -7), y, addDays(y, -30), y);
    const meta = productMeta(this);
    const inv = inventoryRows(this);
    return {
      today: d, yesterday: y,
      kpi: {
        yesterday: sum(y, y), last7: sum(addDays(y, -6), y), last14: sum(addDays(y, -13), y), last30: sum(addDays(y, -29), y),
        mtd, lastMonth: sum(lastMonthStart, lastMonthEnd),
        trajectory: elapsed ? round2(mtd.r / elapsed * daysInMonth) : null,
        todaySoFar: sum(d, d),
      },
      months,
      daily: this.all(`SELECT day, revenue r, units u FROM ${this.totals} WHERE day > ? ORDER BY day`, addDays(d, -60)),
      top: top.map((t) => ({ ...t, title: meta.byAsin.get(t.asin)?.title || "", image: meta.byAsin.get(t.asin)?.image || null,
        trend: t.l30 ? round2((t.l7 / 7) / (t.l30 / 30) * 100 - 100) : null })),
      alerts: {
        feeChanges: this.one(`SELECT COUNT(*) n FROM fee_changes WHERE day >= ?`, addDays(d, -1)).n,
        lowInvFee: this.one(`SELECT COUNT(*) n FROM planning WHERE low_inv_applied LIKE 'Y%'`).n,
        sellerChanges: this.one(`SELECT COUNT(*) n FROM seller_events WHERE ts > ?`, Date.now() - 86_400_000).n,
        lowStock: inv.filter((r) => r.state === "low").length,
        oos: inv.filter((r) => r.state === "oos" && r.l30 > 0).length,
        bbLost: this.one(`SELECT COUNT(*) n FROM offers_latest o WHERE we_have_bb=0 AND our_price IS NOT NULL`).n,
      },
      sync: this.syncSummary(),
    };
  }

  private syncSummary() {
    const bf = this.setting<any>("backfill", null);
    const total = 730;
    const done = bf ? Math.max(0, Math.min(total, Math.round((Date.parse(this.salesToday()) - Date.parse(bf.cursor)) / 86_400_000))) : 0;
    return {
      storage: { writesToday: this.writesToday(), budget: this.writeBudget() },
      connected: !!this.amz.mode(),
      email: emailProvider(this.secretGetter()),
      backfill: bf ? { daysLoaded: done, total, done: bf.cursor < bf.until, oldest: this.one(`SELECT MIN(day) d FROM sales_daily`)?.d } : null,
      jobs: Object.fromEntries(this.all(`SELECT * FROM jobs_state`).map((j) => [j.name, j])),
      pendingReports: this.all(`SELECT kind, status, created_at FROM report_jobs WHERE status IN ('requested','processing')`),
    };
  }

  private systemView(isAdmin: boolean) {
    const sec = this.setting<Record<string, string>>("secrets", {});
    return {
      ...this.syncSummary(),
      secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, this.env[k] ? "worker-secret" : sec[k] ? "set" : null])),
      alertEmails: this.setting("alert_emails", []), timezone: this.tz(), isAdmin,
      reports: this.all(`SELECT id, kind, report_type, status, error, rows, created_at, done_at, params FROM report_jobs ORDER BY id DESC LIMIT 40`),
      logs: this.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 60`),
      emails: this.all(`SELECT * FROM email_log ORDER BY id DESC LIMIT 30`),
      counts: {
        products: this.one(`SELECT COUNT(*) n FROM products`).n, salesRows: this.one(`SELECT COUNT(*) n FROM sales_daily`).n,
        feeSnapshots: this.one(`SELECT COUNT(*) n FROM fee_snapshots`).n,
      },
    };
  }

  private repricerView() {
    const rules = this.all(`SELECT id, json FROM reprice_rules ORDER BY id`).map((r) => ({ ...JSON.parse(r.json), id: r.id }));
    const d = this.salesToday();
    const skus = this.all(`SELECT p.sku, p.asin, p.title, p.image, p.price, p.status, r.enabled, r.rule_id, r.min_price, r.max_price, r.last_run, r.last_action,
        o.bb_price, o.we_have_bb, o.our_price, o.lowest_fba, o.lowest, o.sellers, o.ts offers_at, i.fulfillable, COALESCE(s.u30,0) units30
      FROM products p LEFT JOIN reprice_skus r ON r.sku=p.sku LEFT JOIN offers_latest o ON o.asin=p.asin LEFT JOIN inventory i ON i.sku=p.sku
      LEFT JOIN (SELECT sku, SUM(units) u30 FROM sales_daily WHERE day > ? GROUP BY sku) s ON s.sku=p.sku
      WHERE COALESCE(p.is_mrm, p.mrm_auto, 0)=0 AND (p.status IS NULL OR p.status<>'Incomplete')
      ORDER BY r.enabled DESC, units30 DESC, p.sku`, addDays(d, -30))
      .map((r) => ({ ...r, offers_at: Math.max(r.offers_at || 0, this.checkedAt.get(r.asin) || 0) || null }));
    return {
      settings: this.setting("repricer", { enabled: false, dryRun: true }), rules, skus,
      log: this.all(`SELECT * FROM reprice_log ORDER BY id DESC LIMIT 300`),
      lastRun: this.one(`SELECT * FROM jobs_state WHERE name='reprice'`) || null,
    };
  }

  private pricingView(scope: string) {
    const d = this.salesToday();
    const where = scope === "all" ? "1=1" : scope === "non_mrm" ? "COALESCE(p.is_mrm, p.mrm_auto, 0)=0" : "COALESCE(p.is_mrm, p.mrm_auto, 0)=1";
    return this.all(`SELECT p.sku, p.asin, p.title, p.image, p.price, p.status, p.cogs, o.bb_price, o.we_have_bb, o.sellers, i.fulfillable,
        COALESCE(s.u7,0) units7, COALESCE(s.u30,0) units30, f.fulfil_fee, f.referral_fee, f.price fee_price,
        (SELECT ts FROM price_history WHERE sku=p.sku ORDER BY ts DESC LIMIT 1) last_change,
        (SELECT status FROM price_queue WHERE sku=p.sku ORDER BY id DESC LIMIT 1) queue_status
      FROM products p LEFT JOIN offers_latest o ON o.asin=p.asin LEFT JOIN inventory i ON i.sku=p.sku
      LEFT JOIN (SELECT sku, SUM(CASE WHEN day > ? THEN units ELSE 0 END) u7, SUM(units) u30 FROM sales_daily WHERE day > ? GROUP BY sku) s ON s.sku=p.sku
      LEFT JOIN fee_snapshots f ON f.sku=p.sku AND f.day=(SELECT MAX(day) FROM fee_snapshots WHERE sku=p.sku)
      WHERE ${where} ORDER BY units30 DESC, p.sku`, addDays(d, -7), addDays(d, -30));
  }
}

function sanitizeRule(b: any): Rule {
  const strategies = ["match_bb", "beat_bb", "beat_lowest_fba", "beat_lowest"];
  if (!String(b.name || "").trim()) throw new HttpError(400, "Give the rule a name.");
  return {
    name: String(b.name).trim().slice(0, 80),
    strategy: strategies.includes(b.strategy) ? b.strategy : "match_bb",
    amount: Math.max(0, Number(b.amount || 0)), amountType: b.amountType === "%" ? "%" : "$",
    ignoreFbm: !!b.ignoreFbm, ignoreAmazon: !!b.ignoreAmazon,
    minFeedbackPct: Math.min(100, Math.max(0, Number(b.minFeedbackPct || 0))), minFeedbackCount: Math.max(0, Number(b.minFeedbackCount || 0)),
    whenWinning: b.whenWinning === "hold" ? "hold" : "raise", noCompetition: b.noCompetition === "hold" ? "hold" : "max",
    belowMin: b.belowMin === "hold" ? "hold" : "min",
  };
}
