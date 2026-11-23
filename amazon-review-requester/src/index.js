// Amazon Review Requester — Cloudflare Worker + SQLite Durable Object.
// Every 5 minutes: syncs orders from Amazon (order report), schedules a
// "Request a Review" for each shipped order containing a selected ASIN,
// sends the ones that are due, and snapshots customer review topics.
import { renderApp, renderLogin } from "./ui.js";

const DAY = 86400000;
const HOUR = 3600000;
const MARKETPLACE = "ATVPDKIKX0DER";
const SEND_BATCH = 40;          // requests per tick (fits the 50-subrequest limit)
const INGEST_EVERY = HOUR;      // how often to pull a fresh order report
const BACKFILL_DAYS = 3;        // never sync orders older than this (keeps the free plan's daily limits)
const START_FROM = "2026-11-17"; // first day of orders that get review requests (set once, editable in Settings)
const MAX_ORDER_AGE_DAYS = 35;  // Amazon only allows requests within ~30 days of delivery
const FEEDBACK_EVERY = 7 * DAY;
// Cloudflare Free plan: 100k SQLite rows written and 5M rows read per day (account-wide).
// The app stops heavy work below these limits so the dashboard keeps working.
const FREE_WRITE_BUDGET = 80000;
const FREE_READ_BUDGET = 4000000;
const LIMIT_MSG = "Cloudflare's free-plan daily database limit was reached. Everything resumes automatically at 00:00 UTC, or right away on the Workers Paid plan.";

const DEFAULT_SETTINGS = {
  active: true,
  delayDays: 7,
  skipBusiness: false,
  startDate: null, // ISO date; orders before it are never requested
};

// ---------------------------------------------------------------- Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });

    if (url.pathname === "/login" && request.method === "POST") {
      const form = await request.formData();
      const pw = String(form.get("password") ?? "");
      if (!env.ADMIN_PASSWORD || !(await safeEqual(pw, env.ADMIN_PASSWORD))) {
        return html(renderLogin("That password is not correct."), 401);
      }
      const token = await sessionToken(env);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `rr_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`,
        },
      });
    }
    if (url.pathname === "/logout") {
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": "rr_session=; Path=/; Max-Age=0" } });
    }

    if (!(await isAuthed(request, env))) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Not signed in" }, 401);
      return html(renderLogin());
    }

    if (url.pathname === "/") return html(renderApp());
    if (url.pathname.startsWith("/api/")) {
      try { return await stub(env).fetch(request); }
      catch (e) { return json({ error: isLimitError(e) ? LIMIT_MSG : `The app's storage is not responding: ${e.message}` }, 503); }
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(stub(env).fetch("https://store/tick", { method: "POST" }));
  },
};

function stub(env) {
  return env.STORE.get(env.STORE.idFromName("main"));
}

// ---------------------------------------------------------------- Store (Durable Object)
export class Store {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.token = null;
    this.ticking = false;
    this.usage = null;
    this.viewCache = null;
    this.insightsCache = null;
    this.migrate();
  }

  migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS products (
        asin TEXT PRIMARY KEY, sku TEXT, title TEXT,
        enabled INTEGER NOT NULL DEFAULT 0, delay_override INTEGER,
        first_seen INTEGER, last_order INTEGER);
      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY, purchase_ms INTEGER, updated_ms INTEGER,
        status TEXT, channel TEXT, is_business INTEGER, ship_state TEXT, ship_country TEXT,
        units INTEGER, total REAL, currency TEXT);
      CREATE INDEX IF NOT EXISTS orders_purchase ON orders(purchase_ms);
      CREATE TABLE IF NOT EXISTS order_items (
        order_id TEXT, asin TEXT, sku TEXT, qty INTEGER, price REAL,
        PRIMARY KEY (order_id, asin));
      CREATE INDEX IF NOT EXISTS items_asin ON order_items(asin);
      CREATE TABLE IF NOT EXISTS requests (
        order_id TEXT PRIMARY KEY, asin TEXT, purchase_ms INTEGER, due_at INTEGER,
        delay_days INTEGER, status TEXT, attempts INTEGER DEFAULT 0,
        sent_at INTEGER, last_error TEXT, updated_at INTEGER);
      CREATE INDEX IF NOT EXISTS requests_due ON requests(status, due_at);
      CREATE TABLE IF NOT EXISTS feedback (
        asin TEXT, taken_at INTEGER, ok INTEGER, pos_mentions INTEGER, neg_mentions INTEGER,
        data TEXT, PRIMARY KEY (asin, taken_at));
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, level TEXT, msg TEXT);
      CREATE TABLE IF NOT EXISTS product_days (asin TEXT, day INTEGER, orders INTEGER, units INTEGER, PRIMARY KEY (asin, day)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS outcome_days (day INTEGER, asin TEXT, status TEXT, n INTEGER, PRIMARY KEY (day, asin, status)) WITHOUT ROWID;
    `);
  }

  // ---- small helpers
  run(q, ...a) {
    const c = this.sql.exec(q, ...a);
    const rows = c.toArray();
    const u = this.todayUsage();
    u.r += c.rowsRead || 0; u.w += c.rowsWritten || 0;
    return rows;
  }
  todayUsage() {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.usage) { const r = this.sql.exec("SELECT v FROM kv WHERE k='usage'").toArray()[0]; this.usage = r ? JSON.parse(r.v) : { day, r: 0, w: 0 }; }
    if (this.usage.day !== day) this.usage = { day, r: 0, w: 0 };
    return this.usage;
  }
  saveUsage() { try { this.sql.exec("INSERT INTO kv(k,v) VALUES('usage',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", JSON.stringify(this.todayUsage())); } catch {} }
  overBudget() {
    if (this.env.PAID_PLAN === "1") return false;
    const u = this.todayUsage();
    return u.w > FREE_WRITE_BUDGET || u.r > FREE_READ_BUDGET;
  }
  markPlan({ delays = false, disabled = false } = {}) {
    const cur = this.get("planFull", null) || { delays: false, disabled: false };
    this.set("planFull", { delays: cur.delays || delays, disabled: cur.disabled || disabled });
  }
  invalidate() { this.viewCache = null; }
  all(q, ...a) { return this.run(q, ...a); }
  one(q, ...a) { return this.all(q, ...a)[0]; }
  get(k, d = null) { const r = this.one("SELECT v FROM kv WHERE k=?", k); return r ? JSON.parse(r.v) : d; }
  set(k, v) { this.run("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, JSON.stringify(v)); }
  settings() { return { ...DEFAULT_SETTINGS, ...this.get("settings", {}) }; }
  log(level, msg) {
    try {
      this.run("INSERT INTO events(ts,level,msg) VALUES(?,?,?)", Date.now(), level, String(msg).slice(0, 500));
      if (Math.random() < 0.05) this.run("DELETE FROM events WHERE id < (SELECT MAX(id) - 500 FROM events)");
    } catch {}
  }

  // ---- HTTP API
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === "/api/dev/import" && this.env.DEV_MODE === "1") { const n = this.importOrders(await request.text()); this.plan(false); return json(n); }
      if (p === "/tick") { await this.tick("schedule"); return json({ ok: true }); }
      if (p === "/api/state") {
        if (!this.viewCache || (Date.now() - this.viewCache.at > 5 * 60000 && !this.overBudget())) this.viewCache = { at: Date.now(), v: this.stateView() };
        return json({ ...this.viewCache.v, usage: this.todayUsage(), paidPlan: this.env.PAID_PLAN === "1", limitMessage: this.overBudget() ? LIMIT_MSG : null });
      }
      if (p === "/api/insights") {
        if (!this.insightsCache || (Date.now() - this.insightsCache.at > 6 * HOUR && !this.overBudget())) this.insightsCache = { at: Date.now(), v: this.insightsView() };
        return json(this.insightsCache.v);
      }
      if (p === "/api/requests") return json(this.requestsView(url.searchParams));
      if (p === "/api/export.csv") return this.exportCsv();
      if (p === "/api/run" && request.method === "POST") {
        this.state.waitUntil(this.tick("manual"));
        return json({ ok: true });
      }
      if (p === "/api/settings" && request.method === "POST") {
        const b = await request.json();
        const s = this.settings();
        if (typeof b.active === "boolean") s.active = b.active;
        if (b.delayDays !== undefined) s.delayDays = clampDelay(b.delayDays);
        if (typeof b.skipBusiness === "boolean") s.skipBusiness = b.skipBusiness;
        if (b.startDate !== undefined) s.startDate = b.startDate || null;
        this.set("settings", s);
        this.invalidate();
        this.log("info", `Settings saved: ${s.active ? "active" : "paused"}, ${s.delayDays} days after purchase${s.skipBusiness ? ", skipping business orders" : ""}${s.startDate ? `, orders since ${s.startDate}` : ""}`);
        this.markPlan({ delays: true });
        return json({ ok: true, settings: s });
      }
      if (p === "/api/products" && request.method === "POST") {
        const b = await request.json();
        const asins = (b.asins ?? []).map((a) => String(a).trim().toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a));
        if (!asins.length) return json({ error: "No valid ASINs" }, 400);
        const now = Date.now();
        for (const a of asins) {
          this.run("INSERT INTO products(asin, first_seen) VALUES(?,?) ON CONFLICT(asin) DO NOTHING", a, now);
          if (typeof b.enabled === "boolean") this.run("UPDATE products SET enabled=? WHERE asin=? AND enabled<>?", b.enabled ? 1 : 0, a, b.enabled ? 1 : 0);
          if (b.delayOverride !== undefined) {
            const d = b.delayOverride === null || b.delayOverride === "" ? null : clampDelay(b.delayOverride);
            this.run("UPDATE products SET delay_override=? WHERE asin=? AND delay_override IS NOT ?", d, a, d);
          }
        }
        this.invalidate();
        if (typeof b.enabled === "boolean") this.log("info", `${b.enabled ? "Enabled" : "Disabled"} review requests for ${asins.length} ASIN${asins.length > 1 ? "s" : ""}`);
        this.markPlan({ delays: b.delayOverride !== undefined, disabled: b.enabled === false });
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      if (isLimitError(e)) return json({ error: LIMIT_MSG }, 503);
      this.log("error", `API ${p}: ${e.message}`);
      return json({ error: e.message }, 500);
    } finally {
      this.saveUsage();
    }
  }

  // ---- the periodic job
  async tick(kind) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.set("lastTick", Date.now());
      if (this.overBudget()) { this.set("lastError", LIMIT_MSG); return; }
      if (!this.get("startFromApplied")) {
        const st = this.settings();
        st.startDate = START_FROM;
        this.set("settings", st);
        this.set("startFromApplied", true);
        this.log("info", `Review requests start with orders placed on or after ${START_FROM}.`);
      }
      this.set("lastError", null);
      if (!this.get("aggV1")) {
        const since = Math.floor((Date.now() - 31 * DAY) / DAY) * DAY;
        this.state.storage.transactionSync(() => {
          this.run(`INSERT OR REPLACE INTO product_days(asin,day,orders,units)
                    SELECT i.asin, o.purchase_ms / 86400000, COUNT(*), SUM(i.qty) FROM order_items i JOIN orders o ON o.order_id=i.order_id
                    WHERE o.purchase_ms >= ? GROUP BY i.asin, o.purchase_ms / 86400000`, since);
          this.run(`INSERT OR REPLACE INTO outcome_days(day,asin,status,n)
                    SELECT COALESCE(sent_at, updated_at) / 86400000, COALESCE(asin,''), status, COUNT(*) FROM requests
                    WHERE status NOT IN ('scheduled','retry') GROUP BY 1, 2, 3`);
          this.set("ordersStored", this.one("SELECT COUNT(*) n FROM orders").n);
          this.set("aggV1", true);
        });
        this.invalidate();
      }
      if (!this.credentialMode()) {
        this.set("lastError", "Amazon credentials are not configured yet.");
        return;
      }
      const steps = [["sync orders", () => this.ingest(kind === "manual")], ["plan", () => {
        const full = this.get("planFull", null);
        if (full) { this.plan(true, full); this.set("planFull", null); this.log("info", "Applied product and settings changes to the send schedule."); }
        else if (this.get("planDirty")) this.plan(false);
      }], ["send", () => this.sendDue()], ["customer feedback", () => this.snapshotFeedback()]];
      for (const [name, fn] of steps) {
        if (this.overBudget()) { this.set("lastError", LIMIT_MSG); break; }
        try { await fn(); } catch (e) {
          if (isLimitError(e)) break;
          this.log("error", `${name}: ${e.message}`); this.set("lastError", `${name}: ${e.message}`);
        }
      }
      this.invalidate();
    } catch (e) {
      if (!isLimitError(e)) throw e;
    } finally {
      this.ticking = false;
      this.saveUsage();
    }
  }

  // ---- 1. order sync through the flat-file order report
  async ingest(force) {
    const pending = this.get("pendingReport");
    if (pending) {
      const r = await this.sp("GET", `/reports/2021-06-30/reports/${pending.reportId}`);
      if (r.status !== 200) throw new Error(`getReport ${r.status}: ${errText(r)}`);
      const st = r.body.processingStatus;
      if (st === "IN_QUEUE" || st === "IN_PROGRESS") {
        if (Date.now() - pending.requestedAt > 6 * HOUR) { this.set("pendingReport", null); this.log("warn", "Order report took over 6 hours; requesting a new one."); }
        return;
      }
      this.set("pendingReport", null);
      if (st === "CANCELLED") { this.set("lastIngest", { at: Date.now(), since: pending.since, rows: 0 }); this.set("syncedThrough", pending.until); return; } // no data in range
      if (st !== "DONE") throw new Error(`Order report ended as ${st}`);
      const d = await this.sp("GET", `/reports/2021-06-30/documents/${r.body.reportDocumentId}`);
      if (d.status !== 200) throw new Error(`getReportDocument ${d.status}: ${errText(d)}`);
      const res = await fetch(d.body.url);
      if (!res.ok) throw new Error(`Report download ${res.status}`);
      let stream = res.body;
      if (d.body.compressionAlgorithm === "GZIP") stream = stream.pipeThrough(new DecompressionStream("gzip"));
      const text = await new Response(stream).text();
      const n = this.importOrders(text);
      this.set("lastIngest", { at: Date.now(), since: pending.since, rows: n });
      this.set("syncedThrough", pending.until);
      this.set("planDirty", true);
      this.log("info", `Synced ${n.orders} orders from Amazon (${n.inserted} new, ${n.updated} updated)`);
      return;
    }
    const last = this.get("lastIngest");
    const through = this.get("syncedThrough");
    const catchingUp = through && Date.now() - Date.parse(through) > 3 * HOUR; // first sync runs in 5-day chunks
    if (!force && !catchingUp && last && Date.now() - last.at < INGEST_EVERY) return;
    const since = new Date(Math.max(through ? Date.parse(through) - 2 * HOUR : 0, Date.now() - BACKFILL_DAYS * DAY));
    const until = new Date(Math.min(Date.now() - 5 * 60000, since.getTime() + 5 * DAY));
    const r = await this.sp("POST", "/reports/2021-06-30/reports", null, {
      reportType: "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL",
      marketplaceIds: [MARKETPLACE],
      dataStartTime: since.toISOString(),
      dataEndTime: until.toISOString(),
    });
    if (r.status !== 202 && r.status !== 200) throw new Error(`createReport ${r.status}: ${errText(r)}`);
    this.set("pendingReport", { reportId: r.body.reportId, requestedAt: Date.now(), since: since.toISOString(), until: until.toISOString() });
  }

  importOrders(text) {
    const lines = text.split(/\r?\n/);
    const head = lines.shift().split("\t");
    const col = (n) => head.indexOf(n);
    const C = {
      id: col("amazon-order-id"), purchase: col("purchase-date"), updated: col("last-updated-date"), status: col("order-status"),
      channel: col("fulfillment-channel"), sales: col("sales-channel"), title: col("product-name"), sku: col("sku"), asin: col("asin"),
      itemStatus: col("item-status"), qty: col("quantity"), currency: col("currency"), price: col("item-price"),
      state: col("ship-state"), country: col("ship-country"), business: col("is-business-order"),
    };
    const orders = new Map();
    let rows = 0;
    for (const line of lines) {
      if (!line) continue;
      const f = line.split("\t");
      const id = f[C.id];
      if (!id || (C.sales >= 0 && f[C.sales] && !/^amazon\./i.test(f[C.sales]))) continue;
      rows++;
      let o = orders.get(id);
      if (!o) {
        o = {
          id, purchase: Date.parse(f[C.purchase]), updated: Date.parse(f[C.updated]) || Date.now(), status: f[C.status], channel: f[C.channel],
          business: /^true$/i.test(f[C.business] ?? "") ? 1 : 0, state: normState(f[C.state]), country: f[C.country] || null,
          currency: f[C.currency] || "USD", items: new Map(),
        };
        orders.set(id, o);
      }
      const asin = f[C.asin];
      if (!asin) continue;
      const qty = Number(f[C.qty]) || 0;
      const price = Number(f[C.price]) || 0;
      const prev = o.items.get(asin);
      if (prev) { prev.qty += qty; prev.price += price; } else o.items.set(asin, { sku: f[C.sku], title: f[C.title], qty, price, cancelled: /cancel/i.test(f[C.itemStatus] ?? "") });
    }
    const products = new Map();
    const pdays = new Map();
    let inserted = 0, updated = 0;
    this.state.storage.transactionSync(() => {
      for (const o of orders.values()) {
        let units = 0, total = 0;
        for (const it of o.items.values()) { units += it.qty; total += it.price; }
        for (const [asin, it] of o.items) {
          const p = products.get(asin);
          if (!p) products.set(asin, { sku: it.sku, title: it.title || null, last: o.purchase });
          else if (o.purchase > p.last) p.last = o.purchase;
        }
        const prev = this.one("SELECT status, updated_ms FROM orders WHERE order_id=?", o.id);
        if (!prev) {
          this.run(
            `INSERT INTO orders(order_id,purchase_ms,updated_ms,status,channel,is_business,ship_state,ship_country,units,total,currency)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            o.id, o.purchase, o.updated, o.status, o.channel, o.business, o.state, o.country, units, round2(total), o.currency);
          for (const [asin, it] of o.items) {
            this.run("INSERT OR IGNORE INTO order_items(order_id,asin,sku,qty,price) VALUES(?,?,?,?,?)", o.id, asin, it.sku, it.qty, round2(it.price));
            const key = asin + "|" + Math.floor(o.purchase / DAY);
            const c = pdays.get(key) ?? { orders: 0, units: 0 };
            c.orders++; c.units += it.qty; pdays.set(key, c);
          }
          inserted++;
        } else if (prev.status !== o.status || prev.updated_ms !== o.updated) {
          // only the order row changes after the first import (status, totals); items stay as they were
          this.run("UPDATE orders SET status=?, updated_ms=?, units=?, total=?, ship_state=COALESCE(?, ship_state) WHERE order_id=?", o.status, o.updated, units, round2(total), o.state, o.id);
          updated++;
          // a cancelled order never gets a request
          if (/cancel/i.test(o.status)) this.run("UPDATE requests SET status='skipped', last_error='Order cancelled', updated_at=? WHERE order_id=? AND status IN ('scheduled','retry')", Date.now(), o.id);
        }
      }
      for (const [key, c] of pdays) {
        const [asin, day] = key.split("|");
        this.run("INSERT INTO product_days(asin,day,orders,units) VALUES(?,?,?,?) ON CONFLICT DO UPDATE SET orders=orders+excluded.orders, units=units+excluded.units", asin, Number(day), c.orders, c.units);
      }
      if (inserted) this.set("ordersStored", (this.get("ordersStored", 0) || 0) + inserted);
      // one write per product per sync, and none when nothing changed
      for (const [asin, p] of products) {
        this.run(
          `INSERT INTO products(asin,sku,title,first_seen,last_order) VALUES(?,?,?,?,?)
           ON CONFLICT(asin) DO UPDATE SET sku=COALESCE(products.sku, excluded.sku), title=COALESCE(excluded.title, products.title),
             last_order=MAX(COALESCE(products.last_order,0), excluded.last_order)
           WHERE products.last_order IS NULL OR excluded.last_order > products.last_order OR products.title IS NULL`,
          asin, p.sku, p.title, Date.now(), p.last);
      }
    });
    return { orders: orders.size, rows, inserted, updated };
  }

  // ---- 2. decide which orders get a request, and when
  // full=false after an order sync: only adds requests for new orders.
  // full=true after settings or product changes: also drops requests that no longer
  // qualify and moves send dates whose delay changed. Rows are only written when they change.
  plan(full = false, what = { delays: true, disabled: true }) {
    const s = this.settings();
    const now = Date.now();
    this.set("planDirty", false);
    const start = Math.max(s.startDate ? Date.parse(s.startDate) : 0, now - MAX_ORDER_AGE_DAYS * DAY);
    const skipBiz = s.skipBusiness ? 1 : 0;
    const eligible = `SELECT o.order_id FROM orders o JOIN order_items i ON i.order_id=o.order_id JOIN products p ON p.asin=i.asin AND p.enabled=1
                      WHERE o.status NOT LIKE '%ancel%' AND o.purchase_ms >= ?1 AND (?2 = 0 OR o.is_business = 0)`;
    this.state.storage.transactionSync(() => {
      if (full) {
        this.run(`DELETE FROM requests WHERE status IN ('scheduled','retry') AND order_id NOT IN (${eligible})`, start, skipBiz);
        if (what.delays) {
        const delayOf = `(SELECT MIN(COALESCE(p.delay_override, ?1)) FROM order_items i JOIN products p ON p.asin=i.asin AND p.enabled=1 WHERE i.order_id=requests.order_id)`;
        this.run(`UPDATE requests SET delay_days=${delayOf}, due_at=purchase_ms + ${delayOf} * 86400000, updated_at=?2
                  WHERE status='scheduled' AND delay_days IS NOT ${delayOf}`, s.delayDays, now);
        }
        if (what.disabled) this.run(`UPDATE requests SET asin=(SELECT MIN(p.asin) FROM order_items i JOIN products p ON p.asin=i.asin AND p.enabled=1 WHERE i.order_id=requests.order_id)
                  WHERE status IN ('scheduled','retry') AND asin NOT IN (SELECT asin FROM products WHERE enabled=1)`);
      }
      this.run(
        `INSERT INTO requests(order_id, asin, purchase_ms, due_at, delay_days, status, attempts, updated_at)
         SELECT o.order_id, MIN(p.asin), o.purchase_ms,
                o.purchase_ms + MIN(COALESCE(p.delay_override, ?1)) * 86400000,
                MIN(COALESCE(p.delay_override, ?1)), 'scheduled', 0, ?2
         FROM orders o
         JOIN order_items i ON i.order_id = o.order_id
         JOIN products p ON p.asin = i.asin AND p.enabled = 1
         WHERE o.status NOT LIKE '%ancel%' AND o.purchase_ms >= ?3 AND (?4 = 0 OR o.is_business = 0)
           AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.order_id = o.order_id)
         GROUP BY o.order_id`,
        s.delayDays, now, full ? start : Math.max(start, now - 4 * DAY), skipBiz); // after a sync only recent orders can be new
    });
  }

  // ---- 3. send what is due
  async sendDue() {
    const s = this.settings();
    if (!s.active) return;
    const now = Date.now();
    const due = this.all(
      `SELECT r.order_id, r.asin, r.purchase_ms, r.attempts, o.status FROM requests r JOIN orders o ON o.order_id=r.order_id
       WHERE r.status IN ('scheduled','retry') AND r.due_at <= ? ORDER BY r.due_at LIMIT ?`, now, SEND_BATCH);
    let sent = 0, notYet = 0, inel = 0;
    for (const r of due) {
      const age = (now - r.purchase_ms) / DAY;
      if (age > MAX_ORDER_AGE_DAYS) { this.mark(r, "expired", "Past Amazon's 30-day request window"); continue; }
      if (!/^shipped/i.test(r.status)) { this.retryLater(r, 12 * HOUR, `Order status is ${r.status}`); continue; }
      const res = await this.sp("POST", `/solicitations/v1/orders/${r.order_id}/solicitations/productReviewAndSellerFeedback`, { marketplaceIds: MARKETPLACE });
      if (res.status === 201 || res.status === 200) {
        this.run("UPDATE requests SET status='sent', sent_at=?, attempts=attempts+1, last_error=NULL, updated_at=? WHERE order_id=?", now, now, r.order_id);
        this.countOutcome(r.asin, "sent");
        sent++;
      } else if (res.status === 429) {
        this.log("warn", "Amazon rate limit reached; continuing next run.");
        break;
      } else if (res.status >= 500 || res.status === 0) {
        this.retryLater(r, HOUR, `Amazon error ${res.status}: ${errText(res)}`);
      } else {
        // Not eligible (yet). Usually: not delivered long enough, already requested, or a return.
        const msg = errText(res);
        if (/already/i.test(msg)) { this.mark(r, "already", msg); continue; }
        if (age < 30 && r.attempts < 4) { this.retryLater(r, DAY, msg); notYet++; }
        else { this.mark(r, "ineligible", msg); inel++; }
      }
      await sleep(1100); // Solicitations API allows 1 request/second
    }
    if (due.length) this.log("info", `Review requests: ${sent} sent${notYet ? `, ${notYet} not eligible yet (will retry)` : ""}${inel ? `, ${inel} ineligible` : ""}`);
  }

  retryLater(r, ms, err) {
    this.run("UPDATE requests SET status='retry', attempts=attempts+1, due_at=?, last_error=?, updated_at=? WHERE order_id=?", Date.now() + ms, err, Date.now(), r.order_id);
  }
  mark(r, status, err) {
    this.run("UPDATE requests SET status=?, attempts=attempts+1, last_error=?, updated_at=? WHERE order_id=?", status, err, Date.now(), r.order_id);
    this.countOutcome(r.asin, status);
  }
  countOutcome(asin, status) {
    this.run("INSERT INTO outcome_days(day,asin,status,n) VALUES(?,?,?,1) ON CONFLICT DO UPDATE SET n=n+1", Math.floor(Date.now() / DAY), asin ?? "", status);
  }

  // ---- 4. customer feedback snapshots (brand-registered ASINs)
  async snapshotFeedback() {
    const now = Date.now();
    const todo = this.all(
      `SELECT p.asin FROM products p LEFT JOIN (SELECT asin, MAX(taken_at) t FROM feedback GROUP BY asin) f ON f.asin=p.asin
       WHERE p.enabled=1 AND (f.t IS NULL OR f.t < ?) LIMIT 3`, now - FEEDBACK_EVERY);
    for (const { asin } of todo) {
      const r = await this.sp("GET", `/customerFeedback/2024-06-01/items/${asin}/reviews/topics`, { marketplaceId: MARKETPLACE, sortBy: "MENTIONS" });
      if (r.status !== 200) {
        this.run("INSERT OR REPLACE INTO feedback(asin,taken_at,ok,pos_mentions,neg_mentions,data) VALUES(?,?,0,0,0,?)", asin, now, JSON.stringify({ error: errText(r) }));
        continue;
      }
      const t = r.body.topics ?? {};
      const pick = (arr) => (arr ?? []).map((x) => ({
        topic: x.topic, mentions: x.asinMetrics?.numberOfMentions ?? 0, share: x.asinMetrics?.occurrencePercentage ?? null,
        starImpact: x.asinMetrics?.starRatingImpact ?? null, snippets: (x.reviewSnippets ?? []).slice(0, 3),
      }));
      const pos = pick(t.positiveTopics), neg = pick(t.negativeTopics);
      const sum = (a) => a.reduce((n, x) => n + (x.mentions || 0), 0);
      this.run("INSERT OR REPLACE INTO feedback(asin,taken_at,ok,pos_mentions,neg_mentions,data) VALUES(?,?,1,?,?,?)",
        asin, now, sum(pos), sum(neg), JSON.stringify({ pos, neg, range: r.body.dateRange }));
      await sleep(1100);
    }
  }

  // ---- Amazon SP-API client (direct LWA credentials, or through the commerce-mcp Worker)
  credentialMode() {
    if (this.env.LWA_CLIENT_ID && this.env.LWA_CLIENT_SECRET && this.env.SP_REFRESH_TOKEN) return "direct";
    if (this.env.COMMERCE && this.env.COMMERCE_MCP_SECRET) return "commerce-mcp";
    return null;
  }

  async sp(method, path, query, body) {
    return this.credentialMode() === "direct" ? this.spDirect(method, path, query, body) : this.spViaMcp(method, path, query, body);
  }

  async spDirect(method, path, query, body) {
    if (!this.token || this.token.exp < Date.now() + 60000) {
      const r = await fetch("https://api.amazon.com/auth/o2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.env.SP_REFRESH_TOKEN, client_id: this.env.LWA_CLIENT_ID, client_secret: this.env.LWA_CLIENT_SECRET }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`Amazon login failed: ${j.error_description ?? j.error ?? r.status}`);
      this.token = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    }
    const qs = query ? "?" + new URLSearchParams(query) : "";
    const res = await fetch(`https://sellingpartnerapi-na.amazon.com${path}${qs}`, {
      method,
      headers: { "x-amz-access-token": this.token.v, "content-type": "application/json", "user-agent": "ReviewRequester/1.0 (Language=JavaScript)" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let b; try { b = txt ? JSON.parse(txt) : {}; } catch { b = { raw: txt }; }
    return { status: res.status, body: b };
  }

  async spViaMcp(method, path, query, body) {
    const res = await this.env.COMMERCE.fetch(`https://commerce-mcp/mcp/${this.env.COMMERCE_MCP_SECRET}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "amazon_raw_request", arguments: { method, path, query: query ?? undefined, body: body ?? undefined } } }),
    });
    if (res.status === 401) throw new Error("COMMERCE_MCP_SECRET was rejected by commerce-mcp");
    const j = await res.json();
    const text = j.result?.content?.[0]?.text ?? j.error?.message ?? "";
    if (j.result?.isError || j.error) {
      const code = Number((text.match(/\b([45]\d\d)\b/) ?? [])[1]) || 500;
      return { status: code, body: { errors: [{ message: text.replace(/^Error:\s*/, "") }] } };
    }
    let out; try { out = JSON.parse(text); } catch { out = { raw: text }; }
    if (out && typeof out.status === "number" && "body" in out) return { status: out.status, body: out.body ?? {} };
    return { status: 200, body: out };
  }

  // ---- views for the dashboard
  stateView() {
    const now = Date.now();
    const s = this.settings();
    const today = Math.floor(now / DAY);
    // reads stay small: daily counters plus the queued requests (index range)
    const queuedRows = this.all("SELECT asin, status, due_at FROM requests WHERE status IN ('scheduled','retry')");
    const queuedBy = {}, upcomingMap = {}, counts = {};
    for (const r of queuedRows) {
      queuedBy[r.asin] = (queuedBy[r.asin] || 0) + 1;
      counts[r.status] = (counts[r.status] || 0) + 1;
      const d = Math.floor((Math.max(r.due_at, now) - startOfDay(now)) / DAY);
      if (d < 14) upcomingMap[d] = (upcomingMap[d] || 0) + 1;
    }
    const outcomes = this.all("SELECT day, asin, status, n FROM outcome_days");
    const outBy = {}, sentDaily = {}, failDaily = {};
    let sent7 = 0, sent30 = 0;
    for (const o of outcomes) {
      counts[o.status] = (counts[o.status] || 0) + o.n;
      const a = (outBy[o.asin] ||= { sent: 0, inel: 0 });
      const d = o.day - (today - 29);
      if (o.status === "sent") {
        a.sent += o.n;
        if (d >= 0) sentDaily[d] = (sentDaily[d] || 0) + o.n;
        if (o.day > today - 7) sent7 += o.n;
        if (o.day > today - 30) sent30 += o.n;
      } else if (["ineligible", "expired", "already"].includes(o.status)) {
        a.inel += o.n;
        if (d >= 0) failDaily[d] = (failDaily[d] || 0) + o.n;
      }
    }
    const pd = Object.fromEntries(this.all("SELECT asin, SUM(orders) n30, SUM(units) u30 FROM product_days WHERE day > ? GROUP BY asin", today - 30).map((r) => [r.asin, r]));
    const products = this.all("SELECT asin, sku, title, enabled, delay_override, last_order FROM products").map((p) => ({
      ...p, orders30: pd[p.asin]?.n30 || 0, units30: pd[p.asin]?.u30 || 0,
      sent: outBy[p.asin]?.sent || 0, queued: queuedBy[p.asin] || 0, inel: outBy[p.asin]?.inel || 0,
    })).sort((a, b) => b.enabled - a.enabled || b.orders30 - a.orders30 || (b.last_order || 0) - (a.last_order || 0));
    // coverage: orders of selected products that are old enough to be due, vs requests sent
    const startDay = s.startDate ? Math.floor(Date.parse(s.startDate) / DAY) : 0;
    const eligibleOrders30 = this.one(
      `SELECT COALESCE(SUM(d.orders),0) n FROM product_days d JOIN products p ON p.asin=d.asin AND p.enabled=1
       WHERE d.day > ? AND d.day <= ? AND d.day >= ?`, today - 30 - s.delayDays, today - s.delayDays, startDay).n;
    const toArr = (m) => Object.entries(m).map(([d, n]) => ({ d: Number(d), n }));
    return {
      settings: s,
      credentials: this.credentialMode(),
      lastTick: this.get("lastTick"), lastIngest: this.get("lastIngest"), pendingReport: this.get("pendingReport"), lastError: this.get("lastError"),
      pendingChanges: !!this.get("planFull", null),
      ordersStored: this.get("ordersStored", 0),
      counts, sent7, eligibleOrders30, sentFor30: sent30,
      series: { start: startOfDay(now) - 29 * DAY, sent: toArr(sentDaily), failed: toArr(failDaily), upcomingStart: startOfDay(now), upcoming: toArr(upcomingMap) },
      products,
      events: this.all("SELECT ts, level, msg FROM events ORDER BY id DESC LIMIT 60"),
    };
  }

  insightsView() {
    const now = Date.now(), since = now - 30 * DAY;
    const enabledJoin = `JOIN (SELECT DISTINCT i.order_id FROM order_items i JOIN products p ON p.asin=i.asin AND p.enabled=1) e ON e.order_id=o.order_id`;
    const scope = this.one("SELECT COUNT(*) n FROM products WHERE enabled=1").n ? enabledJoin : "";
    const base = `FROM orders o ${scope} WHERE o.purchase_ms > ? AND o.status NOT LIKE '%ancel%'`;
    const totals = this.one(`SELECT COUNT(*) orders, SUM(o.is_business) business, AVG(o.units) avg_units, AVG(o.total) aov, SUM(o.total) revenue, SUM(o.channel='Amazon') fba ${base}`, since);
    const states = this.all(`SELECT o.ship_state state, COUNT(*) n ${base} AND o.ship_state IS NOT NULL GROUP BY o.ship_state ORDER BY n DESC LIMIT 12`, since);
    const units = this.all(`SELECT MIN(o.units, 5) u, COUNT(*) n ${base} GROUP BY MIN(o.units, 5) ORDER BY u`, since);
    const weekday = this.all(`SELECT CAST(strftime('%w', o.purchase_ms/1000, 'unixepoch', '-5 hours') AS INTEGER) d, COUNT(*) n ${base} GROUP BY d ORDER BY d`, since);
    const outcomes = this.all("SELECT status, COUNT(*) n FROM requests GROUP BY status");
    const reasons = this.all("SELECT last_error reason, COUNT(*) n FROM requests WHERE status IN ('ineligible','expired','already','retry') AND last_error IS NOT NULL GROUP BY last_error ORDER BY n DESC LIMIT 8");
    const feedback = this.all(
      `SELECT f.asin, p.title, f.taken_at, f.ok, f.pos_mentions, f.neg_mentions, f.data,
              (SELECT pos_mentions + neg_mentions FROM feedback f0 WHERE f0.asin=f.asin AND f0.ok=1 ORDER BY taken_at ASC LIMIT 1) first_total,
              (SELECT MIN(taken_at) FROM feedback f0 WHERE f0.asin=f.asin AND f0.ok=1) first_at
       FROM feedback f JOIN products p ON p.asin=f.asin
       WHERE f.taken_at = (SELECT MAX(taken_at) FROM feedback f2 WHERE f2.asin=f.asin)
       ORDER BY f.ok DESC, (f.pos_mentions+f.neg_mentions) DESC`).map((r) => ({ ...r, data: JSON.parse(r.data || "{}") }));
    return { totals, states, units, weekday, outcomes, reasons, feedback, scopedToSelected: !!scope };
  }

  requestsView(q) {
    const status = q.get("status");
    const search = (q.get("q") ?? "").trim();
    const where = [], args = [];
    if (status && status !== "all") {
      if (status === "queued") where.push("r.status IN ('scheduled','retry')");
      else if (status === "problem") where.push("r.status IN ('ineligible','expired','already','skipped')");
      else { where.push("r.status=?"); args.push(status); }
    }
    if (search) { where.push("(r.order_id LIKE ? OR r.asin LIKE ? OR p.title LIKE ?)"); args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const rows = this.all(
      `SELECT r.order_id, r.asin, p.title, r.purchase_ms, r.due_at, r.delay_days, r.status, r.attempts, r.sent_at, r.last_error
       FROM requests r LEFT JOIN products p ON p.asin=r.asin ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY COALESCE(r.sent_at, r.due_at) DESC LIMIT 300`, ...args);
    return { rows };
  }

  exportCsv() {
    const rows = this.all(`SELECT r.order_id, r.asin, p.title, r.purchase_ms, r.due_at, r.delay_days, r.status, r.attempts, r.sent_at, r.last_error
                           FROM requests r LEFT JOIN products p ON p.asin=r.asin ORDER BY r.purchase_ms DESC`);
    const iso = (t) => (t ? new Date(t).toISOString() : "");
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = ["order_id,asin,product,purchase_date,scheduled_for,delay_days,status,attempts,sent_at,note"];
    for (const r of rows) out.push([r.order_id, r.asin, r.title, iso(r.purchase_ms), iso(r.due_at), r.delay_days, r.status, r.attempts, iso(r.sent_at), r.last_error].map(esc).join(","));
    return new Response(out.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=review-requests.csv" } });
  }
}

// ---------------------------------------------------------------- utils
function isLimitError(e) { return /exceeded allowed|free tier|rows (read|written)|daily limit|storage limit/i.test(String(e?.message ?? e)); }
function json(v, status = 200) { return new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function html(v, status = 200) {
  return new Response(v, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" } });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function round2(n) { return Math.round(n * 100) / 100; }
function clampDelay(v) { const n = Math.round(Number(v)); if (!Number.isFinite(n)) return 7; return Math.min(30, Math.max(5, n)); }
function startOfDay(t) { return Math.floor(t / DAY) * DAY; }
function normState(s) { if (!s) return null; const t = s.trim().toUpperCase(); return t.length ? t : null; }
function errText(r) {
  const e = r.body?.errors?.[0];
  return e ? [e.code, e.message, e.details].filter(Boolean).join(" — ") : (r.body?.raw ?? `HTTP ${r.status}`).toString().slice(0, 300);
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sessionToken(env) { return hmac(env.ADMIN_PASSWORD, "review-requester-session-v1"); }
async function safeEqual(a, b) { const [x, y] = await Promise.all([hmac("cmp", a), hmac("cmp", b)]); return x === y; }
async function isAuthed(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const c = request.headers.get("cookie") ?? "";
  const m = c.match(/(?:^|;\s*)rr_session=([a-f0-9]{64})/);
  return !!m && (await safeEqual(m[1], await sessionToken(env)));
}
