// Indian Craft Supply CRM — Cloudflare Worker + Durable Object (SQLite)
import { DurableObject } from "cloudflare:workers";
import PostalMime from "postal-mime";

const stub = (env) => env.CRM.get(env.CRM.idFromName("main"));

export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/api/") || p.startsWith("/t/") || p.startsWith("/u/")) return stub(env).fetch(req);
    return env.ASSETS.fetch(req);
  },
  // Inbound email via Cloudflare Email Routing (route an address like sales@yourdomain to this Worker)
  async email(message, env) {
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const m = await PostalMime.parse(raw);
      await stub(env).inboundEmail({
        envelopeFrom: message.from, to: message.to,
        fromAddress: m.from?.address || message.from, fromName: m.from?.name || "",
        subject: m.subject || "(no subject)", text: m.text || "", html: m.html || "",
        messageId: m.messageId || "",
      });
    } catch (e) { console.error("inbound email failed", e); }
    if (env.FORWARD_TO) { try { await message.forward(env.FORWARD_TO); } catch (e) { console.error(e); } }
  },
};

// ---------------------------------------------------------------- constants
export const STAGES = ["Lead", "Qualified", "Sample Sent", "Quote Sent", "Negotiation", "Won", "Lost"];
const STAGE_PROB = { Lead: 10, Qualified: 25, "Sample Sent": 40, "Quote Sent": 60, Negotiation: 80, Won: 100, Lost: 0 };
const SLA_HOURS = { Urgent: 4, High: 24, Normal: 48, Low: 96 };
const RANK = { viewer: 0, support: 1, sales: 1, manager: 2, admin: 3 };
const ROLES = Object.keys(RANK);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales', title TEXT, phone TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0, last_login TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT, ip TEXT, ua TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, ip TEXT, ok INTEGER, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT DEFAULT 'Prospect',
    industry TEXT, website TEXT, phone TEXT, email TEXT, address TEXT, city TEXT, state TEXT, zip TEXT, country TEXT,
    tax_id TEXT, payment_terms TEXT, credit_limit REAL, annual_volume TEXT, employees TEXT, rating TEXT, tags TEXT, notes TEXT,
    parent_id INTEGER, owner_id INTEGER, created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT,
    company_id INTEGER, title TEXT, department TEXT, email TEXT, phone TEXT, mobile TEXT, whatsapp TEXT,
    type TEXT DEFAULT 'Lead', status TEXT DEFAULT 'Active', rating TEXT DEFAULT 'Warm', lead_source TEXT, lead_score INTEGER DEFAULT 0,
    products_interest TEXT, monthly_volume TEXT, tags TEXT, address TEXT, city TEXT, state TEXT, zip TEXT, country TEXT,
    preferred_channel TEXT, birthday TEXT, linkedin TEXT, notes TEXT, owner_id INTEGER, unsubscribed INTEGER DEFAULT 0,
    unsub_token TEXT, last_contacted TEXT, created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id)`,
  `CREATE TABLE IF NOT EXISTS relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, from_type TEXT NOT NULL, from_id INTEGER NOT NULL,
    to_type TEXT NOT NULL, to_id INTEGER NOT NULL, kind TEXT NOT NULL, strength TEXT DEFAULT 'Medium', notes TEXT, created_by INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, company_id INTEGER, deal_id INTEGER,
    ticket_id INTEGER, email_id INTEGER, type TEXT NOT NULL, direction TEXT, subject TEXT, body TEXT, outcome TEXT, occurred_at TEXT,
    duration_min INTEGER, follow_up TEXT, user_id INTEGER, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_int_contact ON interactions(contact_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, contact_id INTEGER, company_id INTEGER,
    stage TEXT DEFAULT 'Lead', value REAL DEFAULT 0, probability INTEGER, expected_close TEXT, product_lines TEXT, source TEXT,
    lost_reason TEXT, next_step TEXT, notes TEXT, owner_id INTEGER, closed_at TEXT, created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS deal_stage_history (id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id INTEGER, from_stage TEXT, to_stage TEXT, user_id INTEGER, at TEXT)`,
  `CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'To-do',
    due_at TEXT, priority TEXT DEFAULT 'Normal', status TEXT DEFAULT 'Open', contact_id INTEGER, company_id INTEGER, deal_id INTEGER,
    ticket_id INTEGER, assigned_to INTEGER, created_by INTEGER, completed_at TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, name TEXT NOT NULL, category TEXT, description TEXT,
    unit TEXT, price REAL DEFAULT 0, cost REAL, moq REAL, stock REAL, lead_time_days INTEGER, gsm TEXT, width TEXT, active INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, description TEXT, contact_id INTEGER,
    company_id INTEGER, category TEXT DEFAULT 'General', priority TEXT DEFAULT 'Normal', status TEXT DEFAULT 'Open', channel TEXT DEFAULT 'Email',
    assigned_to INTEGER, due_at TEXT, resolved_at TEXT, satisfaction INTEGER, resolution TEXT, created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS ticket_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, user_id INTEGER, author TEXT,
    body TEXT, internal INTEGER DEFAULT 0, emailed INTEGER DEFAULT 0, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, subject TEXT, body_html TEXT,
    created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject TEXT, preheader TEXT, body_html TEXT,
    segment TEXT, status TEXT DEFAULT 'Draft', sent_at TEXT, created_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS campaign_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, contact_id INTEGER, email TEXT,
    token TEXT UNIQUE, status TEXT DEFAULT 'Queued', provider_id TEXT, error TEXT, sent_at TEXT, opened_at TEXT, open_count INTEGER DEFAULT 0,
    clicked_at TEXT, click_count INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id, status)`,
  `CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, deal_id INTEGER, ticket_id INTEGER,
    direction TEXT, from_addr TEXT, to_addr TEXT, subject TEXT, body_html TEXT, body_text TEXT, status TEXT, error TEXT, provider_id TEXT,
    token TEXT, opened_at TEXT, open_count INTEGER DEFAULT 0, user_id INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity TEXT, entity_id INTEGER,
    details TEXT, at TEXT)`,
];

const nowIso = () => new Date().toISOString();
const rid = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();
const normTags = (v) => v == null ? null : String(v).split(",").map((t) => t.trim()).filter(Boolean).join(",");
const validEmail = (e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(e || ""));
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------------------------------------------------------------- entity definitions
const ENT = {
  companies: {
    table: "companies", a: "co",
    select: `SELECT co.*, u.name AS owner_name, p.name AS parent_name,
      (SELECT COUNT(*) FROM contacts c WHERE c.company_id=co.id) AS contact_count,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.company_id=co.id AND d.stage='Won') AS won_value,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.company_id=co.id AND d.stage NOT IN ('Won','Lost')) AS open_value
      FROM companies co LEFT JOIN users u ON u.id=co.owner_id LEFT JOIN companies p ON p.id=co.parent_id`,
    fields: ["name", "type", "industry", "website", "phone", "email", "address", "city", "state", "zip", "country", "tax_id", "payment_terms", "credit_limit", "annual_volume", "employees", "rating", "tags", "notes", "parent_id", "owner_id"],
    required: ["name"], search: ["co.name", "co.email", "co.city", "co.industry", "co.tags", "co.phone"],
    sortExtra: ["owner_name", "contact_count", "won_value", "open_value"], label: (r) => r.name,
  },
  contacts: {
    table: "contacts", a: "c",
    select: `SELECT c.*, co.name AS company_name, u.name AS owner_name FROM contacts c
      LEFT JOIN companies co ON co.id=c.company_id LEFT JOIN users u ON u.id=c.owner_id`,
    fields: ["first_name", "last_name", "company_id", "title", "department", "email", "phone", "mobile", "whatsapp", "type", "status", "rating", "lead_source", "lead_score", "products_interest", "monthly_volume", "tags", "address", "city", "state", "zip", "country", "preferred_channel", "birthday", "linkedin", "notes", "owner_id", "unsubscribed"],
    required: ["first_name"], search: ["c.first_name", "c.last_name", "c.email", "c.phone", "c.mobile", "co.name", "c.city", "c.tags", "c.first_name || ' ' || c.last_name"],
    sortExtra: ["company_name", "owner_name"], label: (r) => `${r.first_name} ${r.last_name || ""}`.trim(),
  },
  deals: {
    table: "deals", a: "d",
    select: `SELECT d.*, co.name AS company_name, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, u.name AS owner_name,
      ROUND(d.value * COALESCE(d.probability,0) / 100.0, 2) AS weighted_value
      FROM deals d LEFT JOIN companies co ON co.id=d.company_id LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN users u ON u.id=d.owner_id`,
    fields: ["title", "contact_id", "company_id", "stage", "value", "probability", "expected_close", "product_lines", "source", "lost_reason", "next_step", "notes", "owner_id"],
    required: ["title"], search: ["d.title", "co.name", "c.first_name", "c.last_name", "d.notes"],
    sortExtra: ["company_name", "contact_name", "owner_name", "weighted_value"], label: (r) => r.title,
  },
  interactions: {
    table: "interactions", a: "i",
    select: `SELECT i.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, co.name AS company_name, d.title AS deal_title, u.name AS user_name
      FROM interactions i LEFT JOIN contacts c ON c.id=i.contact_id LEFT JOIN companies co ON co.id=i.company_id
      LEFT JOIN deals d ON d.id=i.deal_id LEFT JOIN users u ON u.id=i.user_id`,
    fields: ["contact_id", "company_id", "deal_id", "ticket_id", "type", "direction", "subject", "body", "outcome", "occurred_at", "duration_min", "follow_up", "user_id"],
    required: ["type"], search: ["i.subject", "i.body", "c.first_name", "c.last_name", "co.name"],
    sortExtra: ["contact_name", "company_name", "user_name"], defaultSort: "occurred_at", label: (r) => r.subject || r.type,
  },
  tasks: {
    table: "tasks", a: "t",
    select: `SELECT t.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, co.name AS company_name, d.title AS deal_title,
      u.name AS assignee_name, cb.name AS creator_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id
      LEFT JOIN companies co ON co.id=t.company_id LEFT JOIN deals d ON d.id=t.deal_id LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN users cb ON cb.id=t.created_by`,
    fields: ["title", "description", "type", "due_at", "priority", "status", "contact_id", "company_id", "deal_id", "ticket_id", "assigned_to"],
    required: ["title"], search: ["t.title", "t.description", "c.first_name", "c.last_name", "co.name"],
    sortExtra: ["contact_name", "company_name", "assignee_name"], defaultSort: "due_at", defaultDir: "ASC", label: (r) => r.title,
  },
  products: {
    table: "products", a: "p", writeRank: 2,
    select: `SELECT p.* FROM products p`,
    fields: ["sku", "name", "category", "description", "unit", "price", "cost", "moq", "stock", "lead_time_days", "gsm", "width", "active"],
    required: ["name"], search: ["p.name", "p.sku", "p.category", "p.description"], defaultSort: "name", defaultDir: "ASC", label: (r) => r.name,
  },
  tickets: {
    table: "tickets", a: "tk",
    select: `SELECT tk.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, c.email AS contact_email, co.name AS company_name, u.name AS assignee_name,
      (SELECT COUNT(*) FROM ticket_comments x WHERE x.ticket_id=tk.id) AS comment_count
      FROM tickets tk LEFT JOIN contacts c ON c.id=tk.contact_id LEFT JOIN companies co ON co.id=tk.company_id LEFT JOIN users u ON u.id=tk.assigned_to`,
    fields: ["subject", "description", "contact_id", "company_id", "category", "priority", "status", "channel", "assigned_to", "due_at", "satisfaction", "resolution"],
    required: ["subject"], search: ["tk.subject", "tk.description", "c.first_name", "c.last_name", "co.name", "CAST(tk.id AS TEXT)"],
    sortExtra: ["contact_name", "company_name", "assignee_name"], label: (r) => `#${r.id} ${r.subject}`,
  },
  relationships: {
    table: "relationships", a: "r", select: `SELECT r.* FROM relationships r`,
    fields: ["from_type", "from_id", "to_type", "to_id", "kind", "strength", "notes"],
    required: ["from_type", "from_id", "to_type", "to_id", "kind"], search: ["r.kind", "r.notes"], label: (r) => r.kind,
  },
  templates: {
    table: "templates", a: "tp", select: `SELECT tp.* FROM templates tp`,
    fields: ["name", "category", "subject", "body_html"], required: ["name"], search: ["tp.name", "tp.subject", "tp.category"],
    defaultSort: "name", defaultDir: "ASC", label: (r) => r.name,
  },
  campaigns: {
    table: "campaigns", a: "cm",
    select: `SELECT cm.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=cm.id) AS recipients,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=cm.id AND r.status IN ('Sent','Opened','Clicked')) AS sent,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=cm.id AND r.opened_at IS NOT NULL) AS opened,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=cm.id AND r.clicked_at IS NOT NULL) AS clicked,
      (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=cm.id AND r.status='Failed') AS failed
      FROM campaigns cm LEFT JOIN users u ON u.id=cm.created_by`,
    fields: ["name", "subject", "preheader", "body_html", "segment"], required: ["name"], search: ["cm.name", "cm.subject"], label: (r) => r.name,
  },
  emails: {
    table: "emails", a: "e", readOnly: true,
    select: `SELECT e.id, e.contact_id, e.deal_id, e.ticket_id, e.direction, e.from_addr, e.to_addr, e.subject, e.status, e.error, e.opened_at, e.open_count, e.created_at, e.user_id,
      (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, u.name AS user_name FROM emails e LEFT JOIN contacts c ON c.id=e.contact_id LEFT JOIN users u ON u.id=e.user_id`,
    fields: ["contact_id", "deal_id", "ticket_id", "direction", "status"], search: ["e.subject", "e.to_addr", "e.from_addr", "c.first_name", "c.last_name"], label: (r) => r.subject,
  },
};

const DEFAULT_SETTINGS = {
  company_name: "Indian Craft Supply", company_tagline: "Wholesale jute, burlap & cotton", company_address: "", company_phone: "", company_website: "",
  currency: "USD", monthly_target: "0", email_from_name: "Indian Craft Supply", email_from_address: "", email_reply_to: "",
  email_signature: "", support_address: "", inbound_address: "",
};
const SECRET_SETTINGS = ["resend_api_key"];

// ---------------------------------------------------------------- Durable Object
export class CrmDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }
  all(q, ...p) { return this.sql.exec(q, ...p.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v))).toArray(); }
  one(q, ...p) { return this.all(q, ...p)[0] || null; }
  setting(k) { const r = this.one("SELECT value FROM settings WHERE key=?", k); return r ? r.value : DEFAULT_SETTINGS[k] ?? null; }

  migrate() {
    for (const s of SCHEMA) this.sql.exec(s);
    const seeded = this.one("SELECT value FROM settings WHERE key='_seeded'");
    if (!seeded) {
      const t = nowIso();
      const prods = [
        ["JUT-HES-10", "Natural Hessian / Burlap Cloth 10 oz", "Burlap", "Yard", "40\"", "10 oz"],
        ["JUT-HES-ROLL", "Burlap Roll 40\" x 100 yd", "Burlap", "Roll", "40\"", "10 oz"],
        ["JUT-BAG-GUN", "Jute Gunny / Sacking Bag 50 kg", "Jute", "Piece", "", ""],
        ["JUT-TWN-3P", "Jute Twine 3-ply", "Jute", "Spool", "", ""],
        ["JUT-YRN", "Jute Yarn (bulk)", "Jute", "Kg", "", ""],
        ["JUT-RIB", "Jute Ribbon / Burlap Ribbon", "Burlap", "Roll", "2.5\"", ""],
        ["COT-CAN-10", "Cotton Canvas Duck 10 oz", "Cotton", "Yard", "60\"", "10 oz"],
        ["COT-MUS", "Unbleached Cotton Muslin", "Cotton", "Yard", "63\"", ""],
        ["COT-BAG-DRW", "Cotton Drawstring Bags", "Cotton", "Piece", "", ""],
        ["BLN-JC-TOTE", "Juco (Jute-Cotton) Tote Bags", "Blends", "Piece", "", ""],
      ];
      for (const p of prods) this.sql.exec(`INSERT INTO products (sku,name,category,unit,width,gsm,price,active,created_at,updated_at) VALUES (?,?,?,?,?,?,0,1,?,?)`, ...p, t, t);
      const tpl = [
        ["Introduction — wholesale supply", "Outreach", "Wholesale jute, burlap & cotton for {{company}}",
          `<p>Hi {{first_name}},</p><p>I'm reaching out from <strong>{{my_company}}</strong>. We supply wholesale <strong>jute, burlap and cotton</strong> fabrics, rolls, bags, twine and ribbon to craft stores, event decorators, packaging companies and manufacturers.</p><p>I'd love to learn what materials {{company}} uses most and send you our current price list and a few free samples.</p><p>Would you have 10 minutes for a quick call this week?</p><p>{{signature}}</p>`],
        ["Sample follow-up", "Sales", "Did the samples arrive, {{first_name}}?",
          `<p>Hi {{first_name}},</p><p>Just checking that the samples we sent reached you and that the weight, weave and width suit your needs.</p><p>If they do, I can put together volume pricing for your first order. Most customers start with a trial order at our minimum quantity.</p><p>{{signature}}</p>`],
        ["Quote follow-up", "Sales", "Your quote from {{my_company}}",
          `<p>Hi {{first_name}},</p><p>Following up on the quote I sent over. Happy to adjust quantities, delivery schedule or payment terms to fit {{company}}.</p><p>Is there anything I can clarify to help you move forward?</p><p>{{signature}}</p>`],
        ["Re-order reminder", "Customer care", "Time to restock, {{first_name}}?",
          `<p>Hi {{first_name}},</p><p>Based on your last order, you may be running low. Reply to this email with quantities and we'll get your re-order moving right away.</p><p>{{signature}}</p>`],
      ];
      for (const x of tpl) this.sql.exec(`INSERT INTO templates (name,category,subject,body_html,created_at,updated_at) VALUES (?,?,?,?,?,?)`, ...x, t, t);
      this.sql.exec("INSERT OR REPLACE INTO settings (key,value) VALUES ('_seeded','1')");
    }
  }

  audit(user, action, entity, id, details) {
    this.sql.exec("INSERT INTO audit_log (user_id,action,entity,entity_id,details,at) VALUES (?,?,?,?,?,?)", user?.id ?? null, action, entity ?? null, id ?? null, details ? String(details).slice(0, 2000) : null, nowIso());
  }

  // ---------------------------------------------------------- HTTP entry
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/t/") || url.pathname.startsWith("/u/")) return await this.publicRoutes(req, url);
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin) fail(403, "Bad origin");
        // Requiring JSON forces a CORS preflight for cross-site writes; DELETE always preflights anyway.
        if (req.method !== "DELETE" && !(req.headers.get("content-type") || "").includes("application/json")) fail(415, "JSON required");
      }
      return await this.api(req, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server error: " + (e.message || e) }, 500);
    }
  }

  async body(req) {
    const t = await req.text();
    if (t.length > 5_000_000) fail(413, "Request too large");
    try { return t ? JSON.parse(t) : {}; } catch { fail(400, "Invalid JSON"); }
  }

  async currentUser(req) {
    const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)crm_sid=([a-f0-9]{64})/);
    if (!m) return null;
    const h = await sha256(m[1]);
    const s = this.one("SELECT * FROM sessions WHERE token_hash=?", h);
    if (!s || s.expires_at < Date.now()) { if (s) this.sql.exec("DELETE FROM sessions WHERE token_hash=?", h); return null; }
    const u = this.one("SELECT id,email,name,role,title,phone,active,must_change_password FROM users WHERE id=?", s.user_id);
    if (!u || !u.active) return null;
    if (s.expires_at - Date.now() < 13 * 864e5) this.sql.exec("UPDATE sessions SET expires_at=? WHERE token_hash=?", Date.now() + 14 * 864e5, h);
    u.sessionHash = h;
    return u;
  }
  async newSession(user, req) {
    const token = rid(32);
    this.sql.exec("INSERT INTO sessions (token_hash,user_id,expires_at,created_at,ip,ua) VALUES (?,?,?,?,?,?)", await sha256(token), user.id, Date.now() + 14 * 864e5, nowIso(), req.headers.get("cf-connecting-ip"), (req.headers.get("user-agent") || "").slice(0, 200));
    this.sql.exec("UPDATE users SET last_login=? WHERE id=?", nowIso(), user.id);
    return `crm_sid=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${14 * 86400}`;
  }

  validatePassword(pw) { if (typeof pw !== "string" || pw.length < 10) fail(400, "Password must be at least 10 characters"); }

  // ---------------------------------------------------------- API router
  async api(req, url) {
    const M = req.method, P = url.pathname.replace(/\/+$/, ""), Q = Object.fromEntries(url.searchParams);
    // ---- public auth endpoints
    if (P === "/api/auth/state" && M === "GET") {
      const users = this.one("SELECT COUNT(*) AS n FROM users").n;
      const user = await this.currentUser(req);
      return json({ needsSetup: users === 0, setupCodeRequired: !!this.env.SETUP_CODE, user: user && this.publicUser(user), company: this.setting("company_name") });
    }
    if (P === "/api/auth/setup" && M === "POST") {
      const b = await this.body(req);
      if (this.one("SELECT COUNT(*) AS n FROM users").n > 0) fail(400, "Setup already completed");
      if (this.env.SETUP_CODE && !safeEq(String(b.setup_code || ""), String(this.env.SETUP_CODE))) fail(403, "Setup code is incorrect");
      if (!b.name || !validEmail(b.email)) fail(400, "Name and a valid email are required");
      this.validatePassword(b.password);
      const salt = rid(16);
      const u = this.one("INSERT INTO users (email,name,role,password_hash,salt,created_at) VALUES (?,?,?,?,?,?) RETURNING *", b.email.toLowerCase().trim(), b.name.trim(), "admin", await hashPassword(b.password, salt), salt, nowIso());
      if (b.company_name) this.sql.exec("INSERT OR REPLACE INTO settings (key,value) VALUES ('company_name',?)", b.company_name);
      this.audit(u, "setup", "users", u.id, "Initial admin created");
      return json({ user: this.publicUser(u) }, 200, { "set-cookie": await this.newSession(u, req) });
    }
    if (P === "/api/auth/login" && M === "POST") {
      const b = await this.body(req);
      const email = String(b.email || "").toLowerCase().trim(), ip = req.headers.get("cf-connecting-ip") || "";
      const since = Date.now() - 15 * 60e3;
      const fails = this.one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok=0 AND at>? AND (email=? OR ip=?)", since, email, ip).n;
      if (fails >= 8) fail(429, "Too many failed attempts. Try again in 15 minutes.");
      const u = this.one("SELECT * FROM users WHERE email=?", email);
      const ok = u && u.active && safeEq(await hashPassword(String(b.password || ""), u.salt), u.password_hash);
      this.sql.exec("INSERT INTO login_attempts (email,ip,ok,at) VALUES (?,?,?,?)", email, ip, ok ? 1 : 0, Date.now());
      this.sql.exec("DELETE FROM login_attempts WHERE at<?", Date.now() - 864e5);
      if (!ok) fail(401, u && !u.active ? "This account has been deactivated" : "Incorrect email or password");
      this.audit(u, "login", "users", u.id);
      return json({ user: this.publicUser(u) }, 200, { "set-cookie": await this.newSession(u, req) });
    }
    if (P === "/api/auth/logout" && M === "POST") {
      const u = await this.currentUser(req);
      if (u) this.sql.exec("DELETE FROM sessions WHERE token_hash=?", u.sessionHash);
      return json({ ok: true }, 200, { "set-cookie": "crm_sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    }

    // ---- everything below requires login
    const me = await this.currentUser(req);
    if (!me) fail(401, "Please sign in");
    const need = (rank) => { if (RANK[me.role] < rank) fail(403, "You don't have permission for this"); };

    if (P === "/api/me" && M === "GET") return json(this.publicUser(me));
    if (P === "/api/me" && M === "PATCH") {
      const b = await this.body(req);
      this.sql.exec("UPDATE users SET name=COALESCE(?,name), title=?, phone=? WHERE id=?", b.name || null, b.title ?? me.title, b.phone ?? me.phone, me.id);
      return json(this.publicUser(this.one("SELECT * FROM users WHERE id=?", me.id)));
    }
    if (P === "/api/me/password" && M === "POST") {
      const b = await this.body(req);
      const u = this.one("SELECT * FROM users WHERE id=?", me.id);
      if (!safeEq(await hashPassword(String(b.current || ""), u.salt), u.password_hash)) fail(400, "Current password is incorrect");
      this.validatePassword(b.password);
      const salt = rid(16);
      this.sql.exec("UPDATE users SET password_hash=?, salt=?, must_change_password=0 WHERE id=?", await hashPassword(b.password, salt), salt, me.id);
      this.sql.exec("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", me.id, me.sessionHash);
      this.audit(me, "password_change", "users", me.id);
      return json({ ok: true });
    }

    // ---- users (team)
    if (P === "/api/users" && M === "GET") {
      const cols = RANK[me.role] >= 3 ? "id,email,name,role,title,phone,active,last_login,created_at,must_change_password" : "id,name,email,role,title,active";
      return json({ rows: this.all(`SELECT ${cols} FROM users ORDER BY active DESC, name`) });
    }
    if (P === "/api/users" && M === "POST") {
      need(3);
      const b = await this.body(req);
      if (!b.name || !validEmail(b.email)) fail(400, "Name and a valid email are required");
      if (!ROLES.includes(b.role)) fail(400, "Invalid role");
      this.validatePassword(b.password);
      if (this.one("SELECT id FROM users WHERE email=?", b.email.toLowerCase().trim())) fail(400, "A user with that email already exists");
      const salt = rid(16);
      const u = this.one("INSERT INTO users (email,name,role,title,phone,password_hash,salt,must_change_password,created_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id,email,name,role,title,phone,active,created_at",
        b.email.toLowerCase().trim(), b.name.trim(), b.role, b.title || null, b.phone || null, await hashPassword(b.password, salt), salt, b.must_change_password === false ? 0 : 1, nowIso());
      this.audit(me, "create", "users", u.id, `${u.name} (${u.role})`);
      return json(u);
    }
    let m;
    if ((m = P.match(/^\/api\/users\/(\d+)$/)) && M === "PATCH") {
      need(3);
      const id = +m[1], b = await this.body(req);
      const u = this.one("SELECT * FROM users WHERE id=?", id) || fail(404, "User not found");
      if (b.role && !ROLES.includes(b.role)) fail(400, "Invalid role");
      if (id === me.id && ((b.role && b.role !== "admin") || b.active === false || b.active === 0)) fail(400, "You can't remove your own admin access");
      if (b.email && !validEmail(b.email)) fail(400, "Invalid email");
      this.sql.exec("UPDATE users SET name=?, email=?, role=?, title=?, phone=?, active=? WHERE id=?", b.name ?? u.name, (b.email ?? u.email).toLowerCase(), b.role ?? u.role, b.title ?? u.title, b.phone ?? u.phone, b.active === undefined ? u.active : b.active ? 1 : 0, id);
      if (b.active === false || b.active === 0) this.sql.exec("DELETE FROM sessions WHERE user_id=?", id);
      this.audit(me, "update", "users", id, JSON.stringify({ ...b, password: undefined }));
      return json(this.one("SELECT id,email,name,role,title,phone,active,last_login,created_at FROM users WHERE id=?", id));
    }
    if ((m = P.match(/^\/api\/users\/(\d+)\/password$/)) && M === "POST") {
      need(3);
      const id = +m[1], b = await this.body(req);
      this.one("SELECT id FROM users WHERE id=?", id) || fail(404, "User not found");
      this.validatePassword(b.password);
      const salt = rid(16);
      this.sql.exec("UPDATE users SET password_hash=?, salt=?, must_change_password=1 WHERE id=?", await hashPassword(b.password, salt), salt, id);
      this.sql.exec("DELETE FROM sessions WHERE user_id=?", id);
      this.audit(me, "password_reset", "users", id);
      return json({ ok: true });
    }
    if (P === "/api/audit" && M === "GET") {
      need(3);
      return json({ rows: this.all("SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT ?", Math.min(+Q.limit || 200, 1000)) });
    }

    // ---- settings
    if (P === "/api/settings" && M === "GET") {
      const out = { ...DEFAULT_SETTINGS };
      for (const r of this.all("SELECT key,value FROM settings")) if (!r.key.startsWith("_") && !SECRET_SETTINGS.includes(r.key)) out[r.key] = r.value;
      out.email_ready = !!this.resendKey() && validEmail(out.email_from_address);
      out.resend_key_source = this.env.RESEND_API_KEY ? "worker secret" : this.one("SELECT value FROM settings WHERE key='resend_api_key'")?.value ? "saved in settings" : "";
      out.stages = STAGES; out.stage_probability = STAGE_PROB;
      return json(out);
    }
    if (P === "/api/settings" && M === "PUT") {
      need(3);
      const b = await this.body(req);
      for (const [k, v] of Object.entries(b)) {
        if (!(k in DEFAULT_SETTINGS) && !SECRET_SETTINGS.includes(k)) continue;
        if (SECRET_SETTINGS.includes(k) && !v) continue;
        this.sql.exec("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", k, String(v ?? ""));
      }
      if (b.clear_resend_key) this.sql.exec("DELETE FROM settings WHERE key='resend_api_key'");
      this.audit(me, "update", "settings", null, Object.keys(b).join(", "));
      return json({ ok: true });
    }

    // ---- custom endpoints
    if (P === "/api/dashboard" && M === "GET") return json(this.dashboard(me));
    if (P === "/api/forecast" && M === "GET") return json(this.forecast(Q));
    if (P === "/api/analytics" && M === "GET") return json(this.analytics(Q));
    if (P === "/api/search" && M === "GET") return json(this.search(Q.q || ""));
    if (P === "/api/graph" && M === "GET") return json(this.graph(Q));
    if (P === "/api/timeline" && M === "GET") return json(this.timeline(Q));
    if (P === "/api/lookups" && M === "GET") return json(this.lookups());
    if (P === "/api/contacts/import" && M === "POST") { need(1); return json(this.importContacts(await this.body(req), me)); }
    if (P === "/api/contacts/bulk" && M === "POST") { need(1); return json(this.bulkContacts(await this.body(req), me)); }
    if (P === "/api/emails/send" && M === "POST") { need(1); return json(await this.sendOne(await this.body(req), me, url.origin)); }
    if ((m = P.match(/^\/api\/emails\/(\d+)$/)) && M === "GET") {
      const e = this.one("SELECT e.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name FROM emails e LEFT JOIN contacts c ON c.id=e.contact_id WHERE e.id=?", +m[1]) || fail(404, "Not found");
      return json(e);
    }
    if (P === "/api/campaigns/segment-preview" && M === "POST") { const b = await this.body(req); const rows = this.segmentContacts(b.segment || {}); return json({ count: rows.length, sample: rows.slice(0, 25) }); }
    if ((m = P.match(/^\/api\/campaigns\/(\d+)\/test$/)) && M === "POST") { need(1); return json(await this.campaignTest(+m[1], await this.body(req), me, url.origin)); }
    if ((m = P.match(/^\/api\/campaigns\/(\d+)\/send$/)) && M === "POST") { need(2); return json(await this.campaignSend(+m[1], me, url.origin)); }
    if ((m = P.match(/^\/api\/campaigns\/(\d+)\/recipients$/)) && M === "GET") {
      return json({ rows: this.all(`SELECT r.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, co.name AS company_name FROM campaign_recipients r LEFT JOIN contacts c ON c.id=r.contact_id LEFT JOIN companies co ON co.id=c.company_id WHERE r.campaign_id=? ORDER BY r.id`, +m[1]) });
    }
    if ((m = P.match(/^\/api\/campaigns\/(\d+)\/duplicate$/)) && M === "POST") {
      need(1);
      const c = this.one("SELECT * FROM campaigns WHERE id=?", +m[1]) || fail(404, "Not found");
      const t = nowIso();
      return json(this.one("INSERT INTO campaigns (name,subject,preheader,body_html,segment,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'Draft',?,?,?) RETURNING *", c.name + " (copy)", c.subject, c.preheader, c.body_html, c.segment, me.id, t, t));
    }
    if ((m = P.match(/^\/api\/tickets\/(\d+)\/comments$/))) {
      const tid = +m[1];
      if (M === "GET") return json({ rows: this.all("SELECT tc.*, u.name AS user_name FROM ticket_comments tc LEFT JOIN users u ON u.id=tc.user_id WHERE ticket_id=? ORDER BY id", tid) });
      if (M === "POST") { need(1); return json(await this.addTicketComment(tid, await this.body(req), me, url.origin)); }
    }

    // ---- generic CRUD
    if ((m = P.match(/^\/api\/([a-z_]+)(?:\/(\d+))?$/)) && ENT[m[1]]) {
      const name = m[1], e = ENT[name], id = m[2] ? +m[2] : null;
      if (M === "GET" && !id) return json(this.list(name, Q, me));
      if (M === "GET" && id) return json(this.get(name, id) || fail(404, "Not found"));
      if (e.readOnly) fail(405, "Read only");
      if (M === "POST" && !id) { need(e.writeRank ?? 1); return json(this.save(name, null, await this.body(req), me)); }
      if ((M === "PATCH" || M === "PUT") && id) { need(e.writeRank ?? 1); return json(this.save(name, id, await this.body(req), me)); }
      if (M === "DELETE" && id) {
        const row = this.one(`SELECT * FROM ${e.table} WHERE id=?`, id) || fail(404, "Not found");
        const own = ["tasks", "interactions", "relationships", "templates"].includes(name) && (row.created_by === me.id || row.user_id === me.id);
        if (!own) need(2);
        this.remove(name, id);
        this.audit(me, "delete", name, id, e.label(row));
        return json({ ok: true });
      }
    }
    fail(404, "Unknown endpoint");
  }

  publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, title: u.title, phone: u.phone, must_change_password: !!u.must_change_password }; }

  // ---------------------------------------------------------- generic CRUD
  list(name, Q, me) {
    const e = ENT[name], a = e.a, where = [], b = [];
    for (const [k, v] of Object.entries(Q)) {
      if (v === "" || v == null) continue;
      if (e.fields.includes(k) || k === "id") {
        if (String(v).includes("|")) { const vs = String(v).split("|"); where.push(`${a}.${k} IN (${vs.map(() => "?").join(",")})`); b.push(...vs); }
        else if (v === "null") where.push(`${a}.${k} IS NULL`);
        else { where.push(`${a}.${k} = ?`); b.push(v); }
      }
    }
    if (Q.q) { const like = `%${Q.q.trim()}%`; where.push("(" + e.search.map((s) => `${s} LIKE ?`).join(" OR ") + ")"); e.search.forEach(() => b.push(like)); }
    if (Q.tag) { where.push(`(',' || COALESCE(${a}.tags,'') || ',') LIKE ?`); b.push(`%,${Q.tag},%`); }
    if (Q.product && name === "contacts") { where.push(`(',' || COALESCE(c.products_interest,'') || ',') LIKE ?`); b.push(`%,${Q.product},%`); }
    if (Q.mine === "1") { const f = name === "tasks" || name === "tickets" ? "assigned_to" : name === "interactions" ? "user_id" : "owner_id"; where.push(`${a}.${f} = ?`); b.push(me.id); }
    if (name === "tasks") {
      const today = new Date().toISOString().slice(0, 10);
      if (Q.view === "overdue") { where.push("t.status <> 'Done' AND t.due_at IS NOT NULL AND substr(t.due_at,1,10) < ?"); b.push(today); }
      if (Q.view === "today") { where.push("t.status <> 'Done' AND substr(t.due_at,1,10) = ?"); b.push(today); }
      if (Q.view === "upcoming") { where.push("t.status <> 'Done' AND substr(t.due_at,1,10) > ?"); b.push(today); }
      if (Q.view === "open") where.push("t.status <> 'Done'");
    }
    if (name === "deals" && Q.open === "1") where.push("d.stage NOT IN ('Won','Lost')");
    if (name === "tickets" && Q.open === "1") where.push("tk.status NOT IN ('Resolved','Closed')");
    if (name === "contacts" && Q.stale) { where.push("(c.last_contacted IS NULL OR c.last_contacted < ?)"); b.push(new Date(Date.now() - +Q.stale * 864e5).toISOString()); }
    if (Q.from) { where.push(`${a}.${e.defaultSort === "occurred_at" ? "occurred_at" : "created_at"} >= ?`); b.push(Q.from); }
    if (Q.to) { where.push(`${a}.${e.defaultSort === "occurred_at" ? "occurred_at" : "created_at"} <= ?`); b.push(Q.to + "T23:59:59"); }
    if (name === "relationships" && Q.entity_type && Q.entity_id) { where.push("((r.from_type=? AND r.from_id=?) OR (r.to_type=? AND r.to_id=?))"); b.push(Q.entity_type, +Q.entity_id, Q.entity_type, +Q.entity_id); }
    const W = where.length ? " WHERE " + where.join(" AND ") : "";
    let sort = Q.sort && /^[a-z_]+$/.test(Q.sort) && (e.fields.includes(Q.sort) || (e.sortExtra || []).includes(Q.sort) || ["id", "created_at", "updated_at", "last_contacted", "closed_at"].includes(Q.sort)) ? Q.sort : e.defaultSort || "id";
    const dir = (Q.dir || e.defaultDir || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    const sortCol = (e.sortExtra || []).includes(sort) ? sort : `${a}.${sort}`;
    const nulls = dir === "ASC" ? `${sortCol} IS NULL, ` : "";
    const limit = Math.min(Math.max(+Q.limit || 50, 1), 5000), offset = Math.max(+Q.offset || 0, 0);
    const total = this.one(`SELECT COUNT(*) AS n FROM (${e.select}${W})`, ...b).n;
    const rows = this.all(`${e.select}${W} ORDER BY ${nulls}${sortCol} ${dir}, ${a}.id DESC LIMIT ? OFFSET ?`, ...b, limit, offset);
    return { rows: name === "relationships" ? this.decorateRels(rows) : rows, total, limit, offset };
  }
  get(name, id) {
    const e = ENT[name];
    const row = this.one(`${e.select} WHERE ${e.a}.id = ?`, id);
    if (row && name === "relationships") return this.decorateRels([row])[0];
    return row;
  }
  decorateRels(rows) {
    const nm = (t, id) => t === "company" ? this.one("SELECT name FROM companies WHERE id=?", id)?.name : this.one("SELECT first_name || ' ' || COALESCE(last_name,'') AS n FROM contacts WHERE id=?", id)?.n;
    return rows.map((r) => ({ ...r, from_name: nm(r.from_type, r.from_id), to_name: nm(r.to_type, r.to_id) }));
  }

  clean(name, data, isNew) {
    const e = ENT[name], out = {};
    for (const f of e.fields) {
      if (!(f in data)) continue;
      let v = data[f];
      if (v === "" || v === undefined) v = null;
      if (typeof v === "object" && v !== null) v = JSON.stringify(v);
      if (typeof v === "boolean") v = v ? 1 : 0;
      if (f === "tags" || f === "products_interest") v = normTags(v);
      if (f === "email" && v) { v = String(v).trim().toLowerCase(); if (!validEmail(v)) fail(400, `Invalid email: ${v}`); }
      if (typeof v === "string") v = v.slice(0, f.includes("body") || f === "notes" || f === "description" ? 200000 : 2000);
      out[f] = v;
    }
    for (const r of e.required || []) {
      if ((isNew && out[r] == null) || (!isNew && r in out && out[r] == null)) fail(400, `${r.replace(/_/g, " ")} is required`);
    }
    return out;
  }

  save(name, id, data, me) {
    const e = ENT[name], t = nowIso();
    const before = id ? this.one(`SELECT * FROM ${e.table} WHERE id=?`, id) || fail(404, "Not found") : null;
    const v = this.clean(name, data, !id);
    const cols = new Set(this.all(`PRAGMA table_info(${e.table})`).map((c) => c.name));
    // --- entity rules
    if (name === "contacts" && !id) { v.unsub_token = rid(16); v.owner_id ??= me.id; v.type ??= "Lead"; }
    if (name === "contacts" && v.email && this.one("SELECT id FROM contacts WHERE email=? AND id<>?", v.email, id || 0) && !data.allow_duplicate) fail(409, `Another contact already uses ${v.email}`);
    if (name === "companies" && !id) v.owner_id ??= me.id;
    if (name === "deals") {
      const stage = v.stage ?? before?.stage ?? "Lead";
      if (!STAGES.includes(stage)) fail(400, "Invalid stage");
      if (!id) { v.owner_id ??= me.id; v.stage = stage; }
      if (!id && v.probability == null) v.probability = STAGE_PROB[stage];
      if (id && v.stage && v.stage !== before.stage && !("probability" in data)) v.probability = STAGE_PROB[v.stage];
      if (stage === "Won") { v.probability = 100; if (!before?.closed_at || before.stage !== "Won") v.closed_at = t; }
      else if (stage === "Lost") { v.probability = 0; if (!before?.closed_at || before.stage !== "Lost") v.closed_at = t; }
      else if (before && ["Won", "Lost"].includes(before.stage) && v.stage) v.closed_at = null;
      if (v.product_lines) {
        let lines; try { lines = JSON.parse(v.product_lines); } catch { fail(400, "Bad product lines"); }
        if (Array.isArray(lines) && lines.length && (data.value === "" || data.value == null || data.auto_value)) v.value = Math.round(lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0) * 100) / 100;
      }
      if (!v.company_id && !before?.company_id && v.contact_id) v.company_id = this.one("SELECT company_id FROM contacts WHERE id=?", v.contact_id)?.company_id ?? null;
    }
    if (name === "interactions") {
      if (!id) { v.user_id ??= me.id; v.occurred_at ??= t; }
      if (!v.company_id && v.contact_id && !id) v.company_id = this.one("SELECT company_id FROM contacts WHERE id=?", v.contact_id)?.company_id ?? null;
    }
    if (name === "tasks") {
      if (!id) { v.assigned_to ??= me.id; v.status ??= "Open"; }
      if (v.status === "Done" && before?.status !== "Done") v.completed_at = t;
      if (v.status && v.status !== "Done") v.completed_at = null;
    }
    if (name === "tickets") {
      if (!id) { v.status ??= "Open"; v.priority ??= "Normal"; v.due_at ??= new Date(Date.now() + (SLA_HOURS[v.priority] || 48) * 3600e3).toISOString(); v.assigned_to ??= me.id; }
      if (!v.company_id && v.contact_id && !id) v.company_id = this.one("SELECT company_id FROM contacts WHERE id=?", v.contact_id)?.company_id ?? null;
      if (v.status && ["Resolved", "Closed"].includes(v.status) && !before?.resolved_at) v.resolved_at = t;
      if (v.status && !["Resolved", "Closed"].includes(v.status)) v.resolved_at = null;
    }
    if (name === "relationships") {
      if (!["contact", "company"].includes(v.from_type ?? before?.from_type) || !["contact", "company"].includes(v.to_type ?? before?.to_type)) fail(400, "Invalid relationship type");
    }
    if (cols.has("updated_at")) v.updated_at = t;
    if (!id) { if (cols.has("created_at")) v.created_at = t; if (cols.has("created_by")) v.created_by = me.id; }
    const keys = Object.keys(v);
    let row;
    if (!id) row = this.one(`INSERT INTO ${e.table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) RETURNING id`, ...keys.map((k) => v[k]));
    else if (keys.length) this.sql.exec(`UPDATE ${e.table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`, ...keys.map((k) => v[k]), id);
    const newId = id || row.id;
    // --- after-save effects
    if (name === "interactions" && v.contact_id) this.sql.exec("UPDATE contacts SET last_contacted=MAX(COALESCE(last_contacted,''), ?) WHERE id=?", v.occurred_at || t, v.contact_id);
    if (name === "deals" && (!id || (v.stage && v.stage !== before.stage))) {
      this.sql.exec("INSERT INTO deal_stage_history (deal_id,from_stage,to_stage,user_id,at) VALUES (?,?,?,?,?)", newId, before?.stage ?? null, v.stage, me.id, t);
      if (id) {
        const d = this.one("SELECT * FROM deals WHERE id=?", newId);
        this.sql.exec("INSERT INTO interactions (contact_id,company_id,deal_id,type,subject,body,occurred_at,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)", d.contact_id, d.company_id, newId, "Stage change", `${d.title}: ${before.stage} → ${v.stage}`, v.stage === "Lost" && d.lost_reason ? `Reason: ${d.lost_reason}` : null, t, me.id, t);
        if (v.stage === "Won" && d.contact_id) this.sql.exec("UPDATE contacts SET type='Customer' WHERE id=? AND type IN ('Lead','Prospect')", d.contact_id);
        if (v.stage === "Won" && d.company_id) this.sql.exec("UPDATE companies SET type='Customer' WHERE id=? AND type IN ('Prospect','Lead')", d.company_id);
      }
      if (!id && v.contact_id) this.sql.exec("UPDATE contacts SET type='Prospect' WHERE id=? AND type='Lead'", v.contact_id);
    }
    if (name === "tickets" && !id && v.description) this.sql.exec("INSERT INTO ticket_comments (ticket_id,user_id,author,body,internal,created_at) VALUES (?,?,?,?,0,?)", newId, me.id, me.name, v.description, t);
    this.audit(me, id ? "update" : "create", name, newId, id ? Object.keys(this.clean(name, data, false)).join(", ") : e.label({ ...v, id: newId }));
    return this.get(name, newId);
  }

  remove(name, id) {
    const e = ENT[name];
    this.ctx.storage.transactionSync(() => {
      if (name === "contacts") {
        for (const t of ["interactions", "tasks", "deals", "tickets", "emails"]) this.sql.exec(`UPDATE ${t} SET contact_id=NULL WHERE contact_id=?`, id);
        this.sql.exec("DELETE FROM relationships WHERE (from_type='contact' AND from_id=?) OR (to_type='contact' AND to_id=?)", id, id);
        this.sql.exec("UPDATE campaign_recipients SET contact_id=NULL WHERE contact_id=?", id);
      }
      if (name === "companies") {
        for (const t of ["contacts", "interactions", "tasks", "deals", "tickets"]) this.sql.exec(`UPDATE ${t} SET company_id=NULL WHERE company_id=?`, id);
        this.sql.exec("UPDATE companies SET parent_id=NULL WHERE parent_id=?", id);
        this.sql.exec("DELETE FROM relationships WHERE (from_type='company' AND from_id=?) OR (to_type='company' AND to_id=?)", id, id);
      }
      if (name === "deals") { this.sql.exec("UPDATE interactions SET deal_id=NULL WHERE deal_id=?", id); this.sql.exec("UPDATE tasks SET deal_id=NULL WHERE deal_id=?", id); this.sql.exec("DELETE FROM deal_stage_history WHERE deal_id=?", id); }
      if (name === "tickets") { this.sql.exec("DELETE FROM ticket_comments WHERE ticket_id=?", id); this.sql.exec("UPDATE tasks SET ticket_id=NULL WHERE ticket_id=?", id); }
      if (name === "campaigns") this.sql.exec("DELETE FROM campaign_recipients WHERE campaign_id=?", id);
      this.sql.exec(`DELETE FROM ${e.table} WHERE id=?`, id);
    });
  }

  lookups() {
    return {
      users: this.all("SELECT id,name,role FROM users WHERE active=1 ORDER BY name"),
      companies: this.all("SELECT id,name FROM companies ORDER BY name LIMIT 5000"),
      contacts: this.all("SELECT c.id, c.first_name || ' ' || COALESCE(c.last_name,'') AS name, c.email, c.company_id, co.name AS company_name FROM contacts c LEFT JOIN companies co ON co.id=c.company_id ORDER BY c.first_name LIMIT 10000"),
      deals: this.all("SELECT id,title AS name,contact_id,company_id,stage FROM deals ORDER BY id DESC LIMIT 2000"),
      products: this.all("SELECT id,name,sku,unit,price,category FROM products WHERE active=1 ORDER BY category,name"),
      templates: this.all("SELECT id,name,subject,body_html,category FROM templates ORDER BY name"),
      tags: [...new Set(this.all("SELECT tags FROM contacts WHERE tags IS NOT NULL UNION ALL SELECT tags FROM companies WHERE tags IS NOT NULL").flatMap((r) => r.tags.split(",")))].sort(),
      sources: this.all("SELECT DISTINCT lead_source AS v FROM contacts WHERE lead_source IS NOT NULL ORDER BY 1").map((r) => r.v),
      countries: this.all("SELECT DISTINCT country AS v FROM contacts WHERE country IS NOT NULL ORDER BY 1").map((r) => r.v),
    };
  }

  // ---------------------------------------------------------- dashboard / analytics
  dashboard(me) {
    const now = new Date(), som = new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), solm = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const today = now.toISOString().slice(0, 10), d30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const n = (q, ...p) => this.one(q, ...p)?.n ?? 0;
    const kpis = {
      open_pipeline: n("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage NOT IN ('Won','Lost')"),
      weighted_pipeline: n("SELECT COALESCE(SUM(value*COALESCE(probability,0)/100.0),0) AS n FROM deals WHERE stage NOT IN ('Won','Lost')"),
      open_deals: n("SELECT COUNT(*) AS n FROM deals WHERE stage NOT IN ('Won','Lost')"),
      won_this_month: n("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage='Won' AND closed_at>=?", som),
      won_last_month: n("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage='Won' AND closed_at>=? AND closed_at<?", solm, som),
      new_leads_30d: n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=?", d30),
      contacts: n("SELECT COUNT(*) AS n FROM contacts"), customers: n("SELECT COUNT(*) AS n FROM contacts WHERE type='Customer'"),
      companies: n("SELECT COUNT(*) AS n FROM companies"),
      open_tickets: n("SELECT COUNT(*) AS n FROM tickets WHERE status NOT IN ('Resolved','Closed')"),
      overdue_tickets: n("SELECT COUNT(*) AS n FROM tickets WHERE status NOT IN ('Resolved','Closed') AND due_at<?", now.toISOString()),
      my_overdue_tasks: n("SELECT COUNT(*) AS n FROM tasks WHERE status<>'Done' AND assigned_to=? AND substr(due_at,1,10)<?", me.id, today),
      my_tasks_today: n("SELECT COUNT(*) AS n FROM tasks WHERE status<>'Done' AND assigned_to=? AND substr(due_at,1,10)=?", me.id, today),
      interactions_30d: n("SELECT COUNT(*) AS n FROM interactions WHERE occurred_at>=? AND type<>'Stage change'", d30),
      monthly_target: +this.setting("monthly_target") || 0,
    };
    const byStage = this.all("SELECT stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM deals WHERE stage NOT IN ('Won','Lost') GROUP BY stage");
    const pipeline = STAGES.slice(0, 5).map((s) => byStage.find((r) => r.stage === s) || { stage: s, count: 0, value: 0 });
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e2 = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({ month: s.toISOString().slice(0, 7), won: n("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage='Won' AND closed_at>=? AND closed_at<?", s.toISOString(), e2.toISOString()), leads: n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=? AND created_at<?", s.toISOString(), e2.toISOString()) });
    }
    return {
      kpis, pipeline, months,
      my_tasks: this.all(`${ENT.tasks.select} WHERE t.status<>'Done' AND t.assigned_to=? ORDER BY t.due_at IS NULL, t.due_at ASC LIMIT 10`, me.id),
      recent: this.all(`${ENT.interactions.select} ORDER BY i.occurred_at DESC LIMIT 12`),
      follow_up: this.all(`SELECT c.id, c.first_name || ' ' || COALESCE(c.last_name,'') AS name, co.name AS company_name, c.rating, c.type, c.last_contacted FROM contacts c LEFT JOIN companies co ON co.id=c.company_id
        WHERE c.type IN ('Lead','Prospect') AND c.status='Active' AND (c.last_contacted IS NULL OR c.last_contacted < ?) ORDER BY CASE c.rating WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 ELSE 2 END, c.last_contacted LIMIT 8`, new Date(Date.now() - 14 * 864e5).toISOString()),
      closing_soon: this.all(`${ENT.deals.select} WHERE d.stage NOT IN ('Won','Lost') AND d.expected_close IS NOT NULL ORDER BY d.expected_close ASC LIMIT 6`),
      sources: this.all("SELECT COALESCE(lead_source,'Unknown') AS label, COUNT(*) AS value FROM contacts GROUP BY 1 ORDER BY 2 DESC LIMIT 8"),
    };
  }

  forecast(Q) {
    const now = new Date(), N = Math.min(Math.max(+Q.months || 6, 1), 24), owner = Q.owner_id ? +Q.owner_id : null;
    const ow = owner ? " AND owner_id=" + owner : "";
    const open = this.all(`SELECT * FROM deals WHERE stage NOT IN ('Won','Lost')${ow}`);
    const won = this.all(`SELECT * FROM deals WHERE stage='Won' AND closed_at IS NOT NULL${ow}`);
    const target = +this.setting("monthly_target") || 0;
    const ym = (d) => String(d).slice(0, 7), thisYm = now.toISOString().slice(0, 7);
    const months = [];
    for (let i = 0; i < N; i++) months.push(new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1)).toISOString().slice(0, 7));
    const rows = months.map((m) => {
      const ds = open.filter((d) => (d.expected_close ? ym(d.expected_close) : thisYm) === m || (m === thisYm && d.expected_close && ym(d.expected_close) < thisYm));
      return {
        month: m, deals: ds.length,
        best_case: ds.reduce((s, d) => s + (+d.value || 0), 0),
        weighted: ds.reduce((s, d) => s + (+d.value || 0) * (d.probability || 0) / 100, 0),
        commit: ds.filter((d) => (d.probability || 0) >= 75).reduce((s, d) => s + (+d.value || 0), 0),
        closed_won: won.filter((d) => ym(d.closed_at) === m).reduce((s, d) => s + (+d.value || 0), 0),
        target,
      };
    });
    const history = [];
    for (let i = 11; i >= 0; i--) { const m = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1)).toISOString().slice(0, 7); history.push({ month: m, won: won.filter((d) => ym(d.closed_at) === m).reduce((s, d) => s + (+d.value || 0), 0) }); }
    const last3 = history.slice(-4, -1).reduce((s, h) => s + h.won, 0) / 3;
    const byStage = STAGES.slice(0, 5).map((s) => { const ds = open.filter((d) => d.stage === s); return { stage: s, count: ds.length, value: ds.reduce((a, d) => a + (+d.value || 0), 0), weighted: ds.reduce((a, d) => a + (+d.value || 0) * (d.probability || 0) / 100, 0) }; });
    const users = this.all("SELECT id,name FROM users");
    const qStart = new Date(Date.UTC(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)).toISOString();
    const byOwner = users.map((u) => {
      const ds = open.filter((d) => d.owner_id === u.id);
      return { owner: u.name, open: ds.reduce((a, d) => a + (+d.value || 0), 0), weighted: ds.reduce((a, d) => a + (+d.value || 0) * (d.probability || 0) / 100, 0), deals: ds.length, won_qtd: won.filter((d) => d.owner_id === u.id && d.closed_at >= qStart).reduce((a, d) => a + (+d.value || 0), 0) };
    }).filter((r) => r.deals || r.won_qtd);
    const cat = {}, prodCat = Object.fromEntries(this.all("SELECT id,category FROM products").map((p) => [p.id, p.category]));
    for (const d of open) {
      let lines = []; try { lines = JSON.parse(d.product_lines || "[]"); } catch {}
      const p = (d.probability || 0) / 100;
      if (!lines.length) { cat.Unspecified = (cat.Unspecified || 0) + (+d.value || 0) * p; continue; }
      for (const l of lines) { const c = prodCat[l.product_id] || l.category || "Other"; cat[c] = (cat[c] || 0) + (+l.qty || 0) * (+l.price || 0) * p; }
    }
    const today = now.toISOString().slice(0, 10);
    return {
      months: rows, history, run_rate: last3, by_stage: byStage, by_owner: byOwner,
      by_category: Object.entries(cat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      overdue: this.all(`${ENT.deals.select} WHERE d.stage NOT IN ('Won','Lost') AND d.expected_close < ?${owner ? " AND d.owner_id=" + owner : ""} ORDER BY d.expected_close`, today),
      totals: { open: open.reduce((a, d) => a + (+d.value || 0), 0), weighted: open.reduce((a, d) => a + (+d.value || 0) * (d.probability || 0) / 100, 0), target },
    };
  }

  analytics(Q) {
    const days = Math.min(Math.max(+Q.days || 90, 7), 3650), since = new Date(Date.now() - days * 864e5).toISOString();
    const n = (q, ...p) => this.one(q, ...p)?.n ?? 0;
    const deals = this.all("SELECT id, stage, value, created_at, closed_at, lost_reason, source FROM deals WHERE created_at>=?", since);
    const hist = this.all("SELECT deal_id, to_stage FROM deal_stage_history WHERE deal_id IN (SELECT id FROM deals WHERE created_at>=?)", since);
    const order = STAGES.slice(0, 6), maxStage = {};
    for (const d of deals) maxStage[d.id] = Math.max(order.indexOf(d.stage), 0);
    for (const h of hist) { const i = order.indexOf(h.to_stage); if (i > (maxStage[h.deal_id] ?? -1)) maxStage[h.deal_id] = i; }
    const funnel = order.map((s, i) => ({ stage: s, count: Object.values(maxStage).filter((x) => x >= i).length }));
    const closed = this.all("SELECT stage, value, created_at, closed_at, lost_reason FROM deals WHERE closed_at>=? AND stage IN ('Won','Lost')", since);
    const wonD = closed.filter((d) => d.stage === "Won"), lostD = closed.filter((d) => d.stage === "Lost");
    const cycle = wonD.length ? wonD.reduce((s, d) => s + (new Date(d.closed_at) - new Date(d.created_at)) / 864e5, 0) / wonD.length : 0;
    const lostReasons = {}; for (const d of lostD) { const r = d.lost_reason || "Not specified"; lostReasons[r] = (lostReasons[r] || 0) + 1; }
    const trend = [];
    const step = days > 120 ? 30 : 7;
    for (let s = Date.now() - days * 864e5; s < Date.now(); s += step * 864e5) {
      const a = new Date(s).toISOString(), b = new Date(Math.min(s + step * 864e5, Date.now() + 1)).toISOString();
      trend.push({ label: a.slice(5, 10), interactions: n("SELECT COUNT(*) AS n FROM interactions WHERE occurred_at>=? AND occurred_at<? AND type<>'Stage change'", a, b), leads: n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=? AND created_at<?", a, b), won: n("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage='Won' AND closed_at>=? AND closed_at<?", a, b) });
    }
    const tk = this.all("SELECT * FROM tickets WHERE created_at>=?", since);
    const resolved = tk.filter((t) => t.resolved_at);
    return {
      days,
      summary: {
        win_rate: wonD.length + lostD.length ? wonD.length / (wonD.length + lostD.length) : 0,
        won_value: wonD.reduce((s, d) => s + (+d.value || 0), 0), won_count: wonD.length, lost_count: lostD.length,
        avg_deal: wonD.length ? wonD.reduce((s, d) => s + (+d.value || 0), 0) / wonD.length : 0, avg_cycle_days: cycle,
        new_contacts: n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=?", since), new_deals: deals.length,
        interactions: n("SELECT COUNT(*) AS n FROM interactions WHERE occurred_at>=? AND type<>'Stage change'", since),
        emails_sent: n("SELECT COUNT(*) AS n FROM emails WHERE direction='out' AND status='Sent' AND created_at>=?", since),
        emails_received: n("SELECT COUNT(*) AS n FROM emails WHERE direction='in' AND created_at>=?", since),
        lead_conversion: (() => { const t = n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=?", since); return t ? n("SELECT COUNT(*) AS n FROM contacts WHERE created_at>=? AND type='Customer'", since) / t : 0; })(),
      },
      funnel, trend,
      lost_reasons: Object.entries(lostReasons).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      sources: this.all("SELECT COALESCE(lead_source,'Unknown') AS label, COUNT(*) AS value, SUM(CASE WHEN type='Customer' THEN 1 ELSE 0 END) AS customers FROM contacts WHERE created_at>=? GROUP BY 1 ORDER BY 2 DESC", since),
      contact_types: this.all("SELECT COALESCE(type,'Unknown') AS label, COUNT(*) AS value FROM contacts GROUP BY 1 ORDER BY 2 DESC"),
      industries: this.all("SELECT COALESCE(industry,'Unspecified') AS label, COUNT(*) AS value FROM companies GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
      interaction_types: this.all("SELECT type AS label, COUNT(*) AS value FROM interactions WHERE occurred_at>=? AND type<>'Stage change' GROUP BY 1 ORDER BY 2 DESC", since),
      leaderboard: this.all(`SELECT u.name,
          (SELECT COUNT(*) FROM interactions i WHERE i.user_id=u.id AND i.occurred_at>=? AND i.type<>'Stage change') AS interactions,
          (SELECT COUNT(*) FROM deals d WHERE d.owner_id=u.id AND d.stage='Won' AND d.closed_at>=?) AS won,
          (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.owner_id=u.id AND d.stage='Won' AND d.closed_at>=?) AS won_value,
          (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to=u.id AND t.completed_at>=?) AS tasks_done,
          (SELECT COUNT(*) FROM contacts c WHERE c.created_by=u.id AND c.created_at>=?) AS contacts_added
        FROM users u WHERE u.active=1 ORDER BY won_value DESC, interactions DESC`, since, since, since, since, since),
      top_customers: this.all(`SELECT co.id, co.name, COUNT(d.id) AS deals, COALESCE(SUM(d.value),0) AS value FROM deals d JOIN companies co ON co.id=d.company_id WHERE d.stage='Won' GROUP BY co.id ORDER BY value DESC LIMIT 10`),
      products: (() => {
        const agg = {};
        for (const d of this.all("SELECT product_lines FROM deals WHERE stage='Won' AND closed_at>=? AND product_lines IS NOT NULL", since)) {
          let lines = []; try { lines = JSON.parse(d.product_lines); } catch {}
          for (const l of lines) { const k = l.name || "Item"; agg[k] = agg[k] || { label: k, qty: 0, value: 0 }; agg[k].qty += +l.qty || 0; agg[k].value += (+l.qty || 0) * (+l.price || 0); }
        }
        return Object.values(agg).sort((a, b) => b.value - a.value).slice(0, 10);
      })(),
      tickets: {
        total: tk.length, open: tk.filter((t) => !["Resolved", "Closed"].includes(t.status)).length,
        avg_resolution_hours: resolved.length ? resolved.reduce((s, t) => s + (new Date(t.resolved_at) - new Date(t.created_at)) / 3600e3, 0) / resolved.length : 0,
        sla_met: resolved.length ? resolved.filter((t) => !t.due_at || t.resolved_at <= t.due_at).length / resolved.length : 0,
        csat: (() => { const r = tk.filter((t) => t.satisfaction); return r.length ? r.reduce((s, t) => s + t.satisfaction, 0) / r.length : 0; })(),
        by_category: Object.entries(tk.reduce((a, t) => ((a[t.category || "General"] = (a[t.category || "General"] || 0) + 1), a), {})).map(([label, value]) => ({ label, value })),
        by_status: Object.entries(tk.reduce((a, t) => ((a[t.status] = (a[t.status] || 0) + 1), a), {})).map(([label, value]) => ({ label, value })),
      },
      campaigns: this.all(`${ENT.campaigns.select} WHERE cm.status<>'Draft' ORDER BY cm.sent_at DESC LIMIT 10`),
    };
  }

  search(q) {
    q = q.trim(); if (q.length < 2) return { results: [] };
    const like = `%${q}%`, out = [];
    for (const r of this.all("SELECT c.id, c.first_name || ' ' || COALESCE(c.last_name,'') AS label, COALESCE(co.name, c.email) AS sub FROM contacts c LEFT JOIN companies co ON co.id=c.company_id WHERE c.first_name || ' ' || COALESCE(c.last_name,'') LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.mobile LIKE ? LIMIT 8", like, like, like, like)) out.push({ ...r, kind: "contact" });
    for (const r of this.all("SELECT id, name AS label, COALESCE(city,industry) AS sub FROM companies WHERE name LIKE ? OR email LIKE ? OR website LIKE ? LIMIT 6", like, like, like)) out.push({ ...r, kind: "company" });
    for (const r of this.all("SELECT id, title AS label, stage AS sub FROM deals WHERE title LIKE ? LIMIT 5", like)) out.push({ ...r, kind: "deal" });
    for (const r of this.all("SELECT id, '#' || id || ' ' || subject AS label, status AS sub FROM tickets WHERE subject LIKE ? OR CAST(id AS TEXT)=? LIMIT 5", like, q.replace("#", ""))) out.push({ ...r, kind: "ticket" });
    for (const r of this.all("SELECT id, name AS label, category AS sub FROM products WHERE name LIKE ? OR sku LIKE ? LIMIT 4", like, like)) out.push({ ...r, kind: "product" });
    return { results: out };
  }

  graph(Q) {
    const rels = this.all("SELECT * FROM relationships LIMIT 2000");
    let contacts = this.all("SELECT id, first_name || ' ' || COALESCE(last_name,'') AS name, company_id, type, title FROM contacts LIMIT 1500");
    let companies = this.all("SELECT id, name, type, industry FROM companies LIMIT 800");
    const nodes = new Map(), edges = [];
    const add = (t, r) => nodes.set(`${t}:${r.id}`, { id: `${t}:${r.id}`, kind: t, ref: r.id, label: r.name, type: r.type, sub: r.title || r.industry || "" });
    companies.forEach((c) => add("company", c)); contacts.forEach((c) => add("contact", c));
    contacts.forEach((c) => c.company_id && edges.push({ from: `contact:${c.id}`, to: `company:${c.company_id}`, kind: "Works at", implicit: true }));
    rels.forEach((r) => edges.push({ id: r.id, from: `${r.from_type}:${r.from_id}`, to: `${r.to_type}:${r.to_id}`, kind: r.kind, strength: r.strength, notes: r.notes }));
    let keep = null;
    if (Q.focus) {
      keep = new Set([Q.focus]);
      for (let d = 0; d < (+Q.depth || 2); d++) for (const e of edges) { if (keep.has(e.from)) keep.add(e.to); else if (keep.has(e.to)) keep.add(e.from); }
    } else if (Q.connected_only !== "0") {
      keep = new Set(); for (const e of edges) { keep.add(e.from); keep.add(e.to); }
    }
    const ns = [...nodes.values()].filter((nd) => !keep || keep.has(nd.id));
    const ids = new Set(ns.map((x) => x.id));
    return { nodes: ns, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  }

  timeline(Q) {
    const field = Q.contact_id ? "contact_id" : Q.company_id ? "company_id" : Q.deal_id ? "deal_id" : null;
    if (!field) fail(400, "Specify contact_id, company_id or deal_id");
    const id = +(Q.contact_id || Q.company_id || Q.deal_id), items = [];
    for (const r of this.all(`${ENT.interactions.select} WHERE i.${field}=? ORDER BY i.occurred_at DESC LIMIT 500`, id)) items.push({ kind: "interaction", at: r.occurred_at, ...r });
    for (const r of this.all(`${ENT.tasks.select} WHERE t.${field}=? ORDER BY t.created_at DESC LIMIT 200`, id)) items.push({ kind: "task", at: r.completed_at || r.created_at, ...r });
    if (field !== "deal_id") {
      for (const r of this.all(`${ENT.tickets.select} WHERE tk.${field}=? ORDER BY tk.created_at DESC LIMIT 200`, id)) items.push({ kind: "ticket", at: r.created_at, ...r });
      for (const r of this.all(`${ENT.deals.select} WHERE d.${field}=? ORDER BY d.created_at DESC LIMIT 200`, id)) items.push({ kind: "deal", at: r.created_at, ...r });
    }
    if (field === "contact_id") for (const r of this.all("SELECT r.*, cm.name AS campaign_name, cm.subject FROM campaign_recipients r JOIN campaigns cm ON cm.id=r.campaign_id WHERE r.contact_id=? AND r.sent_at IS NOT NULL", id)) items.push({ kind: "campaign", at: r.sent_at, ...r });
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { items };
  }

  importContacts(b, me) {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : fail(400, "rows required");
    let created = 0, updated = 0, skipped = 0, companiesCreated = 0; const errors = [], t = nowIso();
    const coCache = new Map(this.all("SELECT id, lower(name) AS n FROM companies").map((r) => [r.n, r.id]));
    this.ctx.storage.transactionSync(() => {
      rows.forEach((r, idx) => {
        try {
          const d = { ...r };
          if (!d.first_name && d.name) { const [f, ...l] = String(d.name).trim().split(/\s+/); d.first_name = f; d.last_name = l.join(" "); }
          if (!d.first_name && d.email) d.first_name = String(d.email).split("@")[0];
          if (!d.first_name) { skipped++; return; }
          if (d.company && !d.company_id) {
            const key = String(d.company).trim().toLowerCase();
            if (!coCache.has(key)) { const co = this.one("INSERT INTO companies (name,type,city,state,country,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id", String(d.company).trim(), d.type === "Customer" ? "Customer" : "Prospect", d.city || null, d.state || null, d.country || null, me.id, me.id, t, t); coCache.set(key, co.id); companiesCreated++; }
            d.company_id = coCache.get(key);
          }
          const v = this.clean("contacts", d, true);
          if (b.default_tags) v.tags = normTags([v.tags, b.default_tags].filter(Boolean).join(","));
          v.lead_source ??= b.default_source || "Import"; v.type ??= b.default_type || "Lead"; v.owner_id ??= me.id;
          const existing = v.email && this.one("SELECT id FROM contacts WHERE email=?", v.email);
          if (existing) {
            if (b.on_duplicate !== "update") { skipped++; return; }
            const ks = Object.keys(v).filter((k) => v[k] != null);
            this.sql.exec(`UPDATE contacts SET ${ks.map((k) => k + "=?").join(",")}, updated_at=? WHERE id=?`, ...ks.map((k) => v[k]), t, existing.id); updated++; return;
          }
          Object.assign(v, { unsub_token: rid(16), created_by: me.id, created_at: t, updated_at: t });
          const ks = Object.keys(v);
          this.sql.exec(`INSERT INTO contacts (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`, ...ks.map((k) => v[k])); created++;
        } catch (e) { errors.push(`Row ${idx + 2}: ${e.message}`); }
      });
    });
    this.audit(me, "import", "contacts", null, `created ${created}, updated ${updated}, skipped ${skipped}`);
    return { created, updated, skipped, companiesCreated, errors: errors.slice(0, 50) };
  }

  bulkContacts(b, me) {
    const ids = (b.ids || []).map(Number).filter(Boolean); if (!ids.length) fail(400, "No contacts selected");
    const ph = ids.map(() => "?").join(",");
    if (b.action === "delete") { if (RANK[me.role] < 2) fail(403, "Managers only"); ids.forEach((id) => this.remove("contacts", id)); }
    else if (b.action === "add_tag" && b.value) for (const r of this.all(`SELECT id,tags FROM contacts WHERE id IN (${ph})`, ...ids)) this.sql.exec("UPDATE contacts SET tags=? WHERE id=?", normTags([r.tags, b.value].filter(Boolean).join(",")), r.id);
    else if (["type", "owner_id", "rating", "status"].includes(b.action)) this.sql.exec(`UPDATE contacts SET ${b.action}=?, updated_at=? WHERE id IN (${ph})`, b.value, nowIso(), ...ids);
    else fail(400, "Unknown bulk action");
    this.audit(me, "bulk_" + b.action, "contacts", null, `${ids.length} contacts → ${b.value ?? ""}`);
    return { ok: true, count: ids.length };
  }

  // ---------------------------------------------------------- email
  resendKey() { return this.env.RESEND_API_KEY || this.one("SELECT value FROM settings WHERE key='resend_api_key'")?.value || ""; }
  fromHeader() {
    const addr = this.setting("email_from_address");
    if (!validEmail(addr)) fail(400, "Set a 'From' email address in Settings → Email first");
    if (!this.resendKey()) fail(400, "Email sending is not configured yet. Add your Resend API key in Settings → Email.");
    const name = (this.setting("email_from_name") || this.setting("company_name") || "").replace(/["<>]/g, "");
    return name ? `${name} <${addr}>` : addr;
  }
  merge(text, contact, me, extra = {}) {
    const co = contact?.company_id ? this.one("SELECT name FROM companies WHERE id=?", contact.company_id)?.name : contact?.company_name;
    const sig = this.setting("email_signature") || `${me?.name || ""}<br>${this.setting("company_name")}`;
    const vars = {
      first_name: contact?.first_name || "there", last_name: contact?.last_name || "", full_name: contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : "",
      company: co || "your company", email: contact?.email || "", city: contact?.city || "", title: contact?.title || "",
      my_name: me?.name || "", my_email: me?.email || "", my_phone: me?.phone || "", my_title: me?.title || "",
      my_company: this.setting("company_name"), signature: sig.replace(/\{\{my_name\}\}/g, me?.name || "").replace(/\{\{my_title\}\}/g, me?.title || "").replace(/\{\{my_phone\}\}/g, me?.phone || ""), ...extra,
    };
    return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m0, k) => (k in vars ? (k === "signature" ? vars[k] : escHtml(vars[k])) : m0));
  }
  wrap(inner, { preheader = "", footer = "", pixel = "" } = {}) {
    const company = escHtml(this.setting("company_name")), addr = escHtml(this.setting("company_address") || "");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f6f3ee;font-family:Helvetica,Arial,sans-serif;color:#2b2620">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee;padding:24px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e8e1d6">
<tr><td style="background:#7a5a2f;padding:18px 28px;color:#fff;font-size:18px;font-weight:bold;letter-spacing:.3px">${company}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding:16px 28px;background:#faf7f2;color:#8a8073;font-size:12px;line-height:1.5">${company}${addr ? " · " + addr : ""}${footer}</td></tr>
</table></td></tr></table>${pixel}</body></html>`;
  }
  async resend(payload, batch = false) {
    const r = await fetch(batch ? "https://api.resend.com/emails/batch" : "https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${this.resendKey()}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || data.error || `Email provider error ${r.status}`);
    return data;
  }
  async sendOne(b, me, origin) {
    const from = this.fromHeader();
    let contact = b.contact_id ? this.one("SELECT * FROM contacts WHERE id=?", +b.contact_id) : null;
    const to = String(b.to || contact?.email || "").trim().toLowerCase();
    if (!validEmail(to)) fail(400, "A valid recipient email is required");
    if (!contact) contact = this.one("SELECT * FROM contacts WHERE email=?", to);
    if (!b.subject) fail(400, "Subject is required");
    const token = rid(16), t = nowIso();
    const subject = this.merge(b.subject, contact, me).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const inner = this.merge(b.body_html || "", contact, me);
    const html = this.wrap(inner, { pixel: `<img src="${origin}/t/e/${token}.gif" width="1" height="1" alt="" style="display:none">` });
    const cc = String(b.cc || "").split(",").map((s) => s.trim()).filter(validEmail);
    let status = "Sent", error = null, pid = null;
    try {
      const res = await this.resend({ from, to: [to], cc: cc.length ? cc : undefined, subject, html, text: stripHtml(inner), reply_to: this.setting("email_reply_to") || me.email });
      pid = res.id || null;
    } catch (e) { status = "Failed"; error = e.message; }
    const em = this.one("INSERT INTO emails (contact_id,deal_id,ticket_id,direction,from_addr,to_addr,subject,body_html,body_text,status,error,provider_id,token,user_id,created_at) VALUES (?,?,?,'out',?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
      contact?.id ?? null, b.deal_id || null, b.ticket_id || null, from, to, subject, inner, stripHtml(inner), status, error, pid, token, me.id, t);
    if (status === "Sent") {
      this.sql.exec("INSERT INTO interactions (contact_id,company_id,deal_id,ticket_id,email_id,type,direction,subject,body,occurred_at,user_id,created_at) VALUES (?,?,?,?,?,'Email','Outbound',?,?,?,?,?)",
        contact?.id ?? null, contact?.company_id ?? null, b.deal_id || null, b.ticket_id || null, em.id, subject, stripHtml(inner).slice(0, 5000), t, me.id, t);
      if (contact) this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, contact.id);
    }
    this.audit(me, "email", "emails", em.id, `${to}: ${subject} (${status})`);
    if (status === "Failed") fail(502, "Email was not sent: " + error);
    return { ok: true, id: em.id };
  }

  segmentContacts(seg) {
    const where = ["c.email IS NOT NULL", "c.email <> ''", "COALESCE(c.unsubscribed,0)=0", "COALESCE(c.status,'Active') <> 'Do not contact'"], b = [];
    const inList = (col, arr) => { if (Array.isArray(arr) && arr.length) { where.push(`${col} IN (${arr.map(() => "?").join(",")})`); b.push(...arr); } };
    const anyLike = (col, arr) => { if (Array.isArray(arr) && arr.length) { where.push("(" + arr.map(() => `(',' || COALESCE(${col},'') || ',') LIKE ?`).join(" OR ") + ")"); arr.forEach((x) => b.push(`%,${x},%`)); } };
    inList("c.type", seg.types); inList("c.rating", seg.ratings); inList("c.lead_source", seg.sources); inList("c.country", seg.countries); inList("c.owner_id", seg.owners);
    inList("co.industry", seg.industries);
    anyLike("c.tags", seg.tags); anyLike("c.products_interest", seg.products);
    if (seg.not_contacted_days) { where.push("(c.last_contacted IS NULL OR c.last_contacted < ?)"); b.push(new Date(Date.now() - seg.not_contacted_days * 864e5).toISOString()); }
    if (Array.isArray(seg.contact_ids) && seg.contact_ids.length) inList("c.id", seg.contact_ids.map(Number));
    return this.all(`SELECT c.id, c.first_name, c.last_name, c.email, c.company_id, c.city, c.title, c.unsub_token, co.name AS company_name, c.type FROM contacts c LEFT JOIN companies co ON co.id=c.company_id WHERE ${where.join(" AND ")} GROUP BY c.email ORDER BY c.id`, ...b);
  }
  campaignHtml(cm, contact, me, origin, token, unsubToken) {
    let inner = this.merge(cm.body_html || "", contact, me);
    if (token) inner = inner.replace(/href="(https?:\/\/[^"]+)"/gi, (m0, u) => `href="${origin}/t/c/${token}?u=${encodeURIComponent(u.replace(/&amp;/g, "&"))}"`);
    const unsub = unsubToken ? `${origin}/u/${unsubToken}` : "#";
    return {
      html: this.wrap(inner, { preheader: cm.preheader, footer: `<br>You're receiving this because you're a contact of ${escHtml(this.setting("company_name"))}. <a href="${unsub}" style="color:#8a8073">Unsubscribe</a>`, pixel: token ? `<img src="${origin}/t/o/${token}.gif" width="1" height="1" alt="" style="display:none">` : "" }),
      text: stripHtml(inner) + `\n\nUnsubscribe: ${unsub}`, unsub,
    };
  }
  async campaignTest(id, b, me, origin) {
    const cm = this.one("SELECT * FROM campaigns WHERE id=?", id) || fail(404, "Not found");
    const to = String(b.to || me.email).trim();
    if (!validEmail(to)) fail(400, "Invalid test address");
    const from = this.fromHeader();
    const sample = this.segmentContacts(JSON.parse(cm.segment || "{}"))[0] || { first_name: me.name.split(" ")[0], company_name: "Sample Company" };
    const { html, text } = this.campaignHtml(cm, sample, me, origin, null, null);
    await this.resend({ from, to: [to], subject: "[TEST] " + this.merge(cm.subject, sample, me).replace(/&amp;/g, "&").replace(/&#39;/g, "'"), html, text, reply_to: this.setting("email_reply_to") || me.email });
    return { ok: true };
  }
  async campaignSend(id, me, origin) {
    const cm = this.one("SELECT * FROM campaigns WHERE id=?", id) || fail(404, "Not found");
    const from = this.fromHeader();
    if (!cm.subject || !cm.body_html) fail(400, "Campaign needs a subject and content");
    if (cm.status === "Draft") {
      const list = this.segmentContacts(JSON.parse(cm.segment || "{}"));
      if (!list.length) fail(400, "No contacts match this campaign's audience");
      this.ctx.storage.transactionSync(() => {
        for (const c of list) this.sql.exec("INSERT INTO campaign_recipients (campaign_id,contact_id,email,token,status) VALUES (?,?,?,?,'Queued')", id, c.id, c.email, rid(16));
        this.sql.exec("UPDATE campaigns SET status='Sending', sent_at=?, updated_at=? WHERE id=?", nowIso(), nowIso(), id);
      });
      this.audit(me, "campaign_send", "campaigns", id, `${list.length} recipients`);
    } else if (cm.status !== "Sending") fail(400, "This campaign was already sent");
    const queue = this.all("SELECT r.*, c.first_name, c.last_name, c.company_id, c.city, c.title, c.unsub_token, c.unsubscribed FROM campaign_recipients r LEFT JOIN contacts c ON c.id=r.contact_id WHERE r.campaign_id=? AND r.status='Queued' ORDER BY r.id LIMIT 200", id);
    let sent = 0, failed = 0;
    for (let i = 0; i < queue.length; i += 100) {
      const chunk = queue.slice(i, i + 100).filter((r) => { if (r.unsubscribed) { this.sql.exec("UPDATE campaign_recipients SET status='Skipped', error='Unsubscribed' WHERE id=?", r.id); return false; } return true; });
      if (!chunk.length) continue;
      const payload = chunk.map((r) => {
        const { html, text, unsub } = this.campaignHtml(cm, r, me, origin, r.token, r.unsub_token);
        return { from, to: [r.email], subject: this.merge(cm.subject, r, me).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'), html, text, reply_to: this.setting("email_reply_to") || undefined, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
      });
      const t = nowIso();
      try {
        const res = await this.resend(payload, true);
        const ids = res.data || [];
        chunk.forEach((r, k) => {
          this.sql.exec("UPDATE campaign_recipients SET status='Sent', sent_at=?, provider_id=? WHERE id=?", t, ids[k]?.id ?? null, r.id);
          if (r.contact_id) {
            this.sql.exec("INSERT INTO interactions (contact_id,company_id,type,direction,subject,body,occurred_at,user_id,created_at) VALUES (?,?,'Campaign','Outbound',?,?,?,?,?)", r.contact_id, r.company_id, `Campaign: ${cm.name}`, cm.subject, t, me.id, t);
            this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, r.contact_id);
          }
        });
        sent += chunk.length;
      } catch (e) {
        chunk.forEach((r) => this.sql.exec("UPDATE campaign_recipients SET status='Failed', error=? WHERE id=?", e.message.slice(0, 500), r.id));
        failed += chunk.length;
      }
    }
    const remaining = this.one("SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id=? AND status='Queued'", id).n;
    if (!remaining) this.sql.exec("UPDATE campaigns SET status='Sent', updated_at=? WHERE id=?", nowIso(), id);
    return { sent, failed, remaining };
  }

  async addTicketComment(tid, b, me, origin) {
    const tk = this.one(`${ENT.tickets.select} WHERE tk.id=?`, tid) || fail(404, "Ticket not found");
    if (!b.body) fail(400, "Comment is empty");
    let emailed = 0;
    if (b.email_customer && !b.internal) {
      if (!tk.contact_email) fail(400, "This ticket's contact has no email address");
      await this.sendOne({ contact_id: tk.contact_id, to: tk.contact_email, subject: `Re: [Ticket #${tid}] ${tk.subject}`, body_html: `<p>${escHtml(b.body).replace(/\n/g, "<br>")}</p><p>{{signature}}</p><p style="color:#8a8073;font-size:12px">Reply to this email to respond — please keep [Ticket #${tid}] in the subject.</p>`, ticket_id: tid }, me, origin);
      emailed = 1;
    }
    const c = this.one("INSERT INTO ticket_comments (ticket_id,user_id,author,body,internal,emailed,created_at) VALUES (?,?,?,?,?,?,?) RETURNING *", tid, me.id, me.name, b.body, b.internal ? 1 : 0, emailed, nowIso());
    if (b.status) this.save("tickets", tid, { status: b.status }, me);
    else if (emailed && tk.status === "Open") this.sql.exec("UPDATE tickets SET status='Waiting on customer', updated_at=? WHERE id=?", nowIso(), tid);
    return c;
  }

  // RPC from the Worker's email() handler
  async inboundEmail(m) {
    const addr = String(m.fromAddress || m.envelopeFrom).toLowerCase().trim(), t = nowIso();
    let contact = this.one("SELECT * FROM contacts WHERE email=?", addr);
    if (!contact) {
      const [first, ...rest] = (m.fromName || addr.split("@")[0]).trim().split(/\s+/);
      contact = this.one("INSERT INTO contacts (first_name,last_name,email,type,lead_source,rating,unsub_token,created_at,updated_at) VALUES (?,?,?,'Lead','Inbound email','Warm',?,?,?) RETURNING *", first || addr, rest.join(" ") || null, addr, rid(16), t, t);
    }
    const body = m.text || stripHtml(m.html);
    const em = this.one("INSERT INTO emails (contact_id,direction,from_addr,to_addr,subject,body_html,body_text,status,created_at) VALUES (?,'in',?,?,?,?,?,'Received',?) RETURNING id", contact.id, addr, m.to, m.subject, m.html || null, body.slice(0, 100000), t);
    let ticketId = null;
    const tm = String(m.subject).match(/\[Ticket #(\d+)\]/i);
    if (tm && this.one("SELECT id FROM tickets WHERE id=?", +tm[1])) {
      ticketId = +tm[1];
      this.sql.exec("INSERT INTO ticket_comments (ticket_id,author,body,internal,created_at) VALUES (?,?,?,0,?)", ticketId, `${contact.first_name} ${contact.last_name || ""} (customer)`.trim(), body.split(/\n>|\nOn .+wrote:/)[0].trim().slice(0, 20000), t);
      this.sql.exec("UPDATE tickets SET status='Open', updated_at=? WHERE id=? AND status IN ('Waiting on customer','Resolved')", t, ticketId);
    } else {
      const support = (this.setting("support_address") || "").toLowerCase();
      if (support && String(m.to).toLowerCase() === support) {
        const tk = this.one("INSERT INTO tickets (subject,description,contact_id,company_id,category,priority,status,channel,due_at,created_at,updated_at) VALUES (?,?,?,?,'General','Normal','Open','Email',?,?,?) RETURNING id", m.subject, body.slice(0, 20000), contact.id, contact.company_id, new Date(Date.now() + 48 * 3600e3).toISOString(), t, t);
        ticketId = tk.id;
        this.sql.exec("INSERT INTO ticket_comments (ticket_id,author,body,internal,created_at) VALUES (?,?,?,0,?)", ticketId, `${contact.first_name} (customer)`, body.slice(0, 20000), t);
      }
    }
    this.sql.exec("UPDATE emails SET ticket_id=? WHERE id=?", ticketId, em.id);
    this.sql.exec("INSERT INTO interactions (contact_id,company_id,ticket_id,email_id,type,direction,subject,body,occurred_at,created_at) VALUES (?,?,?,?,'Email','Inbound',?,?,?,?)", contact.id, contact.company_id, ticketId, em.id, m.subject, body.slice(0, 5000), t, t);
    this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, contact.id);
    return { ok: true };
  }

  // ---------------------------------------------------------- public tracking routes
  async publicRoutes(req, url) {
    const gif = () => new Response(Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
    let m;
    if ((m = url.pathname.match(/^\/t\/o\/([a-f0-9]+)\.gif$/))) {
      this.sql.exec("UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,?), open_count=open_count+1, status=CASE WHEN status='Sent' THEN 'Opened' ELSE status END WHERE token=?", nowIso(), m[1]);
      return gif();
    }
    if ((m = url.pathname.match(/^\/t\/e\/([a-f0-9]+)\.gif$/))) {
      this.sql.exec("UPDATE emails SET opened_at=COALESCE(opened_at,?), open_count=open_count+1 WHERE token=?", nowIso(), m[1]);
      return gif();
    }
    if ((m = url.pathname.match(/^\/t\/c\/([a-f0-9]+)$/))) {
      const target = url.searchParams.get("u") || "";
      const r = this.one("SELECT r.id, cm.body_html FROM campaign_recipients r JOIN campaigns cm ON cm.id=r.campaign_id WHERE r.token=?", m[1]);
      if (r && /^https?:\/\//i.test(target) && (r.body_html || "").replace(/&amp;/g, "&").includes(target)) {
        this.sql.exec("UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,?), click_count=click_count+1, opened_at=COALESCE(opened_at,?), status='Clicked' WHERE id=?", nowIso(), nowIso(), r.id);
        return Response.redirect(target, 302);
      }
      return new Response("Link not found", { status: 404 });
    }
    if ((m = url.pathname.match(/^\/u\/([a-f0-9]+)$/))) {
      const c = this.one("SELECT id, email FROM contacts WHERE unsub_token=?", m[1]);
      const company = escHtml(this.setting("company_name"));
      const page = (msg) => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${company}</title><body style="font-family:system-ui;background:#f6f3ee;display:grid;place-items:center;min-height:90vh;margin:0"><div style="background:#fff;padding:32px 40px;border-radius:12px;border:1px solid #e8e1d6;max-width:420px;text-align:center"><h2 style="margin-top:0">${company}</h2><p>${msg}</p></div>`, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (!c) return page("This link is no longer valid.");
      if (req.method === "POST" || url.searchParams.get("confirm") === "1") {
        this.sql.exec("UPDATE contacts SET unsubscribed=1, updated_at=? WHERE id=?", nowIso(), c.id);
        this.sql.exec("INSERT INTO interactions (contact_id,type,direction,subject,occurred_at,created_at) VALUES (?,'Note','Inbound','Unsubscribed from marketing emails',?,?)", c.id, nowIso(), nowIso());
        return page(`<strong>${escHtml(c.email)}</strong> has been unsubscribed from marketing emails.`);
      }
      return page(`Unsubscribe <strong>${escHtml(c.email)}</strong> from marketing emails?<br><br><a href="?confirm=1" style="display:inline-block;background:#7a5a2f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Yes, unsubscribe me</a>`);
    }
    return new Response("Not found", { status: 404 });
  }
}
