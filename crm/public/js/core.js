/* Indian Craft Supply CRM — core: utilities, API, forms, tables, charts, shell, auth */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const S = { me: null, settings: {}, lk: { users: [], companies: [], contacts: [], deals: [], products: [], templates: [], tags: [], sources: [], countries: [] } };
const RANK = { viewer: 0, support: 1, sales: 1, manager: 2, admin: 3 };
const can = (r) => S.me && RANK[S.me.role] >= r;

// ---------------------------------------------------------------- icons
const ICONS = {
  dashboard: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  contacts: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  company: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01",
  network: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  pipeline: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z",
  tasks: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  forecast: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  box: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12",
  megaphone: "M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
  template: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  ticket: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3",
  chart: "M12 20V10M18 20V4M6 20v-4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  plus: "M12 5v14M5 12h14", x: "M18 6L6 18M6 6l12 12", check: "M20 6L9 17l-5-5",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  calendar: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  menu: "M3 12h18M3 6h18M3 18h18", logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z", upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  chat: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n] || ICONS.note}"/></svg>`;

// ---------------------------------------------------------------- formatting
const money = (v, compact) => {
  const cur = S.settings.currency || "USD";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: compact || Math.abs(v) >= 1000 ? 0 : 2, notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard" }).format(+v || 0); }
  catch { return "$" + (+v || 0).toFixed(0); }
};
const num = (v, d = 0) => (+v || 0).toLocaleString(undefined, { maximumFractionDigits: d });
const pct = (v) => `${Math.round((+v || 0) * 100)}%`;
const toDate = (s) => (s ? new Date(String(s).length === 10 ? s + "T00:00:00" : s) : null);
const fmtDate = (s) => { const d = toDate(s); return d && !isNaN(d) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""; };
const fmtDT = (s) => { const d = toDate(s); return d && !isNaN(d) ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; };
const ago = (s) => {
  const d = toDate(s); if (!d || isNaN(d)) return "";
  const x = (Date.now() - d) / 1000, f = x < 0, a = Math.abs(x);
  const out = a < 60 ? "just now" : a < 3600 ? `${Math.floor(a / 60)}m` : a < 86400 ? `${Math.floor(a / 3600)}h` : a < 86400 * 30 ? `${Math.floor(a / 86400)}d` : a < 86400 * 365 ? `${Math.floor(a / 86400 / 30)}mo` : `${Math.floor(a / 86400 / 365)}y`;
  return out === "just now" ? out : f ? `in ${out}` : `${out} ago`;
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const localDT = (iso) => { const d = toDate(iso); if (!d || isNaN(d)) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const AV_COLORS = ["#86602d", "#2f7a6f", "#4f79a8", "#a8574d", "#6e8f4b", "#86699f", "#b7791f", "#3f6f8f"];
const avatar = (n, cls = "") => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `<span class="avatar ${cls}" style="background:${AV_COLORS[h % AV_COLORS.length]}">${esc(initials(n))}</span>`; };
const tags = (s) => (s ? String(s).split(",").filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("") : "");
const BADGE = {
  Lead: "b-blue", Prospect: "b-purple", Customer: "b-green", Partner: "b-brown", Distributor: "b-brown", Supplier: "b-amber", Inactive: "", Competitor: "b-red",
  Hot: "b-red", Warm: "b-amber", Cold: "b-blue", Won: "b-green", Lost: "b-red", Negotiation: "b-amber", "Quote Sent": "b-purple", "Sample Sent": "b-brown", Qualified: "b-blue",
  Open: "b-blue", "In progress": "b-amber", "Waiting on customer": "b-purple", Resolved: "b-green", Closed: "", Done: "b-green",
  Urgent: "b-red", High: "b-amber", Normal: "", Low: "", Draft: "", Sending: "b-amber", Sent: "b-green", Failed: "b-red", Opened: "b-blue", Clicked: "b-purple", Queued: "", Skipped: "", Received: "b-blue",
  Active: "b-green", Nurturing: "b-amber", "Do not contact": "b-red", admin: "b-red", manager: "b-purple", sales: "b-blue", support: "b-amber", viewer: "",
};
const badge = (v) => (v ? `<span class="badge ${BADGE[v] ?? ""}">${esc(v)}</span>` : "");
const userName = (id) => S.lk.users.find((u) => u.id === +id)?.name || "";

// ---------------------------------------------------------------- API
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && !path.startsWith("/api/auth")) { S.me = null; boot(); throw new Error("Session expired — please sign in again"); }
  if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
  return data;
}
const GET = (p) => api("GET", p), POST = (p, b = {}) => api("POST", p, b), PATCH = (p, b) => api("PATCH", p, b), PUT = (p, b) => api("PUT", p, b), DEL = (p) => api("DELETE", p);
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== "" && v != null) p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };
async function loadLookups() { S.lk = await GET("/api/lookups"); }
async function loadSettings() { S.settings = await GET("/api/settings"); }

function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 3200);
}
const safe = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

// ---------------------------------------------------------------- modal / menus
function modal({ title, body, size = "", submit = "Save", cancel = "Cancel", onSubmit, danger, extraFoot = "", onOpen }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div"); ov.className = "overlay";
    ov.innerHTML = `<form class="modal ${size}" novalidate><div class="modal-h"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-x>${icon("x")}</button></div>
      <div class="modal-b">${body}</div><div class="modal-f">${extraFoot}${cancel ? `<button type="button" class="btn" data-x>${esc(cancel)}</button>` : ""}${submit ? `<button class="btn ${danger ? "danger" : "primary"}" type="submit">${esc(submit)}</button>` : ""}</div></form>`;
    document.body.appendChild(ov);
    const form = $("form", ov);
    const close = (v) => { ov.remove(); document.removeEventListener("keydown", key); resolve(v); };
    const key = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", key);
    $$("[data-x]", ov).forEach((b) => (b.onclick = () => close(null)));
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(null); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("button[type=submit]", form); if (btn) btn.disabled = true;
      try { const r = onSubmit ? await onSubmit(form) : true; if (r !== false) close(r ?? true); }
      catch (err) { toast(err.message, true); }
      finally { if (btn) btn.disabled = false; }
    };
    setTimeout(() => { const f = $("input:not([type=hidden]):not([type=checkbox]),select,textarea,.editor", $(".modal-b", ov)); f && f.focus(); }, 30);
    onOpen && onOpen(form, close);
  });
}
const confirmBox = (msg, { title = "Are you sure?", ok = "Delete", danger = true } = {}) => modal({ title, body: `<p style="margin:0">${msg}</p>`, submit: ok, danger, size: "narrow" });

function popMenu(anchor, items) {
  $$(".menu.pop").forEach((m) => m.remove());
  const m = document.createElement("div"); m.className = "menu pop";
  m.innerHTML = items.map((it, i) => (it === "-" ? "<hr>" : `<button data-i="${i}">${it.icon ? icon(it.icon) : ""}${esc(it.label)}</button>`)).join("");
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = `${r.bottom + window.scrollY + 4}px`;
  m.style.left = `${Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + window.scrollX}px`;
  m.onclick = (e) => { const b = e.target.closest("button"); if (b) { m.remove(); items[+b.dataset.i].run(); } };
  setTimeout(() => document.addEventListener("click", function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("click", h); } }), 0);
}

// ---------------------------------------------------------------- options
const O = {
  contactType: ["Lead", "Prospect", "Customer", "Partner", "Supplier", "Inactive"],
  contactStatus: ["Active", "Nurturing", "Do not contact"],
  rating: ["Hot", "Warm", "Cold"],
  source: ["Website", "Referral", "Trade show", "Cold outreach", "Email campaign", "Inbound email", "Phone inquiry", "Social media", "Marketplace", "Business directory", "Existing customer", "Import", "Other"],
  products: ["Jute", "Burlap", "Hessian", "Cotton", "Canvas", "Muslin", "Twine", "Ribbon", "Bags", "Yarn", "Blends"],
  industry: ["Craft & hobby retail", "Event & wedding decor", "Packaging", "Agriculture & nursery", "Garment & textile manufacturing", "Furniture & upholstery", "Home decor", "Gift & promotional", "Coffee & food sacks", "Construction & erosion control", "Distributor / wholesaler", "E-commerce seller", "Florist", "Other"],
  companyType: ["Prospect", "Customer", "Partner", "Distributor", "Supplier", "Competitor", "Inactive"],
  terms: ["Prepaid", "COD", "Net 15", "Net 30", "Net 45", "Net 60", "50% advance"],
  channel: ["Email", "Phone", "WhatsApp", "SMS", "In person"],
  volume: ["Under $1k / mo", "$1k–5k / mo", "$5k–20k / mo", "$20k–50k / mo", "$50k+ / mo"],
  itype: ["Call", "Email", "Meeting", "WhatsApp", "Visit", "Sample sent", "Quote sent", "Order", "Note"],
  direction: ["Outbound", "Inbound"],
  outcome: ["Connected", "Left voicemail", "No answer", "Interested", "Not interested", "Follow-up needed", "Order placed", "Requested samples", "Requested quote"],
  ttype: ["To-do", "Call", "Email", "Follow-up", "Send sample", "Send quote", "Meeting", "Collect payment", "Ship order"],
  priority: ["Low", "Normal", "High", "Urgent"],
  tstatus: ["Open", "In progress", "Done"],
  stages: ["Lead", "Qualified", "Sample Sent", "Quote Sent", "Negotiation", "Won", "Lost"],
  lost: ["Price too high", "Quality", "Lead time", "Went with competitor", "Minimum order too high", "No budget", "No response", "Timing", "Other"],
  tkcat: ["Order issue", "Shipping / delivery", "Quality / defect", "Invoice / billing", "Returns", "Product question", "Sample request", "General"],
  tkstatus: ["Open", "In progress", "Waiting on customer", "Resolved", "Closed"],
  tkchannel: ["Email", "Phone", "WhatsApp", "Web", "In person"],
  relkind: ["Reports to", "Manager of", "Colleague", "Decision maker at", "Influencer at", "Buyer at", "Referred by", "Referred", "Partner", "Parent company of", "Subsidiary of", "Distributor for", "Supplies to", "Buys from", "Competitor of", "Family", "Friend", "Former employee of"],
  strength: ["Strong", "Medium", "Weak"],
  unit: ["Yard", "Meter", "Roll", "Bale", "Kg", "Lb", "Piece", "Spool", "Dozen", "Pack", "Ton"],
  pcat: ["Jute", "Burlap", "Cotton", "Blends", "Bags", "Twine & cord", "Ribbon & trim", "Other"],
  roles: { admin: "Full access, manages users & settings", manager: "All data, delete records, send campaigns, edit products", sales: "Add & edit contacts, companies, deals, tasks, emails", support: "Same as sales; focused on tickets", viewer: "Read-only access" },
};

// ---------------------------------------------------------------- form builder
const F = {
  contact: () => [
    { s: "Person" }, { k: "first_name", l: "First name", req: 1 }, { k: "last_name", l: "Last name" },
    { k: "company_id", l: "Company", t: "company" }, { k: "title", l: "Job title" },
    { k: "email", l: "Email", t: "email" }, { k: "phone", l: "Phone", t: "tel" }, { k: "mobile", l: "Mobile", t: "tel" }, { k: "whatsapp", l: "WhatsApp", t: "tel" },
    { s: "Lead & sales" }, { k: "type", l: "Type", t: "select", o: O.contactType, d: "Lead" }, { k: "rating", l: "Rating", t: "select", o: O.rating, d: "Warm" },
    { k: "lead_source", l: "Lead source", t: "select", o: O.source }, { k: "status", l: "Status", t: "select", o: O.contactStatus, d: "Active" },
    { k: "owner_id", l: "Owner", t: "user", d: S.me?.id }, { k: "lead_score", l: "Lead score (0–100)", t: "number" },
    { k: "products_interest", l: "Products of interest", t: "multi", o: O.products, full: 1 },
    { k: "monthly_volume", l: "Est. purchase volume", t: "select", o: O.volume }, { k: "preferred_channel", l: "Preferred channel", t: "select", o: O.channel },
    { k: "tags", l: "Tags", t: "tags", full: 1, ph: "e.g. wedding, trade-show-2026" },
    { s: "Address & more" }, { k: "address", l: "Street address", full: 1 }, { k: "city", l: "City" }, { k: "state", l: "State / region" }, { k: "zip", l: "Postal code" }, { k: "country", l: "Country" },
    { k: "department", l: "Department" }, { k: "linkedin", l: "LinkedIn / website", t: "url" }, { k: "birthday", l: "Birthday", t: "date" },
    { k: "unsubscribed", l: "Unsubscribed from marketing", t: "bool" },
    { k: "notes", l: "Notes", t: "textarea", full: 1 },
  ],
  company: () => [
    { s: "Company" }, { k: "name", l: "Company name", req: 1, full: 1 }, { k: "type", l: "Type", t: "select", o: O.companyType, d: "Prospect" }, { k: "industry", l: "Industry", t: "select", o: O.industry },
    { k: "website", l: "Website", t: "url" }, { k: "email", l: "General email", t: "email" }, { k: "phone", l: "Phone", t: "tel" }, { k: "rating", l: "Rating", t: "select", o: O.rating },
    { k: "owner_id", l: "Account owner", t: "user", d: S.me?.id }, { k: "parent_id", l: "Parent company", t: "company" },
    { s: "Commercial" }, { k: "payment_terms", l: "Payment terms", t: "select", o: O.terms }, { k: "credit_limit", l: "Credit limit", t: "number" },
    { k: "annual_volume", l: "Est. purchase volume", t: "select", o: O.volume }, { k: "employees", l: "Company size", t: "select", o: ["1–10", "11–50", "51–200", "201–1000", "1000+"] },
    { k: "tax_id", l: "Tax ID / resale #" }, { k: "tags", l: "Tags", t: "tags" },
    { s: "Address" }, { k: "address", l: "Street address", full: 1 }, { k: "city", l: "City" }, { k: "state", l: "State / region" }, { k: "zip", l: "Postal code" }, { k: "country", l: "Country" },
    { k: "notes", l: "Notes", t: "textarea", full: 1 },
  ],
  deal: () => [
    { k: "title", l: "Deal name", req: 1, full: 1, ph: "e.g. 500 yd burlap — Spring order" },
    { k: "contact_id", l: "Contact", t: "contact" }, { k: "company_id", l: "Company", t: "company" },
    { k: "stage", l: "Stage", t: "select", o: O.stages, d: "Lead" }, { k: "owner_id", l: "Owner", t: "user", d: S.me?.id },
    { k: "product_lines", l: "Products", t: "lines", full: 1 },
    { k: "value", l: "Deal value", t: "number", hint: "Filled automatically from product lines if left blank" }, { k: "probability", l: "Probability %", t: "number", hint: "Defaults from stage" },
    { k: "expected_close", l: "Expected close", t: "date", d: addDays(30) }, { k: "source", l: "Source", t: "select", o: O.source },
    { k: "next_step", l: "Next step", full: 1 }, { k: "lost_reason", l: "Lost reason", t: "select", o: O.lost },
    { k: "notes", l: "Notes", t: "textarea", full: 1 },
  ],
  task: () => [
    { k: "title", l: "Task", req: 1, full: 1 }, { k: "type", l: "Type", t: "select", o: O.ttype, d: "To-do" }, { k: "priority", l: "Priority", t: "select", o: O.priority, d: "Normal" },
    { k: "due_at", l: "Due date", t: "date", d: addDays(1) }, { k: "assigned_to", l: "Assigned to", t: "user", d: S.me?.id },
    { k: "contact_id", l: "Contact", t: "contact" }, { k: "company_id", l: "Company", t: "company" }, { k: "deal_id", l: "Deal", t: "deal" }, { k: "status", l: "Status", t: "select", o: O.tstatus, d: "Open" },
    { k: "description", l: "Details", t: "textarea", full: 1 },
  ],
  interaction: () => [
    { k: "type", l: "Activity type", t: "select", o: O.itype, d: "Call", req: 1 }, { k: "direction", l: "Direction", t: "select", o: O.direction, d: "Outbound" },
    { k: "subject", l: "Subject", full: 1 }, { k: "body", l: "Notes", t: "textarea", full: 1 },
    { k: "outcome", l: "Outcome", t: "select", o: O.outcome }, { k: "occurred_at", l: "When", t: "datetime", d: new Date().toISOString() },
    { k: "duration_min", l: "Duration (min)", t: "number" }, { k: "contact_id", l: "Contact", t: "contact" }, { k: "company_id", l: "Company", t: "company" }, { k: "deal_id", l: "Deal", t: "deal" },
  ],
  ticket: () => [
    { k: "subject", l: "Subject", req: 1, full: 1 }, { k: "contact_id", l: "Customer contact", t: "contact" }, { k: "company_id", l: "Company", t: "company" },
    { k: "category", l: "Category", t: "select", o: O.tkcat, d: "General" }, { k: "priority", l: "Priority", t: "select", o: O.priority, d: "Normal" },
    { k: "channel", l: "Channel", t: "select", o: O.tkchannel, d: "Email" }, { k: "assigned_to", l: "Assigned to", t: "user", d: S.me?.id },
    { k: "status", l: "Status", t: "select", o: O.tkstatus, d: "Open" }, { k: "due_at", l: "Due (SLA)", t: "datetime", hint: "Leave blank to set from priority" },
    { k: "description", l: "Description", t: "textarea", full: 1 },
  ],
  product: () => [
    { k: "name", l: "Product name", req: 1, full: 1 }, { k: "sku", l: "SKU" }, { k: "category", l: "Category", t: "select", o: O.pcat },
    { k: "unit", l: "Unit", t: "select", o: O.unit }, { k: "price", l: "Wholesale price / unit", t: "number" }, { k: "cost", l: "Cost / unit", t: "number" }, { k: "moq", l: "Minimum order qty", t: "number" },
    { k: "stock", l: "Stock on hand", t: "number" }, { k: "lead_time_days", l: "Lead time (days)", t: "number" }, { k: "width", l: "Width" }, { k: "gsm", l: "Weight (oz / GSM)" },
    { k: "active", l: "Active", t: "bool", d: 1 }, { k: "description", l: "Description", t: "textarea", full: 1 },
  ],
  relationship: () => [
    { k: "from", l: "From", t: "entity", req: 1 }, { k: "kind", l: "Relationship", t: "select", o: O.relkind, req: 1 }, { k: "to", l: "To", t: "entity", req: 1 },
    { k: "strength", l: "Strength", t: "select", o: O.strength, d: "Medium" }, { k: "notes", l: "Notes", t: "textarea", full: 1 },
  ],
};

const optList = (opts, val, blank = "—") => `${blank !== null ? `<option value="">${esc(blank)}</option>` : ""}${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(val ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}`;
function fieldHtml(f, v) {
  if (f.s) return `<div class="form-section">${esc(f.s)}</div>`;
  if (v === undefined || v === null) v = f.d ?? "";
  const id = "f_" + f.k, req = f.req ? "required" : "", ph = f.ph ? `placeholder="${esc(f.ph)}"` : "";
  let input;
  switch (f.t) {
    case "select": input = `<select id="${id}" name="${f.k}" ${req}>${optList(f.o, v)}</select>`; break;
    case "user": input = `<select id="${id}" name="${f.k}">${optList(S.lk.users.map((u) => [u.id, u.name]), v, "Unassigned")}</select>`; break;
    case "company": input = `<select id="${id}" name="${f.k}">${optList(S.lk.companies.map((c) => [c.id, c.name]), v)}</select>`; break;
    case "contact": input = `<select id="${id}" name="${f.k}">${optList(S.lk.contacts.map((c) => [c.id, c.name + (c.company_name ? ` · ${c.company_name}` : "")]), v)}</select>`; break;
    case "deal": input = `<select id="${id}" name="${f.k}">${optList(S.lk.deals.map((c) => [c.id, `${c.name} (${c.stage})`]), v)}</select>`; break;
    case "entity": {
      const [t, i] = String(v || "").split(":");
      input = `<div style="display:flex;gap:6px"><select name="${f.k}_type" style="width:110px"><option value="contact" ${t !== "company" ? "selected" : ""}>Person</option><option value="company" ${t === "company" ? "selected" : ""}>Company</option></select>
        <select name="${f.k}_id" data-entity-for="${f.k}" required>${entityOpts(t || "contact", i)}</select></div>`; break;
    }
    case "textarea": input = `<textarea id="${id}" name="${f.k}" ${req} ${ph}>${esc(v)}</textarea>`; break;
    case "bool": return `<label class="switch ${f.full ? "full" : ""}" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="${f.k}" ${+v ? "checked" : ""}> ${esc(f.l)}</label>`;
    case "multi": { const sel = String(v || "").split(","); input = `<div class="checks">${f.o.map((o) => `<label><input type="checkbox" name="${f.k}" value="${esc(o)}" ${sel.includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>`; break; }
    case "lines": input = linesEditor(v); break;
    case "datetime": input = `<input type="datetime-local" id="${id}" name="${f.k}" value="${esc(localDT(v))}" ${req}>`; break;
    case "number": input = `<input type="number" step="any" id="${id}" name="${f.k}" value="${esc(v)}" ${req} ${ph}>`; break;
    default: input = `<input type="${f.t === "tags" ? "text" : f.t || "text"}" id="${id}" name="${f.k}" value="${esc(v)}" ${req} ${ph} ${f.t === "tags" ? 'list="dl_tags"' : ""}>`;
  }
  return `<label class="f ${f.full ? "full" : ""}"><span>${esc(f.l)}${f.req ? " <i>*</i>" : ""}</span>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</label>`;
}
const entityOpts = (t, sel) => optList(t === "company" ? S.lk.companies.map((c) => [c.id, c.name]) : S.lk.contacts.map((c) => [c.id, c.name + (c.company_name ? ` · ${c.company_name}` : "")]), sel, "Select…");
const formHtml = (fields, vals = {}) => `<div class="form-grid">${fields.map((f) => fieldHtml(f, vals[f.k])).join("")}</div><datalist id="dl_tags">${S.lk.tags.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>`;
function bindForm(root) {
  $$("[data-entity-for]", root).forEach((sel) => { const k = sel.dataset.entityFor; const t = $(`[name=${k}_type]`, root); t.onchange = () => (sel.innerHTML = entityOpts(t.value)); });
  bindLines(root);
}
function readForm(root, fields) {
  const o = {};
  for (const f of fields) {
    if (f.s) continue;
    if (f.t === "multi") { o[f.k] = $$(`[name=${f.k}]:checked`, root).map((x) => x.value).join(","); continue; }
    if (f.t === "bool") { o[f.k] = $(`[name=${f.k}]`, root).checked ? 1 : 0; continue; }
    if (f.t === "lines") { o[f.k] = readLines(root); continue; }
    if (f.t === "entity") { o[f.k + "_type"] = $(`[name=${f.k}_type]`, root).value; o[f.k + "_id"] = $(`[name=${f.k}_id]`, root).value; continue; }
    const el = $(`[name=${f.k}]`, root); if (!el) continue;
    let v = el.value.trim();
    if (f.req && !v) { el.focus(); throw new Error(`${f.l} is required`); }
    if (f.t === "datetime" && v) v = new Date(v).toISOString();
    if (f.t === "number") v = v === "" ? "" : +v;
    o[f.k] = v;
  }
  return o;
}
// product line items
function linesEditor(v) {
  let lines = []; try { lines = typeof v === "string" ? JSON.parse(v || "[]") : v || []; } catch {}
  return `<div class="lines" data-lines><table class="t" style="border:1px solid var(--border);border-radius:8px"><thead><tr><th>Product</th><th style="width:90px">Qty</th><th style="width:110px">Price / unit</th><th class="num" style="width:100px">Total</th><th style="width:30px"></th></tr></thead>
    <tbody>${lines.map(lineRow).join("")}</tbody><tfoot><tr><td colspan="3"><button type="button" class="btn sm" data-addline>${icon("plus")} Add product</button></td><td class="num"><b data-ltotal></b></td><td></td></tr></tfoot></table></div>`;
}
const lineRow = (l = {}) => `<tr><td><select data-lp>${optList(S.lk.products.map((p) => [p.id, `${p.name}${p.unit ? " / " + p.unit : ""}`]), l.product_id, "Custom item…")}</select>
  <input type="text" data-ln placeholder="Item name" value="${esc(l.product_id ? "" : l.name || "")}" style="margin-top:4px;${l.product_id ? "display:none" : ""}"></td>
  <td><input type="number" step="any" data-lq value="${esc(l.qty ?? 1)}"></td><td><input type="number" step="any" data-lpr value="${esc(l.price ?? "")}"></td><td class="num" data-lt></td>
  <td><button type="button" class="icon-btn" data-rmline>${icon("x")}</button></td></tr>`;
function bindLines(root) {
  const box = $("[data-lines]", root); if (!box) return;
  const recalc = () => { let tot = 0; $$("tbody tr", box).forEach((tr) => { const t = (+$("[data-lq]", tr).value || 0) * (+$("[data-lpr]", tr).value || 0); tot += t; $("[data-lt]", tr).textContent = money(t); }); $("[data-ltotal]", box).textContent = money(tot); const val = $("[name=value]", root); if (val && $$("tbody tr", box).length) val.placeholder = `Auto: ${tot.toFixed(2)}`; };
  box.addEventListener("input", recalc);
  box.addEventListener("change", (e) => {
    if (e.target.matches("[data-lp]")) { const tr = e.target.closest("tr"), p = S.lk.products.find((x) => x.id === +e.target.value); $("[data-ln]", tr).style.display = p ? "none" : ""; if (p && p.price) $("[data-lpr]", tr).value = p.price; }
    recalc();
  });
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-addline]")) { $("tbody", box).insertAdjacentHTML("beforeend", lineRow()); recalc(); }
    if (e.target.closest("[data-rmline]")) { e.target.closest("tr").remove(); recalc(); }
  });
  recalc();
}
function readLines(root) {
  return $$("[data-lines] tbody tr", root).map((tr) => {
    const pid = +$("[data-lp]", tr).value || null, p = S.lk.products.find((x) => x.id === pid);
    return { product_id: pid, name: p ? p.name : $("[data-ln]", tr).value.trim() || "Item", category: p?.category, unit: p?.unit, qty: +$("[data-lq]", tr).value || 0, price: +$("[data-lpr]", tr).value || 0 };
  }).filter((l) => l.qty || l.price);
}

// generic create/edit modal
const ENT_API = { contact: "contacts", company: "companies", deal: "deals", task: "tasks", interaction: "interactions", ticket: "tickets", product: "products" };
const ENT_LABEL = { contact: "contact", company: "company", deal: "deal", task: "task", interaction: "activity", ticket: "ticket", product: "product" };
async function editRecord(kind, rec = null, preset = {}) {
  const fields = F[kind]();
  const vals = { ...preset, ...(rec || {}) };
  const res = await modal({
    title: rec ? `Edit ${ENT_LABEL[kind]}` : `New ${ENT_LABEL[kind]}`, size: ["deal", "contact", "company"].includes(kind) ? "wide" : "", submit: rec ? "Save changes" : `Create ${ENT_LABEL[kind]}`,
    body: formHtml(fields, vals) + (kind === "interaction" && !rec ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><label class="switch"><input type="checkbox" name="_followup"> Create a follow-up task</label>
      <div class="form-grid hidden" data-fu style="margin-top:10px"><label class="f"><span>Follow-up task</span><input type="text" name="_fu_title" placeholder="Follow up"></label><label class="f"><span>Due</span><input type="date" name="_fu_due" value="${addDays(3)}"></label></div></div>` : ""),
    onOpen: (form) => { bindForm(form); const fu = $("[name=_followup]", form); if (fu) fu.onchange = () => $("[data-fu]", form).classList.toggle("hidden", !fu.checked);
      const ct = $("[name=contact_id]", form), co = $("[name=company_id]", form);
      if (ct && co) ct.addEventListener("change", () => { const c = S.lk.contacts.find((x) => x.id === +ct.value); if (c?.company_id && !co.value) co.value = c.company_id; }); },
    onSubmit: async (form) => {
      const data = readForm(form, fields);
      if (kind === "deal") data.auto_value = data.value === "" && data.product_lines?.length;
      const saved = rec ? await PATCH(`/api/${ENT_API[kind]}/${rec.id}`, data) : await POST(`/api/${ENT_API[kind]}`, data);
      if (kind === "interaction" && !rec && $("[name=_followup]", form).checked) {
        await POST("/api/tasks", { title: $("[name=_fu_title]", form).value || `Follow up: ${data.subject || data.type}`, type: "Follow-up", due_at: $("[name=_fu_due]", form).value, contact_id: data.contact_id, company_id: data.company_id, deal_id: data.deal_id });
      }
      return saved;
    },
  });
  if (res) { toast(rec ? "Saved" : `${ENT_LABEL[kind][0].toUpperCase() + ENT_LABEL[kind].slice(1)} created`); if (["contact", "company", "deal", "product"].includes(kind)) loadLookups(); }
  return res;
}
async function deleteRecord(kind, rec, label) {
  if (!(await confirmBox(`Delete <b>${esc(label)}</b>? This can't be undone.`))) return false;
  await DEL(`/api/${ENT_API[kind] || kind}/${rec.id}`); toast("Deleted"); loadLookups(); return true;
}

// ---------------------------------------------------------------- table
function table(cols, rows, { click, sort, dir, selectable, selected = new Set(), empty = "Nothing here yet" } = {}) {
  if (!rows.length) return `<div class="empty">${icon("inbox")}${esc(empty)}</div>`;
  return `<div class="table-wrap"><table class="t"><thead><tr>${selectable ? `<th class="sel"><input type="checkbox" data-selall></th>` : ""}${cols.map((c) => `<th class="${c.num ? "num" : ""} ${c.sort ? "sortable" : ""} ${c.cls || ""}" ${c.sort ? `data-sort="${c.sort}"` : ""}>${esc(c.l)}${sort && c.sort === sort ? (dir === "ASC" ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r, i) => `<tr class="${click ? "click" : ""}" data-i="${i}">${selectable ? `<td class="sel"><input type="checkbox" data-sel="${r.id}" ${selected.has(r.id) ? "checked" : ""}></td>` : ""}${cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function bindTable(root, rows, { click, onSort } = {}) {
  $$("tbody tr", root).forEach((tr) => tr.addEventListener("click", (e) => { if (e.target.closest("a,button,input,select")) return; click && click(rows[+tr.dataset.i]); }));
  $$("th[data-sort]", root).forEach((th) => (th.onclick = () => onSort && onSort(th.dataset.sort)));
}
const pager = (total, offset, limit) => total > limit ? `<div class="pager"><span>${num(offset + 1)}–${num(Math.min(offset + limit, total))} of ${num(total)}</span><span class="sp"><button class="btn sm" data-pg="-1" ${offset <= 0 ? "disabled" : ""}>Previous</button><button class="btn sm" data-pg="1" ${offset + limit >= total ? "disabled" : ""}>Next</button></span></div>` : `<div class="pager"><span>${num(total)} record${total === 1 ? "" : "s"}</span></div>`;

// ---------------------------------------------------------------- charts (SVG)
const PAL = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
const shortMoney = (v) => { const a = Math.abs(v); return (v < 0 ? "-" : "") + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k" : Math.round(a)); };
const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: "short" }) + (String(new Date().getFullYear()) === y ? "" : ` '${y.slice(2)}`); };
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function barChart(labels, series, { h = 240, w = 640, stacked = false, fmt = shortMoney, line = null, lineLabel = "" } = {}) {
  const W = w, H = h, L = 44, R = 10, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const tot = labels.map((_, i) => stacked ? series.reduce((s, x) => s + (x.data[i] || 0), 0) : Math.max(...series.map((x) => x.data[i] || 0)));
  const max = niceMax(Math.max(...tot, line || 0, 0));
  const bw = iw / labels.length, gw = bw * 0.62, n = stacked ? 1 : series.length;
  let g = `<g class="grid">`; for (let i = 0; i <= 4; i++) { const y = T + ih - (ih * i) / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt((max * i) / 4)}</text>`; } g += "</g>";
  let bars = "";
  labels.forEach((lab, i) => {
    let acc = 0;
    series.forEach((s, j) => {
      const v = s.data[i] || 0, bh = (v / max) * ih;
      const x = stacked ? L + i * bw + (bw - gw) / 2 : L + i * bw + (bw - gw) / 2 + (gw / n) * j, w = stacked ? gw : gw / n - 2;
      const y = T + ih - bh - (stacked ? acc : 0); acc += stacked ? bh : 0;
      bars += `<rect x="${x}" y="${y}" width="${Math.max(w, 1)}" height="${Math.max(bh, 0)}" rx="3" fill="${s.color || PAL[j]}" data-tip="${esc(`${lab} · ${s.name}: ${fmt === shortMoney ? money(v) : num(v, 1)}`)}"/>`;
    });
    bars += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  if (line) { const y = T + ih - (line / max) * ih; bars += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--red)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${y - 5}" text-anchor="end" style="fill:var(--red)">${esc(lineLabel)}</text>`; }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}${bars}</svg>${series.length > 1 || line ? `<div class="legend">${series.map((s, j) => `<span><i style="background:${s.color || PAL[j]}"></i>${esc(s.name)}</span>`).join("")}${line ? `<span><i style="background:var(--red)"></i>${esc(lineLabel)}</span>` : ""}</div>` : ""}`;
}
function lineChart(labels, series, { h = 220, w = 640, fmt = shortMoney, area = true } = {}) {
  const W = w, H = h, L = 44, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.data)));
  const x = (i) => L + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1)), y = (v) => T + ih - (v / max) * ih;
  let g = `<g class="grid">`; for (let i = 0; i <= 4; i++) { const yy = T + ih - (ih * i) / 4; g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmt((max * i) / 4)}</text>`; } g += "</g>";
  const step = Math.ceil(labels.length / 10);
  let out = labels.map((l, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : "")).join("");
  series.forEach((s, j) => {
    const c = s.color || PAL[j], pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    if (area) out += `<polygon points="${x(0)},${T + ih} ${pts} ${x(s.data.length - 1)},${T + ih}" fill="${c}" opacity=".12"/>`;
    out += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>`;
    out += s.data.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}" data-tip="${esc(`${labels[i]} · ${s.name}: ${fmt === shortMoney ? money(v) : num(v, 1)}`)}"/>`).join("");
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}${out}</svg>${series.length > 1 ? `<div class="legend">${series.map((s, j) => `<span><i style="background:${s.color || PAL[j]}"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}`;
}
function donut(items, { fmt = (v) => num(v), size = 170 } = {}) {
  const tot = items.reduce((s, x) => s + (+x.value || 0), 0);
  if (!tot) return `<div class="empty">No data yet</div>`;
  const r = 60, c = 2 * Math.PI * r; let off = 0;
  const arcs = items.map((it, i) => { const f = (+it.value || 0) / tot, a = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${PAL[i % 8]}" stroke-width="22" stroke-dasharray="${f * c} ${c}" stroke-dashoffset="${-off * c}" transform="rotate(-90 80 80)" data-tip="${esc(`${it.label}: ${fmt(it.value)} (${Math.round(f * 100)}%)`)}"/>`; off += f; return a; }).join("");
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 160 160" width="${size}" height="${size}" class="chart" style="width:${size}px">${arcs}<text x="80" y="78" text-anchor="middle" style="font-size:20px;font-weight:700;fill:var(--text)">${esc(fmt === num ? num(tot) : shortMoney(tot))}</text><text x="80" y="96" text-anchor="middle">total</text></svg>
    <div class="legend" style="flex-direction:column;flex:1;min-width:140px">${items.map((it, i) => `<span><i style="background:${PAL[i % 8]}"></i>${esc(it.label)} <b style="margin-left:auto;color:var(--text)">${esc(fmt(it.value))}</b></span>`).join("")}</div></div>`;
}
function hbars(items, { fmt = (v) => num(v), color } = {}) {
  if (!items.length) return `<div class="empty">No data yet</div>`;
  const max = Math.max(...items.map((x) => +x.value || 0), 1);
  return `<div class="hbar">${items.map((it, i) => `<div class="lbl" title="${esc(it.label)}">${esc(it.label)}</div><div class="track"><div class="fill" style="width:${((+it.value || 0) / max) * 100}%;background:${color || PAL[i % 8]}"></div></div><div class="v">${esc(fmt(it.value))}</div>`).join("")}</div>`;
}
function funnel(items) {
  const max = Math.max(...items.map((x) => x.count), 1);
  return `<div class="funnel">${items.map((it, i) => `<div style="width:${Math.max(30, (it.count / max) * 100)}%;background:${PAL[i % 8]}"><span>${esc(it.stage)}</span><span>${num(it.count)}${i ? ` · ${items[0].count ? Math.round((it.count / items[0].count) * 100) : 0}%` : ""}</span></div>`).join("")}</div>`;
}
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest?.("[data-tip]"); let tip = $(".tip");
  if (!t) { tip && tip.remove(); return; }
  if (!tip) { tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip); }
  tip.textContent = t.dataset.tip; tip.style.left = e.clientX + 12 + "px"; tip.style.top = e.clientY - 30 + "px";
});

// ---------------------------------------------------------------- rich text editor
function richEditor(name, html = "", { merge = true, height } = {}) {
  const tags = ["first_name", "last_name", "full_name", "company", "city", "title", "my_name", "my_title", "my_phone", "my_company", "signature"];
  return `<div class="editor-wrap" data-editor="${name}"><div class="editor-tools">
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic"><i>I</i></button><button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="formatBlock" data-arg="H2" title="Heading">H</button><button type="button" data-cmd="formatBlock" data-arg="P" title="Paragraph">¶</button>
    <button type="button" data-cmd="insertUnorderedList" title="Bullets">• List</button><button type="button" data-cmd="insertOrderedList" title="Numbers">1. List</button>
    <button type="button" data-cmd="link" title="Link">🔗 Link</button><button type="button" data-cmd="button" title="Button">▭ Button</button><button type="button" data-cmd="removeFormat" title="Clear formatting">⌫</button>
    ${merge ? `<select data-merge><option value="">Insert field…</option>${tags.map((t) => `<option value="{{${t}}}">${t.replace(/_/g, " ")}</option>`).join("")}</select>` : ""}
    <button type="button" data-cmd="source" style="margin-left:auto" title="Edit HTML">&lt;/&gt; HTML</button></div>
    <div class="editor" contenteditable="true" style="${height ? `min-height:${height}px` : ""}">${html}</div><textarea class="editor-src hidden"></textarea></div>`;
}
function bindEditor(root) {
  $$("[data-editor]", root).forEach((w) => {
    const ed = $(".editor", w), src = $(".editor-src", w);
    $$("[data-cmd]", w).forEach((b) => b.onmousedown = (e) => {
      e.preventDefault();
      const c = b.dataset.cmd;
      if (c === "source") { const on = src.classList.contains("hidden"); if (on) src.value = ed.innerHTML; else ed.innerHTML = src.value; src.classList.toggle("hidden"); ed.classList.toggle("hidden"); return; }
      if (c === "link") { const u = prompt("Link URL (https://…)"); if (u) document.execCommand("createLink", false, u); return; }
      if (c === "button") { const u = prompt("Button link URL (https://…)"); const t = u && prompt("Button text", "Learn more"); if (u && t) document.execCommand("insertHTML", false, `<p><a href="${esc(u)}" style="display:inline-block;background:#86602d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(t)}</a></p>`); return; }
      document.execCommand(c, false, b.dataset.arg || null);
    });
    const mg = $("[data-merge]", w); if (mg) mg.onchange = () => { ed.focus(); document.execCommand("insertText", false, mg.value); mg.value = ""; };
  });
}
const editorValue = (root, name) => { const w = $(`[data-editor="${name}"]`, root); const src = $(".editor-src", w); return src.classList.contains("hidden") ? $(".editor", w).innerHTML : src.value; };
const setEditor = (root, name, html) => { const w = $(`[data-editor="${name}"]`, root); $(".editor", w).innerHTML = html; $(".editor-src", w).value = html; };

// ---------------------------------------------------------------- CSV
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function downloadCSV(name, cols, rows) {
  const e = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map((c) => e(c.l)).join(","), ...rows.map((r) => cols.map((c) => e(c.v ? c.v(r) : r[c.k])).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- shell & routing
const NAV = [
  ["Overview", [["dashboard", "Dashboard", "dashboard"]]],
  ["Customers", [["contacts", "Contacts", "contacts"], ["companies", "Companies", "company"], ["relationships", "Relationship map", "network"]]],
  ["Sales", [["pipeline", "Pipeline", "pipeline"], ["tasks", "Tasks", "tasks"], ["activities", "Activity log", "activity"], ["forecast", "Forecast", "forecast"], ["products", "Products", "box"]]],
  ["Marketing", [["campaigns", "Campaigns", "megaphone"], ["templates", "Email templates", "template"], ["emails", "Email inbox", "mail"]]],
  ["Service", [["tickets", "Support tickets", "ticket"]]],
  ["Insights", [["analytics", "Analytics", "chart"]]],
  ["Admin", [["team", "Team & logins", "shield", 3], ["settings", "Settings", "settings", 3], ["audit", "Audit log", "list", 3]]],
];
const ROUTES = {};
let routeToken = 0;
function shell() {
  $("#root").innerHTML = `<div class="app"><aside class="side" id="side"><div class="brand"><div class="logo">ICS</div><div><b>${esc(S.settings.company_name || "Indian Craft Supply")}</b><span>CRM</span></div></div>
    <nav class="nav">${NAV.map(([g, items]) => { const vis = items.filter((i) => !i[3] || can(i[3])); return vis.length ? `<div class="nav-group">${g}</div>` + vis.map(([r, l, ic]) => `<a href="#/${r}" data-nav="${r}">${icon(ic)}${l}<span class="count hidden" data-count="${r}"></span></a>`).join("") : ""; }).join("")}</nav>
    <div class="side-foot">Signed in as<br><b style="color:#e9dcc7">${esc(S.me.name)}</b> · ${esc(S.me.role)}</div></aside>
    <div class="main"><header class="topbar"><button class="icon-btn menu-btn" id="menuBtn">${icon("menu")}</button>
      <div class="search">${icon("search")}<input type="search" id="gsearch" placeholder="Search contacts, companies, deals, tickets…  ( / )" autocomplete="off"><div class="search-results hidden" id="gresults"></div></div>
      <div class="top-actions">${can(1) ? `<button class="btn primary" id="newBtn">${icon("plus")}<span class="hide-sm">New</span></button>` : ""}
      <button class="icon-btn" id="themeBtn" title="Toggle dark mode">${icon("moon")}</button>
      <button class="icon-btn" id="userBtn" style="padding:2px">${avatar(S.me.name)}</button></div></header>
      <main class="page" id="page"></main></div></div>`;
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  $("#side").addEventListener("click", (e) => { if (e.target.closest("a")) $("#side").classList.remove("open"); });
  $("#themeBtn").onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); const nx = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = nx; try { localStorage.setItem("crm-theme", nx); } catch {} };
  $("#userBtn").onclick = (e) => popMenu(e.currentTarget, [{ label: "My profile & password", icon: "user", run: () => go("profile") }, "-", { label: "Sign out", icon: "logout", run: logout }]);
  if ($("#newBtn")) $("#newBtn").onclick = (e) => popMenu(e.currentTarget, [
    { label: "Contact", icon: "contacts", run: () => editRecord("contact").then((r) => r && go(`contacts/${r.id}`)) },
    { label: "Company", icon: "company", run: () => editRecord("company").then((r) => r && go(`companies/${r.id}`)) },
    { label: "Deal", icon: "dollar", run: () => editRecord("deal").then((r) => r && go(`deals/${r.id}`)) },
    { label: "Task", icon: "tasks", run: () => editRecord("task").then((r) => r && rerender()) },
    { label: "Log activity", icon: "activity", run: () => editRecord("interaction").then((r) => r && rerender()) },
    { label: "Support ticket", icon: "ticket", run: () => editRecord("ticket").then((r) => r && go(`tickets/${r.id}`)) },
    "-", { label: "Send email", icon: "mail", run: () => composeEmail({}) },
  ]);
  bindSearch();
  updateCounts();
}
async function updateCounts() {
  try {
    const [t, k] = await Promise.all([GET("/api/tasks" + qs({ mine: 1, view: "overdue", limit: 1 })), GET("/api/tickets" + qs({ open: 1, limit: 1 }))]);
    const set = (r, n) => { const el = $(`[data-count="${r}"]`); if (el) { el.textContent = n; el.classList.toggle("hidden", !n); } };
    set("tasks", t.total); set("tickets", k.total);
  } catch {}
}
function bindSearch() {
  const inp = $("#gsearch"), box = $("#gresults"); let timer, sel = -1;
  const KIND = { contact: ["contacts", "contacts"], company: ["companies", "company"], deal: ["deals", "dollar"], ticket: ["tickets", "ticket"], product: ["products", "box"] };
  inp.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
    const q = inp.value.trim(); if (q.length < 2) { box.classList.add("hidden"); return; }
    const { results } = await GET("/api/search" + qs({ q })); sel = -1;
    box.innerHTML = results.length ? results.map((r) => `<a href="#/${KIND[r.kind][0]}${r.kind === "product" ? "" : "/" + r.id}">${icon(KIND[r.kind][1])}<span><b>${esc(r.label)}</b><br><span class="small muted">${esc(r.kind)}${r.sub ? " · " + esc(r.sub) : ""}</span></span></a>`).join("") : `<div class="empty">No matches</div>`;
    box.classList.remove("hidden");
  }, 180); };
  inp.onkeydown = (e) => {
    const items = $$("a", box);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); items.forEach((a, i) => a.classList.toggle("sel", i === sel)); }
    if (e.key === "Enter" && items.length) { (items[sel] || items[0]).click(); }
    if (e.key === "Escape") { box.classList.add("hidden"); inp.blur(); }
  };
  box.onclick = () => { box.classList.add("hidden"); inp.value = ""; };
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.classList.add("hidden"); });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !e.target.closest("input,textarea,select,[contenteditable]")) { e.preventDefault(); inp.focus(); } });
}
const go = (r) => { if (location.hash === "#/" + r) rerender(); else location.hash = "#/" + r; };
function rerender() { route(); }
async function route() {
  if (!S.me) return;
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = (path || "dashboard").split("/");
  const Q = Object.fromEntries(new URLSearchParams(query || ""));
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === parts[0] || (parts[0] === "deals" && a.dataset.nav === "pipeline")));
  const fn = ROUTES[parts[0]] || ROUTES.dashboard;
  const tok = ++routeToken, page = $("#page");
  page.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
  try {
    const html = await fn(parts[1], Q, page);
    if (tok !== routeToken) return;
    if (typeof html === "string") page.innerHTML = html;
    page._after && page._after(); page._after = null;
  } catch (e) { if (tok === routeToken) page.innerHTML = `<div class="err-box">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
const after = (fn) => ($("#page")._after = fn);
const pageHead = (title, sub, actions = "") => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><div class="actions">${actions}</div></div>`;
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- auth screens
function authLayout(inner) {
  return `<div class="auth"><div class="auth-art"><div class="brand" style="padding:0"><div class="logo">ICS</div><div><b>${esc(S.company || "Indian Craft Supply")}</b><span>Customer Relationship Management</span></div></div>
    <div><h1>Every buyer, sample, quote and order — in one place.</h1><p>Track jute, burlap and cotton customers from first contact to repeat orders. Email, pipeline, service and analytics for your whole team.</p></div>
    <div class="small" style="color:#8d8273">Secure sign-in · Data stored on Cloudflare</div></div><div class="auth-form"><div class="auth-card">${inner}</div></div></div>`;
}
function loginScreen() {
  $("#root").innerHTML = authLayout(`<h2>Sign in</h2><div class="muted">Use the email and password your administrator gave you.</div>
    <form id="lf"><div id="lerr"></div><label class="f"><span>Email</span><input type="email" name="email" required autocomplete="username" autofocus></label>
    <label class="f"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn primary" type="submit">Sign in</button></form>`);
  $("#lf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; $("button", f).disabled = true;
    try { const r = await POST("/api/auth/login", { email: f.email.value, password: f.password.value }); S.me = r.user; await start(); }
    catch (err) { $("#lerr").innerHTML = `<div class="err-box">${esc(err.message)}</div>`; $("button", f).disabled = false; }
  };
}
function setupScreen(codeRequired) {
  $("#root").innerHTML = authLayout(`<h2>Welcome — create the admin account</h2><div class="muted">This is the first sign-in. The account you create here is the administrator, who adds every other user.</div>
    <form id="sf"><div id="serr"></div>${codeRequired ? `<label class="f"><span>Setup code</span><input type="text" name="setup_code" required autocomplete="off"></label>` : ""}
    <label class="f"><span>Business name</span><input type="text" name="company_name" value="Indian Craft Supply" required></label>
    <label class="f"><span>Your name</span><input type="text" name="name" required autocomplete="name"></label>
    <label class="f"><span>Your email (your login)</span><input type="email" name="email" required autocomplete="username"></label>
    <label class="f"><span>Password (min 10 characters)</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
    <label class="f"><span>Confirm password</span><input type="password" name="password2" required autocomplete="new-password"></label>
    <button class="btn primary" type="submit">Create admin account</button></form>`);
  $("#sf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.password.value !== f.password2.value) { $("#serr").innerHTML = `<div class="err-box">Passwords don't match</div>`; return; }
    try { const r = await POST("/api/auth/setup", { setup_code: f.setup_code?.value, company_name: f.company_name.value, name: f.name.value, email: f.email.value, password: f.password.value }); S.me = r.user; await start(); }
    catch (err) { $("#serr").innerHTML = `<div class="err-box">${esc(err.message)}</div>`; }
  };
}
async function logout() { await POST("/api/auth/logout").catch(() => {}); S.me = null; boot(); }
async function start() {
  await Promise.all([loadSettings(), loadLookups()]);
  shell();
  if (!location.hash || location.hash === "#/") location.hash = "#/dashboard"; else route();
  if (S.me.must_change_password) forcePasswordChange();
}
async function forcePasswordChange() {
  await modal({ title: "Choose your own password", size: "narrow", cancel: null, submit: "Set password",
    body: `<p class="muted" style="margin-top:0">Your administrator gave you a temporary password. Please choose a new one to continue.</p><div class="form-grid"><label class="f full"><span>Temporary password</span><input type="password" name="current" required></label><label class="f full"><span>New password (min 10 characters)</span><input type="password" name="password" required></label><label class="f full"><span>Confirm</span><input type="password" name="password2" required></label></div>`,
    onSubmit: async (f) => { if (f.password.value !== f.password2.value) throw new Error("Passwords don't match"); await POST("/api/me/password", { current: f.current.value, password: f.password.value }); S.me.must_change_password = false; toast("Password updated"); } });
}
async function boot() {
  try { const t = localStorage.getItem("crm-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
  const st = await GET("/api/auth/state").catch(() => ({}));
  S.company = st.company;
  if (st.needsSetup) return setupScreen(st.setupCodeRequired);
  if (!st.user) return loginScreen();
  S.me = st.user; await start();
}
