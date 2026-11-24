/* Mr Miracle FBA System — dashboard (vanilla JS, no build step). */
(() => {
"use strict";

// ---------------- helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = (n, d = 0) => n === null || n === undefined || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt$ = (n, d = 2) => n === null || n === undefined || !isFinite(n) ? "—" : (n < 0 ? "-$" : "$") + fmtN(Math.abs(n), d);
const fmt$0 = (n) => fmt$(n, 0);
const fmtPct = (n, d = 1) => n === null || n === undefined || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + fmtN(n, d) + "%";
const signCls = (n, invert = false) => !n ? "" : (n > 0) !== invert ? "good" : "bad";
const ago = (ts) => {
  if (!ts) return "never";
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago";
};
const dt = (ts) => ts ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const dayFmt = (d) => { if (!d) return "—"; const [y, m, dd] = d.split("-"); return new Date(+y, m - 1, +dd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); };
const dayShort = (d) => { const [y, m, dd] = d.split("-"); return `${+m}/${+dd}`; };
const wd = (d) => { const [y, m, dd] = d.split("-"); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(+y, m - 1, +dd).getDay()]; };
const addDays = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), err ? 7000 : 3500);
}

async function api(method, path, body, raw = false) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch("/api" + path, opt);
  if (r.status === 401 && path !== "/login" && path !== "/me") { state.me = null; renderLogin(); throw new Error("Please sign in."); }
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}
const GET = (p) => api("GET", p);
const qs = (o) => "?" + new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""))).toString();

function thumb(src, size = 38) {
  return src ? `<img class="thumb" loading="lazy" src="${esc(src)}" style="width:${size}px;height:${size}px" alt="">`
    : `<span class="thumb ph" style="width:${size}px;height:${size}px">—</span>`;
}
function prodCell(p) {
  const asin = p.asin || "";
  return `<div class="prod-cell">${thumb(p.image)}<div class="meta">
    <div><b class="mono">${esc(p.sku || p.key || asin)}</b>${p.mrm ? ' <span class="badge brand">MrM</span>' : ""}</div>
    ${asin && asin !== (p.sku || p.key) ? `<div class="small"><a href="https://www.amazon.com/dp/${esc(asin)}" target="_blank" rel="noopener">${esc(asin)}</a></div>` : ""}
    <div class="ttl" title="${esc(p.title)}">${esc(p.title || "")}</div></div></div>`;
}

function downloadCsv(name, headers, rows) {
  const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
}

function modal(html, wide = false) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal ${wide ? "wide" : ""}">${html}</div>`;
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  const close = () => bg.remove();
  $$("[data-close]", bg).forEach((b) => b.addEventListener("click", close));
  return { el: $(".modal", bg), close };
}
function confirmBox(title, html, okLabel = "Confirm") {
  return new Promise((res) => {
    const m = modal(`<h2>${esc(title)}</h2><div>${html}</div><div class="foot"><button data-close>Cancel</button><button class="primary" id="cf-ok">${esc(okLabel)}</button></div>`);
    $("#cf-ok", m.el).onclick = () => { m.close(); res(true); };
    m.el.parentElement.addEventListener("click", (e) => { if (e.target === m.el.parentElement) res(false); });
    $$("[data-close]", m.el).forEach((b) => b.addEventListener("click", () => res(false)));
  });
}

// sortable table: rows = data array, cols = [{k, l, f(row)->html, n:true, sort(row)->value}]
function table(el, cols, rows, opts = {}) {
  let sortK = opts.sort || null, dir = opts.dir || -1;
  const draw = () => {
    let data = rows.slice();
    if (sortK) {
      const c = cols.find((x) => x.k === sortK);
      const val = c.sort || ((r) => r[c.k]);
      data.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
        return (x > y ? 1 : -1) * dir;
      });
    }
    const limit = opts.limit || 2000;
    el.innerHTML = `<div class="tbl-wrap ${opts.tall === false ? "" : "tall"}"><table class="t">
      <thead><tr>${cols.map((c) => `<th class="${c.n ? "n" : ""} ${c.noSort ? "" : "sortable"} ${c.sticky ? "sticky-col" : ""}" data-k="${c.k}">${c.l}${sortK === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
      <tbody>${data.slice(0, limit).map((r, i) => `<tr data-i="${rows.indexOf(r)}">${cols.map((c) => `<td class="${c.n ? "n" : ""} ${c.cls || ""} ${c.sticky ? "sticky-col" : ""}">${c.f ? c.f(r, i) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}
      ${data.length === 0 ? `<tr><td colspan="${cols.length}" class="empty">${opts.empty || "Nothing to show yet."}</td></tr>` : ""}</tbody>
      ${opts.foot ? `<tfoot><tr>${opts.foot(data)}</tr></tfoot>` : ""}</table></div>
      ${data.length > limit ? `<div class="small muted" style="padding:8px">Showing ${limit} of ${data.length}. Narrow the filters or export CSV to see all.</div>` : ""}`;
    $$("th.sortable", el).forEach((th) => th.onclick = () => {
      const k = th.dataset.k; if (sortK === k) dir = -dir; else { sortK = k; dir = -1; } draw();
    });
    opts.after && opts.after(el, data);
  };
  draw();
  return { redraw: draw, setRows: (r) => { rows = r; draw(); } };
}

// --------------- charts ---------------
const charts = new Map();
function chart(canvas, cfg) {
  if (!window.Chart) return;
  charts.get(canvas)?.destroy();
  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--line-2");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const c = new Chart(canvas, cfg);
  charts.set(canvas, c);
  return c;
}
const COLORS = () => [css("--c1"), css("--c2"), css("--c3"), css("--c4"), css("--c5")];

// --------------- product picker ---------------
let productsCache = null;
async function products(force = false) {
  if (!productsCache || force) productsCache = await GET("/products");
  return productsCache;
}
/** Multi-select by SKU or ASIN. onChange(ids[]) */
async function picker(el, { selected = [], placeholder = "All products — type to pick SKUs or ASINs", single = false, onChange, filter } = {}) {
  const list = await products();
  let sel = selected.slice();
  el.innerHTML = `<div class="picker"><div class="box"></div><div class="dd hidden"></div></div>`;
  const box = $(".box", el), dd = $(".dd", el);
  const drawBox = () => {
    box.innerHTML = sel.map((s) => `<span class="chip">${esc(s)}<button data-x="${esc(s)}" title="Remove">×</button></span>`).join("")
      + `<input placeholder="${sel.length ? "Add more…" : esc(placeholder)}">`;
    const inp = $("input", box);
    inp.oninput = () => drawDd(inp.value);
    inp.onfocus = () => drawDd(inp.value);
    inp.onkeydown = (e) => {
      if (e.key === "Enter") { const first = $(".opt", dd); if (first) first.click(); else if (inp.value.trim()) add(inp.value.trim().toUpperCase().startsWith("B0") ? inp.value.trim().toUpperCase() : inp.value.trim()); e.preventDefault(); }
      if (e.key === "Backspace" && !inp.value && sel.length) { sel.pop(); changed(); }
      if (e.key === "Escape") dd.classList.add("hidden");
    };
    $$("[data-x]", box).forEach((b) => b.onclick = () => { sel = sel.filter((x) => x !== b.dataset.x); changed(); });
  };
  const add = (id) => { if (single) sel = [id]; else if (!sel.includes(id)) sel.push(id); changed(); dd.classList.add("hidden"); };
  const changed = () => { drawBox(); onChange && onChange(sel.slice()); if (!single) $("input", box).focus(); };
  const drawDd = (term) => {
    term = term.trim().toLowerCase();
    let items = filter ? list.filter(filter) : list;
    if (term) items = items.filter((p) => (p.sku + " " + p.asin + " " + (p.title || "")).toLowerCase().includes(term));
    const asinGroups = new Map();
    items.forEach((p) => { if (p.asin && !asinGroups.has(p.asin)) asinGroups.set(p.asin, p); });
    const opts = [];
    if (term && !single) {
      for (const [asin, p] of asinGroups) if (asin.toLowerCase().includes(term)) opts.push({ id: asin, label: `ASIN ${asin}`, p, kind: "ASIN" });
    }
    items.slice(0, 60).forEach((p) => opts.push({ id: p.sku, label: p.sku, p, kind: "SKU" }));
    dd.innerHTML = opts.length ? opts.slice(0, 60).map((o) => `<div class="opt" data-id="${esc(o.id)}">${thumb(o.p.image, 28)}<div><b class="mono">${esc(o.label)}</b> <span class="faint">${o.kind === "SKU" ? esc(o.p.asin || "") : ""} · ${fmtN(o.p.units30)} sold/30d</span><div class="small muted" style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.p.title || "")}</div></div></div>`).join("")
      : `<div class="opt muted">No matches</div>`;
    dd.classList.remove("hidden");
    $$(".opt[data-id]", dd).forEach((o) => o.onclick = () => add(o.dataset.id));
  };
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) dd.classList.add("hidden"); });
  drawBox();
  return { get: () => sel.slice(), set: (s) => { sel = s.slice(); drawBox(); } };
}

// --------------- date range control ---------------
const PRESETS = [
  ["yesterday", "Yesterday"], ["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"], ["60", "Last 60 days"], ["90", "Last 90 days"],
  ["mtd", "Month to date"], ["lastmonth", "Last month"], ["ytd", "Year to date"], ["365", "Last 12 months"], ["custom", "Custom…"],
];
function presetRange(p) {
  const t = todayLA(), y = addDays(t, -1);
  if (p === "yesterday") return [y, y];
  if (p === "mtd") return [t.slice(0, 8) + "01", y < t.slice(0, 8) + "01" ? t : y];
  if (p === "lastmonth") { const e = addDays(t.slice(0, 8) + "01", -1); return [e.slice(0, 8) + "01", e]; }
  if (p === "ytd") return [t.slice(0, 5) + "01-01", y];
  const n = Number(p) || 30; return [addDays(y, -(n - 1)), y];
}
function rangeCtl(el, init = "30", onChange) {
  let [from, to] = presetRange(init);
  el.innerHTML = `<label class="f">Period<select class="rp">${PRESETS.map(([k, l]) => `<option value="${k}" ${k === init ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f cust ${init === "custom" ? "" : "hidden"}">From<input type="date" class="rf" value="${from}"></label>
    <label class="f cust ${init === "custom" ? "" : "hidden"}">To<input type="date" class="rt" value="${to}"></label>`;
  const sel = $(".rp", el), rf = $(".rf", el), rt = $(".rt", el);
  sel.onchange = () => {
    $$(".cust", el).forEach((x) => x.classList.toggle("hidden", sel.value !== "custom"));
    if (sel.value !== "custom") { [from, to] = presetRange(sel.value); rf.value = from; rt.value = to; onChange && onChange(from, to); }
  };
  rf.onchange = rt.onchange = () => { from = rf.value; to = rt.value; if (from && to) onChange && onChange(from, to); };
  return { get: () => [from, to], set: (f, t) => { from = f; to = t; rf.value = f; rt.value = t; sel.value = "custom"; $$(".cust", el).forEach((x) => x.classList.remove("hidden")); } };
}

// --------------- app shell ---------------
const state = { me: null, route: "" };
const ICONS = {
  dash: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  sales: '<path d="M3 3v18h18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 15l4-4 3 3 5-6" fill="none" stroke="currentColor" stroke-width="2"/>',
  price: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  compare: '<path d="M7 4v16M17 4v16M3 8h8M13 16h8" fill="none" stroke="currentColor" stroke-width="2"/>',
  repricer: '<path d="M4 4v6h6M20 20v-6h-6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 10a8 8 0 00-14.9-3M4 14a8 8 0 0014.9 3" fill="none" stroke="currentColor" stroke-width="2"/>',
  tag: '<path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.8 5.8 20.3l1.6-6.8L2.2 8.9l6.9-.6z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  fees: '<rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/>',
  sellers: '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20c0-3.9 3.1-6 7-6s7 2.1 7 6M16 4.5a3.5 3.5 0 010 7M18 14c2.4.6 4 2.6 4 6" fill="none" stroke="currentColor" stroke-width="2"/>',
  inv: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4M12 11v10" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="2"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  users: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const NAV = [
  ["sec", "Overview"], ["dashboard", "Dashboard", "dash"],
  ["sec", "Sales"], ["sales", "Sales analysis", "sales"], ["price", "Price vs sales", "price"], ["grid", "Daily grid", "grid"], ["compare", "Compare periods", "compare"],
  ["sec", "Pricing"], ["repricer", "Repricer", "repricer"], ["pricing", "Mr Miracle pricing", "tag"],
  ["sec", "Monitoring"], ["fees", "FBA fee changes", "fees"], ["sellers", "Seller count", "sellers"], ["inventory", "Inventory status", "inv"],
  ["sec", "Listings"], ["images", "Image updates", "img"],
  ["sec", "Admin"], ["settings", "Settings & sync", "gear"], ["users", "Users", "users", "admin"],
];

function shell() {
  $("#root").innerHTML = `<div class="app">
    <aside class="side" id="side">
      <div class="logo"><div class="mark">MM</div><div><div class="t1">Mr Miracle</div><div class="t2">FBA System</div></div></div>
      <nav class="nav">${NAV.filter((n) => !n[3] || state.me.role === n[3]).map((n) => n[0] === "sec"
        ? `<div class="sec">${n[1]}</div>`
        : `<a href="#/${n[0]}" data-r="${n[0]}"><svg viewBox="0 0 24 24" fill="currentColor">${ICONS[n[2]]}</svg>${n[1]}</a>`).join("")}</nav>
      <div class="who"><div><b>${esc(state.me.name || state.me.email)}</b></div><div style="opacity:.7">${esc(state.me.email)} · ${state.me.role}</div>
        <div class="row" style="margin-top:8px"><button class="sm" id="pw-btn">Password</button><button class="sm" id="theme-btn">Theme</button><button class="sm" id="logout-btn">Sign out</button></div></div>
    </aside>
    <main class="main" id="main"></main></div>`;
  $("#logout-btn").onclick = async () => { await api("POST", "/logout"); state.me = null; renderLogin(); };
  $("#theme-btn").onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mm-theme", next); } catch {}
    route();
  };
  $("#pw-btn").onclick = changePassword;
}

function changePassword() {
  const m = modal(`<h2>Change password</h2><div class="stack">
    <label class="f">Current password<input type="password" id="pw-cur"></label>
    <label class="f">New password (8+ characters)<input type="password" id="pw-new"></label></div>
    <div class="foot"><button data-close>Cancel</button><button class="primary" id="pw-save">Save</button></div>`);
  $("#pw-save", m.el).onclick = async () => {
    try { await api("PUT", "/me/password", { current: $("#pw-cur", m.el).value, password: $("#pw-new", m.el).value }); toast("Password changed"); m.close(); }
    catch (e) { toast(e.message, true); }
  };
}

function header(title, sub, actions = "") {
  return `<div class="topbar"><div class="row"><button class="menu-btn" id="menu-btn">☰</button><div><h1>${title}</h1>${sub ? `<div class="muted small">${sub}</div>` : ""}</div></div><div class="actions">${actions}</div></div>`;
}
const canEdit = () => state.me && state.me.role !== "viewer";

async function route() {
  if (!state.me) return;
  const r = (location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard");
  state.route = r;
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.r === r));
  $("#side").classList.remove("open");
  const main = $("#main");
  charts.forEach((c) => c.destroy()); charts.clear();
  main.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
  const page = PAGES[r] || PAGES.dashboard;
  try { await page(main, new URLSearchParams(location.hash.split("?")[1] || "")); }
  catch (e) { main.innerHTML = header("Something went wrong") + `<div class="banner bad"><div class="txt">${esc(e.message)}</div></div>`; }
  const mb = $("#menu-btn"); if (mb) mb.onclick = () => $("#side").classList.toggle("open");
}

// ---------------- login ----------------
async function renderLogin() {
  const st = await GET("/setup-status").catch(() => ({}));
  const setup = st.needsSetup;
  $("#root").innerHTML = `<div class="login-wrap"><div class="login">
    <div class="logo"><div class="mark">MM</div><div><div class="t1">Mr Miracle</div><div class="t2">FBA System</div></div></div>
    <form id="lf">
      ${setup ? `<div class="banner info"><div class="txt">First-time setup: create the admin account. You need the setup code you were given.</div></div>
        <input name="code" placeholder="Setup code" required autocomplete="off">
        <input name="name" placeholder="Your name">` : ""}
      <input name="email" type="email" placeholder="Email" required autocomplete="username">
      <input name="password" type="password" placeholder="${setup ? "Choose a password (8+ characters)" : "Password"}" required autocomplete="${setup ? "new-password" : "current-password"}">
      <div class="err-msg" id="lerr"></div>
      <button class="primary" type="submit">${setup ? "Create admin account" : "Sign in"}</button>
    </form></div></div>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api("POST", setup ? "/setup" : "/login", fd);
      await boot();
    } catch (err) { $("#lerr").textContent = err.message; }
  };
}

async function boot() {
  try { state.me = await api("GET", "/me"); } catch { state.me = null; }
  if (!state.me) return renderLogin();
  shell(); route();
}
window.addEventListener("hashchange", route);
try { const t = localStorage.getItem("mm-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}

// ======================================================================
// PAGES
// ======================================================================
const PAGES = {};

// ---------------- dashboard ----------------
PAGES.dashboard = async (el) => {
  const d = await GET("/dashboard");
  const k = d.kpi, s = d.sync;
  let banner = "";
  if (!s.connected) banner = `<div class="banner warn"><div class="txt"><b>Amazon isn't connected yet.</b> An admin needs to add the commerce-mcp secret in <a href="#/settings">Settings → Connections</a>. Data starts flowing within minutes after that.</div></div>`;
  else if (s.backfill && !s.backfill.done) banner = `<div class="banner info"><div class="txt"><b>Loading sales history:</b> ${fmtN(s.backfill.daysLoaded)} of ${s.backfill.total} days so far${s.backfill.oldest ? ` (back to ${dayFmt(s.backfill.oldest)})` : ""}. Amazon generates one report per 30 days, so the full 2 years takes a few hours.</div></div>`;
  if (s.connected && !s.email) banner += `<div class="banner warn"><div class="txt"><b>Email isn't set up.</b> Fee reports and seller alerts can't be sent until an admin adds Gmail or Resend in <a href="#/settings">Settings → Connections</a>.</div></div>`;
  const kp = (l, v, sub, href) => `<${href ? `a href="${href}"` : "div"} class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub || ""}</div></${href ? "a" : "div"}>`;
  const a = d.alerts;
  el.innerHTML = header("Dashboard", `Sales days are in Amazon Pacific time · yesterday = ${dayFmt(d.yesterday)}`,
    `<span class="small muted">Today so far: <b>${fmt$0(k.todaySoFar.r)}</b> · ${fmtN(k.todaySoFar.u)} units</span>`) + banner + `
    <div class="grid g4" style="margin-bottom:16px">
      ${kp("Yesterday", fmt$0(k.yesterday.r), fmtN(k.yesterday.u) + " units", "#/sales")}
      ${kp("Last 7 days", fmt$0(k.last7.r), fmtN(k.last7.u) + " units", "#/sales")}
      ${kp("Last 14 days", fmt$0(k.last14.r), fmtN(k.last14.u) + " units", "#/sales")}
      ${kp("Last 30 days", fmt$0(k.last30.r), fmtN(k.last30.u) + " units", "#/sales")}
    </div>
    <div class="grid g3" style="margin-bottom:16px">
      ${kp("This month so far", fmt$0(k.mtd.r), fmtN(k.mtd.u) + " units")}
      ${kp("Last month", fmt$0(k.lastMonth.r), fmtN(k.lastMonth.u) + " units")}
      ${kp("This month's trajectory", fmt$0(k.trajectory), k.trajectory && k.lastMonth.r ? `<span class="${signCls(k.trajectory - k.lastMonth.r)}">${fmtPct((k.trajectory / k.lastMonth.r - 1) * 100)}</span> vs last month` : "")}
    </div>
    <div class="grid g6" style="margin-bottom:16px">
      ${kp("Fee changes (2 days)", fmtN(a.feeChanges), "dimensions, low-inventory & rates", "#/fees")}
      ${kp("Paying low-inventory fee", fmtN(a.lowInvFee), "SKUs this week", "#/fees")}
      ${kp("Seller count changes", fmtN(a.sellerChanges), "last 24 hours", "#/sellers")}
      ${kp("Need shipping", fmtN(a.lowStock), "below minimum days", "#/inventory?f=low")}
      ${kp("Out of stock", fmtN(a.oos), "that sold in the last 30 days", "#/inventory?f=oos")}
      ${kp("Buy Box lost", fmtN(a.bbLost), "on listings we check", "#/repricer")}
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>Daily sales — last 60 days</h2></div><div class="chart-box"><canvas id="c-daily"></canvas></div></div>
      <div class="card"><div class="card-h"><h2>Monthly sales — last 12 months</h2></div><div class="chart-box"><canvas id="c-month"></canvas></div></div>
    </div>
    <div class="card flush"><div class="card-h"><h2>Product sales trend — yesterday</h2><a href="#/sales" class="small">Full analysis →</a></div><div id="top"></div></div>`;
  const C = COLORS();
  chart($("#c-daily"), {
    data: { labels: d.daily.map((x) => dayShort(x.day)), datasets: [
      { type: "bar", label: "Sales $", data: d.daily.map((x) => Math.round(x.r)), backgroundColor: C[0], yAxisID: "y", borderRadius: 3 },
      { type: "line", label: "Units", data: d.daily.map((x) => x.u), borderColor: C[1], backgroundColor: C[1], yAxisID: "y1", tension: .3, pointRadius: 0, borderWidth: 2 },
    ] },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: { y: { ticks: { callback: (v) => "$" + fmtN(v / 1000) + "k" } }, y1: { position: "right", grid: { display: false } } }, plugins: { legend: { position: "bottom" } } },
  });
  chart($("#c-month"), {
    type: "bar",
    data: { labels: d.months.map((x) => new Date(x.m + "-15").toLocaleDateString("en-US", { month: "short", year: "2-digit" })), datasets: [{ label: "Sales $", data: d.months.map((x) => Math.round(x.r)), backgroundColor: C[0], borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt$0(c.raw) } } }, scales: { y: { ticks: { callback: (v) => "$" + fmtN(v / 1000) + "k" } } } },
  });
  table($("#top"), [
    { k: "asin", l: "Product", f: (r) => prodCell({ ...r, sku: r.asin }), sort: (r) => r.asin },
    { k: "y", l: "Yesterday", n: 1, f: (r) => fmtN(r.y) },
    { k: "yr", l: "Yesterday $", n: 1, f: (r) => fmt$0(r.yr) },
    { k: "l7", l: "Last 7 days", n: 1, f: (r) => fmtN(r.l7) },
    { k: "l30", l: "Last 30 days", n: 1, f: (r) => fmtN(r.l30) },
    { k: "trend", l: "7d vs 30d pace", n: 1, f: (r) => `<span class="${signCls(r.trend)}">${fmtPct(r.trend, 0)}</span>` },
    { k: "x", l: "", noSort: 1, f: (r) => `<a href="#/price?ids=${r.asin}" class="small">Price vs sales</a>` },
  ], d.top, { sort: "y", tall: false, empty: "No sales loaded yet." });
};

// ---------------- sales analysis ----------------
PAGES.sales = async (el, params) => {
  el.innerHTML = header("Sales analysis", "Units and dollars for all products or the ones you pick", `<button id="csv">Export CSV</button>`) + `
    <div class="card"><div class="filters">
      <div class="row" id="rng"></div>
      <label class="f" style="flex:1;min-width:280px">Products<div id="pk"></div></label>
      <label class="f">Group by<select id="grp"><option value="asin">ASIN</option><option value="sku">SKU</option></select></label>
      <label class="f">Chart by<select id="ivl"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
      <label class="f">Show<select id="mrm"><option value="">All products</option><option value="1">Mr Miracle only</option><option value="0">Non–Mr Miracle</option></select></label>
    </div></div>
    <div class="grid g4" id="kpis" style="margin-bottom:16px"></div>
    <div class="card"><div class="chart-box lg"><canvas id="c"></canvas></div></div>
    <div class="card flush"><div class="card-h"><h2>By product</h2><span class="small muted" id="cnt"></span></div><div id="tbl"></div></div>`;
  let ids = (params.get("ids") || "").split(",").filter(Boolean);
  let rows = [];
  const load = debounce(async () => {
    const [from, to] = rng.get();
    $("#kpis").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    const r = await GET("/sales" + qs({ from, to, ids: ids.join(","), group: $("#grp").value, interval: $("#ivl").value }));
    const mf = $("#mrm").value;
    rows = mf === "" ? r.items : r.items.filter((x) => String(x.mrm) === mf);
    const t = mf === "" ? r.totals : {
      units: rows.reduce((s, x) => s + x.units, 0), revenue: rows.reduce((s, x) => s + x.revenue, 0),
      profit: rows.some((x) => x.profit !== null) ? rows.reduce((s, x) => s + (x.profit || 0), 0) : null,
    };
    const days = r.days;
    $("#kpis").innerHTML = `
      <div class="kpi"><div class="l">Sales</div><div class="v">${fmt$0(t.revenue)}</div><div class="s">${fmt$0(t.revenue / days)} per day</div></div>
      <div class="kpi"><div class="l">Units</div><div class="v">${fmtN(t.units)}</div><div class="s">${fmtN(t.units / days, 1)} per day</div></div>
      <div class="kpi"><div class="l">Average price</div><div class="v">${fmt$(t.units ? t.revenue / t.units : null)}</div><div class="s">${dayFmt(from)} – ${dayFmt(to)} · ${days} days</div></div>
      <div class="kpi"><div class="l">Est. profit</div><div class="v">${fmt$0(t.profit)}</div><div class="s">${mf === "" && r.totals.profitCoverage < 100 ? `covers ${fmtN(r.totals.profitCoverage)}% of sales — add costs in Settings` : "after Amazon fees & product cost"}</div></div>`;
    const C = COLORS();
    const ser = mf === "" ? r.series : null;
    if (ser) {
      chart($("#c"), {
        data: { labels: ser.map((x) => $("#ivl").value === "day" ? dayShort(x.key) : x.key), datasets: [
          { type: "bar", label: "Sales $", data: ser.map((x) => x.revenue), backgroundColor: C[0], yAxisID: "y", borderRadius: 3 },
          { type: "line", label: "Units", data: ser.map((x) => x.units), borderColor: C[1], backgroundColor: C[1], yAxisID: "y1", tension: .25, pointRadius: 2, borderWidth: 2 },
        ] },
        options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.label === "Sales $" ? "Sales " + fmt$0(c.raw) : "Units " + fmtN(c.raw) } } },
          scales: { y: { ticks: { callback: (v) => fmt$0(v) } }, y1: { position: "right", grid: { display: false } } } },
      });
    } else {
      $("#c").parentElement.innerHTML = `<div class="empty">The chart shows all products. Use the Products box to chart a specific set.</div>`;
    }
    $("#cnt").textContent = `${rows.length} products`;
    table($("#tbl"), [
      { k: "key", l: "Product", f: (x) => prodCell({ ...x, sku: x.key }), cls: "prod" },
      { k: "units", l: "Units", n: 1, f: (x) => fmtN(x.units) },
      { k: "perday", l: "Units/day", n: 1, f: (x) => fmtN(x.units / days, 1), sort: (x) => x.units },
      { k: "revenue", l: "Sales", n: 1, f: (x) => fmt$0(x.revenue) },
      { k: "avgPrice", l: "Avg price", n: 1, f: (x) => fmt$(x.avgPrice) },
      { k: "profit", l: "Est. profit", n: 1, f: (x) => fmt$0(x.profit) },
      { k: "share", l: "Share", n: 1, f: (x) => t.revenue ? fmtN(x.revenue / t.revenue * 100, 1) + "%" : "—", sort: (x) => x.revenue },
      { k: "a", l: "", noSort: 1, f: (x) => `<a class="small" href="#/price?ids=${encodeURIComponent(x.key)}">Price vs sales</a>` },
    ], rows, { sort: "revenue", foot: (data) => `<td>Total (${data.length})</td><td class="n">${fmtN(data.reduce((s, x) => s + x.units, 0))}</td><td></td><td class="n">${fmt$0(data.reduce((s, x) => s + x.revenue, 0))}</td><td></td><td></td><td></td><td></td>` });
  });
  const rng = rangeCtl($("#rng"), params.get("p") || "30", load);
  await picker($("#pk"), { selected: ids, onChange: (s) => { ids = s; load(); } });
  ["#grp", "#ivl", "#mrm"].forEach((s) => $(s).onchange = load);
  $("#csv").onclick = () => downloadCsv(`sales-${rng.get().join("_")}.csv`, ["Key", "ASIN", "SKUs", "Title", "Units", "Sales", "Avg price", "Est profit"],
    rows.map((x) => [x.key, x.asin, x.skus.join(" "), x.title, x.units, x.revenue, x.avgPrice, x.profit]));
  load();
};

// ---------------- price vs sales ----------------
PAGES.price = async (el, params) => {
  el.innerHTML = header("Price vs sales", "How each price change affected units and revenue") + `
    <div class="card"><div class="filters">
      <label class="f" style="flex:1;min-width:300px">Products (one chart each)<div id="pk"></div></label>
      <div class="row" id="rng"></div>
      <label class="f" title="How many days before and after each price change to compare">Compare window<select id="win"><option>7</option><option selected>14</option><option>21</option><option>30</option></select></label>
      <label class="f" title="Smallest price move counted as a price change">Min change<select id="th"><option value="1">1%</option><option value="2">2%</option><option value="3" selected>3%</option><option value="5">5%</option><option value="10">10%</option></select></label>
      <label class="chk" style="padding-bottom:8px"><input type="checkbox" id="comb"> Combine selected</label>
    </div>
    <div class="small muted" style="margin-top:10px">Price comes from your actual selling price on Amazon orders (before promotions), plus every price change made in this system. Each change compares the average per day in the window before vs. after (stopping at the next change).</div></div>
    <div id="out"><div class="empty">Pick one or more products to see how price changes moved sales.</div></div>`;
  let ids = (params.get("ids") || "").split(",").filter(Boolean);
  const load = debounce(async () => {
    if (!ids.length) { $("#out").innerHTML = `<div class="empty">Pick one or more products to see how price changes moved sales.</div>`; return; }
    const [from, to] = rng.get();
    $("#out").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    const r = await GET("/price-analysis" + qs({ ids: ids.join(","), from, to, window: $("#win").value, threshold: $("#th").value, combine: $("#comb").checked ? 1 : "" }));
    $("#out").innerHTML = r.items.map((it, i) => `<div class="card">
      <div class="card-h"><div>${prodCell({ sku: it.key, title: it.title, image: it.image })}</div>
        <div class="row small muted">${it.events.length} price change${it.events.length === 1 ? "" : "s"} · ${fmtN(it.series.reduce((s, x) => s + x.units, 0))} units · ${fmt$0(it.series.reduce((s, x) => s + x.revenue, 0))}</div></div>
      <div class="chart-box lg"><canvas id="pc${i}"></canvas></div>
      <div id="pe${i}" style="margin-top:12px"></div></div>`).join("") || `<div class="empty">No data.</div>`;
    const C = COLORS();
    r.items.forEach((it, i) => {
      const evDays = new Set(it.events.map((e) => e.day));
      chart($("#pc" + i), {
        data: { labels: it.series.map((x) => dayShort(x.day)), datasets: [
          { type: "bar", label: "Units", data: it.series.map((x) => x.units), backgroundColor: it.series.map((x) => evDays.has(x.day) ? C[3] : C[0]), yAxisID: "y", borderRadius: 2 },
          { type: "line", label: "Price", data: it.series.map((x) => x.price), borderColor: C[1], backgroundColor: C[1], yAxisID: "y1", stepped: true, pointRadius: it.series.map((x) => evDays.has(x.day) ? 5 : 0), borderWidth: 2, spanGaps: true },
          { type: "line", label: "Actual avg price", data: it.series.map((x) => x.asp), borderColor: C[2], backgroundColor: C[2], yAxisID: "y1", pointRadius: 1.5, showLine: false, hidden: true },
        ] },
        options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "y1" ? `${c.dataset.label}: ${fmt$(c.raw)}` : `Units: ${fmtN(c.raw)}` } } },
          scales: { y: { title: { display: true, text: "Units / day" } }, y1: { position: "right", grid: { display: false }, title: { display: true, text: "Price" }, ticks: { callback: (v) => "$" + v } } } },
      });
      table($("#pe" + i), [
        { k: "day", l: "Date", f: (e) => `<b>${dayFmt(e.day)}</b><div class="small faint">${e.source === "detected" ? "from orders" : esc(e.source) + (e.user ? " · " + esc(e.user) : "")}</div>` },
        { k: "newPrice", l: "Price change", f: (e) => `${fmt$(e.oldPrice)} → <b>${fmt$(e.newPrice)}</b><div class="small ${e.pricePct > 0 ? "warn" : "info"}">${fmtPct(e.pricePct)}</div>` },
        { k: "bu", l: "Units/day before → after", n: 1, f: (e) => `${fmtN(e.before.unitsPerDay, 1)} → <b>${fmtN(e.after.unitsPerDay, 1)}</b><div class="small ${signCls(e.unitsPct)}">${fmtPct(e.unitsPct)}</div>`, sort: (e) => e.unitsPct },
        { k: "br", l: "Sales/day before → after", n: 1, f: (e) => `${fmt$0(e.before.revenuePerDay)} → <b>${fmt$0(e.after.revenuePerDay)}</b><div class="small ${signCls(e.revenuePct)}">${fmtPct(e.revenuePct)}</div>`, sort: (e) => e.revenuePct },
        { k: "days", l: "Days compared", n: 1, f: (e) => `${e.before.days} / ${e.after.days}`, noSort: 1 },
        { k: "elasticity", l: "Elasticity", n: 1, f: (e) => e.elasticity === null ? "—" : `<span title="% change in units ÷ % change in price">${fmtN(e.elasticity, 2)}</span>` },
        { k: "verdict", l: "Result", f: (e) => `<span class="badge ${/up/.test(e.verdict) && /revenue up/.test(e.verdict) ? "good" : /revenue down/.test(e.verdict) ? "bad" : ""}">${esc(e.verdict)}</span>`, noSort: 1 },
      ], it.events.slice().reverse(), { tall: false, empty: "No price changes in this period at this threshold. Try a lower “Min change” or a longer period." });
    });
  });
  const rng = rangeCtl($("#rng"), params.get("p") || "90", load);
  await picker($("#pk"), { selected: ids, placeholder: "Type a SKU or ASIN…", onChange: (s) => { ids = s; load(); } });
  ["#win", "#th", "#comb"].forEach((s) => $(s).onchange = load);
  load();
};

// ---------------- daily grid ----------------
PAGES.grid = async (el, params) => {
  el.innerHTML = header("Daily grid", "Day-by-day view, like the 2-month sheet", `<button id="csv">Export CSV</button>`) + `
    <div class="card"><div class="filters">
      <label class="f" style="flex:1;min-width:280px">Products<div id="pk"></div></label>
      <div class="row" id="rng"></div>
      <label class="f">Show<select id="met"><option value="units">Units</option><option value="revenue">Sales $</option><option value="price">Avg price</option></select></label>
      <label class="f">Group by<select id="grp"><option value="asin">ASIN</option><option value="sku">SKU</option></select></label>
      <label class="f">Rows<select id="lim"><option>50</option><option selected>100</option><option>300</option><option value="5000">All</option></select></label>
    </div></div>
    <div class="card flush" id="out"></div>`;
  let ids = (params.get("ids") || "").split(",").filter(Boolean), data = null;
  const load = debounce(async () => {
    const [from, to] = rng.get();
    $("#out").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    data = await GET("/grid" + qs({ from, to, ids: ids.join(","), metric: $("#met").value, group: $("#grp").value }));
    const met = $("#met").value, lim = Number($("#lim").value);
    const items = data.items.slice(0, lim);
    let max = 0; items.forEach((it) => Object.values(it.cells).forEach((v) => { if (v > max) max = v; }));
    const brand = css("--c1");
    const cell = (it, d, i) => {
      const v = it.cells[d];
      if (v === undefined || v === null) return `<td class="cell-heat faint">${met === "price" ? "" : "0"}</td>`;
      if (met === "price") {
        const next = data.days.slice(i + 1).find((x) => it.cells[x] !== undefined && it.cells[x] !== null);
        const pv = next ? it.cells[next] : null;
        const ch = pv !== null && Math.abs(v - pv) / pv > 0.02;
        return `<td class="cell-heat ${ch ? "pchg" : ""}" title="${ch ? `Changed from ${fmt$(pv)}` : ""}">${fmt$(v)}</td>`;
      }
      const a = max ? Math.min(0.55, v / max * 0.6) : 0;
      return `<td class="cell-heat" style="background:color-mix(in srgb, ${brand} ${Math.round(a * 100)}%, transparent)">${met === "revenue" ? fmt$0(v) : fmtN(v)}</td>`;
    };
    $("#out").innerHTML = `<div class="tbl-wrap tall"><table class="t"><thead><tr><th class="sticky-col">Product</th><th class="n">${met === "price" ? "" : "Sum"}</th>
      ${data.days.map((d) => `<th class="n">${dayShort(d)}<div class="faint" style="font-weight:500">${wd(d)}</div></th>`).join("")}</tr></thead>
      <tbody>${items.map((it) => `<tr><td class="sticky-col prod">${prodCell({ sku: it.key, title: it.title, image: it.image })}</td><td class="n"><b>${met === "price" ? "" : met === "revenue" ? fmt$0(it.total) : fmtN(it.total)}</b></td>${data.days.map((d, i) => cell(it, d, i)).join("")}</tr>`).join("")}</tbody>
      ${met !== "price" ? `<tfoot><tr><td class="sticky-col">Total</td><td class="n">${met === "revenue" ? fmt$0(items.reduce((s, x) => s + x.total, 0)) : fmtN(items.reduce((s, x) => s + x.total, 0))}</td>${data.days.map((d) => { const v = items.reduce((s, x) => s + (x.cells[d] || 0), 0); return `<td class="n">${met === "revenue" ? fmt$0(v) : fmtN(v)}</td>`; }).join("")}</tr></tfoot>` : ""}
      </table></div>${data.items.length > lim ? `<div class="small muted" style="padding:8px 12px">Showing top ${lim} of ${data.items.length}.</div>` : ""}
      ${met === "price" ? `<div class="small muted" style="padding:8px 12px">Outlined cells = price moved more than 2% from the day before.</div>` : ""}`;
  });
  const rng = rangeCtl($("#rng"), "60", load);
  await picker($("#pk"), { selected: ids, onChange: (s) => { ids = s; load(); } });
  ["#met", "#grp", "#lim"].forEach((s) => $(s).onchange = load);
  $("#csv").onclick = () => data && downloadCsv("daily-grid.csv", ["Product", "Title", "Sum", ...data.days], data.items.map((it) => [it.key, it.title, it.total, ...data.days.map((d) => it.cells[d] ?? 0)]));
  load();
};

// ---------------- compare periods ----------------
PAGES.compare = async (el) => {
  const y = addDays(todayLA(), -1);
  el.innerHTML = header("Compare periods", "Range 1 (most recent) against Range 2", `<button id="csv">Export CSV</button>`) + `
    <div class="card"><div class="filters">
      <label class="f">Range 1 from<input type="date" id="a1" value="${addDays(y, -27)}"></label><label class="f">to<input type="date" id="a2" value="${y}"></label>
      <label class="f">Range 2 from<input type="date" id="b1" value="${addDays(y, -55)}"></label><label class="f">to<input type="date" id="b2" value="${addDays(y, -28)}"></label>
      <label class="f">Quick<select id="qk"><option value="">—</option><option value="7">Last 7 vs prior 7</option><option value="14">Last 14 vs prior 14</option><option value="28" selected>Last 28 vs prior 28</option><option value="30">Last 30 vs prior 30</option><option value="yoy">Last 30 vs same 30 last year</option></select></label>
      <label class="f" style="flex:1;min-width:260px">Products<div id="pk"></div></label>
      <label class="f">Group by<select id="grp"><option value="asin">ASIN</option><option value="sku">SKU</option></select></label>
    </div></div>
    <div class="grid g4" id="kpis" style="margin-bottom:16px"></div>
    <div class="card flush" id="out"></div>`;
  let ids = [], data = null;
  const load = debounce(async () => {
    $("#out").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    data = await GET("/compare" + qs({ r1from: $("#a1").value, r1to: $("#a2").value, r2from: $("#b1").value, r2to: $("#b2").value, ids: ids.join(","), group: $("#grp").value }));
    const t1 = data.r1, t2 = data.r2;
    const k = (l, a, b, f) => `<div class="kpi"><div class="l">${l}</div><div class="v">${f(a)}</div><div class="s">vs ${f(b)} · <span class="${signCls(a - b)}">${b ? fmtPct((a - b) / Math.abs(b) * 100) : "—"}</span></div></div>`;
    $("#kpis").innerHTML = k("Sales", t1.revenue, t2.revenue, fmt$0) + k("Units", t1.units, t2.units, fmtN) + k("Sales per day", t1.avgPerDay, t2.avgPerDay, fmt$0)
      + (t1.profit !== null && t2.profit !== null ? k("Est. profit", t1.profit, t2.profit, fmt$0) : `<div class="kpi"><div class="l">Est. profit</div><div class="v">—</div><div class="s">Add product costs in Settings</div></div>`);
    table($("#out"), [
      { k: "key", l: "Product", f: (r) => prodCell({ sku: r.key, asin: r.asin, title: r.title, image: r.image }), cls: "prod" },
      { k: "u1", l: "Units R1", n: 1, f: (r) => fmtN(r.r1.units), sort: (r) => r.r1.units },
      { k: "s1", l: "Sales R1", n: 1, f: (r) => fmt$0(r.r1.revenue), sort: (r) => r.r1.revenue },
      { k: "p1", l: "Profit R1", n: 1, f: (r) => fmt$0(r.r1.profit), sort: (r) => r.r1.profit },
      { k: "u2", l: "Units R2", n: 1, f: (r) => fmtN(r.r2.units), sort: (r) => r.r2.units },
      { k: "s2", l: "Sales R2", n: 1, f: (r) => fmt$0(r.r2.revenue), sort: (r) => r.r2.revenue },
      { k: "p2", l: "Profit R2", n: 1, f: (r) => fmt$0(r.r2.profit), sort: (r) => r.r2.profit },
      { k: "unitChange", l: "Unit change", n: 1, f: (r) => `<span class="${signCls(r.unitChange)}">${r.unitChange > 0 ? "+" : ""}${fmtN(r.unitChange)}</span>` },
      { k: "unitPct", l: "%", n: 1, f: (r) => `<span class="${signCls(r.unitPct)}">${fmtPct(r.unitPct)}</span>` },
      { k: "revenueChange", l: "$ change", n: 1, f: (r) => `<span class="${signCls(r.revenueChange)}">${fmt$0(r.revenueChange)}</span>` },
      { k: "profitChange", l: "Profit change", n: 1, f: (r) => `<span class="${signCls(r.profitChange)}">${fmt$0(r.profitChange)}</span>` },
      { k: "p", l: "Avg price R1 / R2", n: 1, f: (r) => `${fmt$(r.r1.avgPrice)} / ${fmt$(r.r2.avgPrice)}`, sort: (r) => r.r1.avgPrice && r.r2.avgPrice ? r.r1.avgPrice / r.r2.avgPrice : null },
      { k: "daysAvailable", l: "Days stock", n: 1, f: (r) => fmtN(r.daysAvailable) },
      { k: "daysIncReserve", l: "Inc. reserve", n: 1, f: (r) => fmtN(r.daysIncReserve) },
    ], data.rows, { sort: "s1" });
  });
  const applyQuick = () => {
    const v = $("#qk").value; if (!v) return;
    if (v === "yoy") { $("#a1").value = addDays(y, -29); $("#a2").value = y; $("#b1").value = addDays(y, -29 - 364); $("#b2").value = addDays(y, -364); }
    else { const n = Number(v); $("#a1").value = addDays(y, -(n - 1)); $("#a2").value = y; $("#b1").value = addDays(y, -(2 * n - 1)); $("#b2").value = addDays(y, -n); }
    load();
  };
  $("#qk").onchange = applyQuick;
  ["#a1", "#a2", "#b1", "#b2"].forEach((s) => $(s).onchange = () => { $("#qk").value = ""; load(); });
  $("#grp").onchange = load;
  await picker($("#pk"), { onChange: (s) => { ids = s; load(); } });
  $("#csv").onclick = () => data && downloadCsv("comparison.csv",
    ["Product", "Title", "Units R1", "Sales R1", "Profit R1", "Units R2", "Sales R2", "Profit R2", "Unit change", "Unit %", "$ change", "Profit change", "Days stock", "Inc reserve"],
    data.rows.map((r) => [r.key, r.title, r.r1.units, r.r1.revenue, r.r1.profit, r.r2.units, r.r2.revenue, r.r2.profit, r.unitChange, r.unitPct, r.revenueChange, r.profitChange, r.daysAvailable, r.daysIncReserve]));
  load();
};

// ---------------- inventory ----------------
PAGES.inventory = async (el, params) => {
  const d = await GET("/inventory");
  const s = d.settings;
  let f = params.get("f") || "all", term = "", brand = "";
  el.innerHTML = header("FBA inventory status", `Live from Amazon · updated ${ago(d.syncedAt)}`, `<button id="set">Settings / rules</button><button id="csv">Export CSV</button>`) + `
    <div class="card"><div class="row between">
      <div class="seg" id="tabs">${[["all", "All inventory"], ["low", "Needs shipping"], ["oos", "Out of stock"], ["inactive", "Inactive"], ["discontinued", "Discontinued"], ["direct", "Direct to FBA list"]].map(([k, l]) => `<button data-f="${k}" class="${k === f ? "on" : ""}">${l} <span class="faint" data-c="${k}"></span></button>`).join("")}</div>
      <div class="row"><select id="brand"><option value="">All brands</option><option value="1">Mr Miracle</option><option value="0">Other</option></select><input id="q" placeholder="Search SKU, ASIN, title" style="width:220px"></div>
    </div>
    <div class="small muted" style="margin-top:10px">Rules: min ${s.minDays} days · alert above ${s.maxAlert} days · fill to ${s.maxDays} days · send ${s.daysToSend} days · forecast ${s.forecastDays} days ahead · ${s.includeShipmentCreated ? "includes" : "excludes"} “shipment created”. Average 30-day sales = higher of last-30 and (L7×4 + L14×2 + L30)/3, same as your sheet.</div></div>
    <div class="card flush" id="tbl"></div>`;
  const count = (k) => d.rows.filter((r) => match(r, k)).length;
  const match = (r, k) => k === "all" ? !r.discontinued : k === "low" ? r.state === "low" && r.toShip > 0 : k === "oos" ? r.state === "oos" && !r.discontinued : k === "inactive" ? r.state === "inactive" : k === "discontinued" ? r.discontinued : k === "direct" ? r.directFba && !r.discontinued : true;
  $$("[data-c]").forEach((x) => x.textContent = count(x.dataset.c));
  const dayCls = (v) => v === null ? "" : v <= s.minDays ? "bad" : v <= s.maxAlert ? "warn" : "good";
  const save = async (sku, patch) => { try { await api("PATCH", "/products", { sku, ...patch }); toast("Saved"); } catch (e) { toast(e.message, true); } };
  const draw = () => {
    let rows = d.rows.filter((r) => match(r, f));
    if (brand) rows = rows.filter((r) => String(r.mrm) === brand);
    if (term) rows = rows.filter((r) => (r.sku + r.asin + r.title + r.fnsku).toLowerCase().includes(term));
    table($("#tbl"), [
      { k: "sku", l: "Product", f: (r) => prodCell(r), cls: "prod", sticky: 1 },
      { k: "total", l: "Total in FBA", n: 1, f: (r) => `<b>${fmtN(r.total)}</b>` },
      { k: "fulfillable", l: "Sellable", n: 1, f: (r) => fmtN(r.fulfillable) },
      { k: "reserved", l: "Reserved", n: 1, f: (r) => fmtN(r.reserved) },
      { k: "shipped", l: "Shipped", n: 1, f: (r) => fmtN(r.shipped) },
      { k: "receiving", l: "Receiving", n: 1, f: (r) => fmtN(r.receiving) },
      { k: "unfulfillable", l: "Unfulfillable", n: 1, f: (r) => fmtN(r.unfulfillable) },
      { k: "shipmentCreated", l: "Shipment created", n: 1, f: (r) => fmtN(r.shipmentCreated) },
      { k: "fcTransfer", l: "FC transfer", n: 1, f: (r) => fmtN(r.fcTransfer) },
      { k: "errors", l: "Errors", n: 1, f: (r) => canEdit() ? `<input class="w-num" style="width:60px" type="number" data-err="${esc(r.sku)}" value="${r.errors || 0}">` : fmtN(r.errors) },
      { k: "l7", l: "Sold 7d", n: 1, f: (r) => fmtN(r.l7) },
      { k: "l14", l: "14d", n: 1, f: (r) => fmtN(r.l14) },
      { k: "l30", l: "30d", n: 1, f: (r) => fmtN(r.l30) },
      { k: "avg30", l: "Avg 30d", n: 1, f: (r) => fmtN(r.avg30) },
      { k: "daysSellable", l: "Days sellable", n: 1, f: (r) => `<span class="${dayCls(r.daysSellable)}">${fmtN(r.daysSellable)}</span>` },
      { k: "daysReserve", l: "Days inc. reserve", n: 1, f: (r) => `<span class="${dayCls(r.daysReserve)}">${fmtN(r.daysReserve)}</span>` },
      { k: "daysShipped", l: "Days inc. shipped", n: 1, f: (r) => `<b class="${dayCls(r.daysShipped)}">${fmtN(r.daysShipped)}</b>` },
      { k: "toShip", l: "Qty to ship", n: 1, f: (r) => r.toShip ? `<b>${fmtN(r.toShip)}</b>` : `<span class="faint">–</span>` },
      { k: "buyBox", l: "Buy Box", f: (r) => r.buyBox ? `<span class="badge ${r.buyBox === "won" ? "good" : "bad"}">${r.buyBox}</span>` : `<span class="faint">—</span>` },
      { k: "unitProfit", l: "Profit/unit", n: 1, f: (r) => `<span class="${signCls(r.unitProfit)}">${fmt$(r.unitProfit)}</span>` },
      { k: "lowInvFee", l: "Low-inv fee", f: (r) => /^y/i.test(r.lowInvFee) ? `<span class="badge warn">Yes</span>` : `<span class="faint">${esc(r.lowInvFee || "—")}</span>` },
      { k: "fnsku", l: "FNSKU", f: (r) => `<span class="mono">${esc(r.fnsku || "")}</span>` },
      { k: "flags", l: "Direct / Disc.", noSort: 1, f: (r) => canEdit() ? `<label class="chk" title="Direct to FBA list"><input type="checkbox" data-dir="${esc(r.sku)}" ${r.directFba ? "checked" : ""}>D</label> <label class="chk" title="Discontinued"><input type="checkbox" data-disc="${esc(r.sku)}" ${r.discontinued ? "checked" : ""}>X</label>` : "" },
    ], rows, {
      sort: f === "low" ? "toShip" : "l30", empty: "No products here.",
      after: (tEl) => {
        $$("[data-err]", tEl).forEach((i) => i.onchange = () => { const r = d.rows.find((x) => x.sku === i.dataset.err); r.errors = Number(i.value); save(r.sku, { errors: Number(i.value) }); });
        $$("[data-dir]", tEl).forEach((i) => i.onchange = () => { d.rows.find((x) => x.sku === i.dataset.dir).directFba = i.checked; save(i.dataset.dir, { directFba: i.checked }); });
        $$("[data-disc]", tEl).forEach((i) => i.onchange = () => { d.rows.find((x) => x.sku === i.dataset.disc).discontinued = i.checked; save(i.dataset.disc, { discontinued: i.checked }); });
      },
    });
  };
  $$("#tabs button").forEach((b) => b.onclick = () => { f = b.dataset.f; $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
  $("#q").oninput = debounce(() => { term = $("#q").value.toLowerCase(); draw(); }, 150);
  $("#brand").onchange = () => { brand = $("#brand").value; draw(); };
  $("#csv").onclick = () => downloadCsv("fba-inventory.csv",
    ["ASIN", "SKU", "Total", "Sellable", "Reserved", "Shipped", "Receiving", "Unfulfillable", "Shipment created", "FC transfer", "Errors", "Sold 7d", "Sold 14d", "Sold 30d", "Avg 30d", "Days sellable", "Days inc reserve", "Days inc shipped", "Qty to ship", "Buy Box", "Profit/unit", "Low inv fee", "Title", "FNSKU"],
    d.rows.filter((r) => match(r, f)).map((r) => [r.asin, r.sku, r.total, r.fulfillable, r.reserved, r.shipped, r.receiving, r.unfulfillable, r.shipmentCreated, r.fcTransfer, r.errors, r.l7, r.l14, r.l30, r.avg30, r.daysSellable, r.daysReserve, r.daysShipped, r.toShip, r.buyBox, r.unitProfit, r.lowInvFee, r.title, r.fnsku]));
  $("#set").onclick = () => {
    const m = modal(`<h2>Inventory rules</h2><div class="form-grid">
      <label class="f">Minimum days<input type="number" id="s-min" value="${s.minDays}"></label>
      <label class="f">Maximum alert (days)<input type="number" id="s-alert" value="${s.maxAlert}"></label>
      <label class="f">Maximum days (fill to)<input type="number" id="s-max" value="${s.maxDays}"></label>
      <label class="f">Days of inventory to send<input type="number" id="s-send" value="${s.daysToSend}"></label>
      <label class="f">Days ahead to forecast<input type="number" id="s-fc" value="${s.forecastDays}"></label>
      <label class="chk"><input type="checkbox" id="s-inc" ${s.includeShipmentCreated ? "checked" : ""}> Include “shipment created”</label></div>
      <p class="small muted">Qty to ship: if days-including-shipped is above the alert → nothing; above minimum → avg/day × days to send; otherwise → avg/day × (maximum days − days-including-shipped).</p>
      <div class="foot"><button data-close>Cancel</button><button class="primary" id="s-save" ${canEdit() ? "" : "disabled"}>Save</button></div>`);
    $("#s-save", m.el).onclick = async () => {
      await api("PUT", "/inventory/settings", { minDays: $("#s-min", m.el).value, maxAlert: $("#s-alert", m.el).value, maxDays: $("#s-max", m.el).value, daysToSend: $("#s-send", m.el).value, forecastDays: $("#s-fc", m.el).value, includeShipmentCreated: $("#s-inc", m.el).checked });
      m.close(); toast("Saved"); route();
    };
  };
  draw();
};

// ---------------- repricer ----------------
const STRATS = { match_bb: "Match the Buy Box", beat_bb: "Beat the Buy Box", beat_lowest_fba: "Beat the lowest FBA offer", beat_lowest: "Beat the lowest offer" };
PAGES.repricer = async (el) => {
  const d = await GET("/repricer");
  const st = d.settings;
  let tab = "skus", term = "", only = "";
  el.innerHTML = header("Repricer", "Non–Mr Miracle products · checks every 15 minutes and reprices to win the Buy Box within your min/max",
    canEdit() ? `<button id="run">Run now</button>` : "") + `
    <div class="card"><div class="row between">
      <div class="row">
        <label class="chk"><input type="checkbox" id="en" ${st.enabled ? "checked" : ""} ${canEdit() ? "" : "disabled"}> <b>Repricer on</b></label>
        <label class="chk"><input type="checkbox" id="dry" ${st.dryRun ? "checked" : ""} ${canEdit() ? "" : "disabled"}> Test mode (log only, don't change prices)</label>
      </div>
      <div class="small muted">Last run ${ago(d.lastRun?.last_run)} ${d.lastRun?.info ? "· " + esc(d.lastRun.info) : ""}</div>
    </div>
    ${!st.enabled ? `<div class="banner warn" style="margin:12px 0 0"><div class="txt">The repricer is off. Set rules and min/max prices, check the log in test mode, then turn it on.</div></div>` : st.dryRun ? `<div class="banner info" style="margin:12px 0 0"><div class="txt">Test mode: the repricer logs what it would do but doesn't change any prices.</div></div>` : ""}</div>
    <div class="tabs"><button data-t="skus" class="on">Products (${d.skus.length})</button><button data-t="rules">Rules (${d.rules.length})</button><button data-t="log">Activity log</button></div>
    <div id="body"></div>`;
  const saveSettings = async () => { await api("PUT", "/repricer/settings", { enabled: $("#en").checked, dryRun: $("#dry").checked }); toast("Repricer settings saved"); route(); };
  if (canEdit()) { $("#en").onchange = saveSettings; $("#dry").onchange = saveSettings; $("#run").onclick = async () => { await api("POST", "/repricer/run"); toast("Repricer started — results appear in the log in a minute or two."); }; }
  $$(".tabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
  const ruleName = (id) => d.rules.find((r) => r.id === id)?.name || "";
  const draw = () => {
    const body = $("#body");
    if (tab === "skus") {
      body.innerHTML = `<div class="card"><div class="row between">
        <div class="row"><input id="q" placeholder="Search" value="${esc(term)}" style="width:200px">
          <select id="only"><option value="">All</option><option value="on" ${only === "on" ? "selected" : ""}>Repricing on</option><option value="off" ${only === "off" ? "selected" : ""}>Not repricing</option><option value="lost" ${only === "lost" ? "selected" : ""}>Buy Box lost</option><option value="stock" ${only === "stock" ? "selected" : ""}>In stock</option></select></div>
        ${canEdit() ? `<div class="row"><span class="small muted" id="selc">0 selected</span><button id="bulk">Bulk edit selected</button><button class="primary" id="save">Save changes</button></div>` : ""}
        </div></div><div class="card flush" id="t"></div>`;
      let rows = d.skus;
      if (term) rows = rows.filter((r) => (r.sku + r.asin + r.title).toLowerCase().includes(term));
      if (only === "on") rows = rows.filter((r) => r.enabled); if (only === "off") rows = rows.filter((r) => !r.enabled);
      if (only === "lost") rows = rows.filter((r) => r.offers_at && !r.we_have_bb); if (only === "stock") rows = rows.filter((r) => r.fulfillable > 0);
      const ruleOpts = (sel) => `<option value="">— rule —</option>` + d.rules.map((r) => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>${esc(r.name)}</option>`).join("");
      table($("#t"), [
        { k: "sel", l: canEdit() ? `<input type="checkbox" id="all">` : "", noSort: 1, f: (r) => canEdit() ? `<input type="checkbox" data-sel="${esc(r.sku)}">` : "" },
        { k: "sku", l: "Product", f: prodCell, cls: "prod" },
        { k: "fulfillable", l: "Stock", n: 1, f: (r) => fmtN(r.fulfillable) },
        { k: "units30", l: "Sold 30d", n: 1, f: (r) => fmtN(r.units30) },
        { k: "price", l: "Our price", n: 1, f: (r) => fmt$(r.our_price ?? r.price) },
        { k: "bb_price", l: "Buy Box", n: 1, f: (r) => r.offers_at ? `${fmt$(r.bb_price)} <span class="badge ${r.we_have_bb ? "good" : "bad"}">${r.we_have_bb ? "ours" : "lost"}</span>` : `<span class="faint">not checked</span>` },
        { k: "lowest_fba", l: "Lowest FBA", n: 1, f: (r) => fmt$(r.lowest_fba) },
        { k: "sellers", l: "Sellers", n: 1, f: (r) => fmtN(r.sellers) },
        { k: "rule_id", l: "Rule", f: (r) => canEdit() ? `<select data-rule="${esc(r.sku)}">${ruleOpts(r.rule_id)}</select>` : esc(ruleName(r.rule_id)) },
        { k: "min_price", l: "Min", n: 1, f: (r) => canEdit() ? `<input class="w-num" type="number" step="0.01" data-min="${esc(r.sku)}" value="${r.min_price ?? ""}">` : fmt$(r.min_price) },
        { k: "max_price", l: "Max", n: 1, f: (r) => canEdit() ? `<input class="w-num" type="number" step="0.01" data-max="${esc(r.sku)}" value="${r.max_price ?? ""}">` : fmt$(r.max_price) },
        { k: "enabled", l: "On", f: (r) => canEdit() ? `<input type="checkbox" data-en="${esc(r.sku)}" ${r.enabled ? "checked" : ""}>` : r.enabled ? "✓" : "" },
        { k: "last_action", l: "Last action", f: (r) => `<div class="small" style="max-width:280px">${esc(r.last_action || "")}</div><div class="small faint">${r.last_run ? ago(r.last_run) : ""}</div>` },
      ], rows, {
        sort: "units30", after: (tEl) => {
          const upd = () => $("#selc") && ($("#selc").textContent = $$("[data-sel]:checked").length + " selected");
          $$("[data-sel]", tEl).forEach((c) => c.onchange = upd);
          const all = $("#all", tEl); if (all) all.onchange = () => { $$("[data-sel]", tEl).forEach((c) => c.checked = all.checked); upd(); };
          const mark = (sku, k, v) => { const r = d.skus.find((x) => x.sku === sku); r[k] = v; r._dirty = true; };
          $$("[data-rule]", tEl).forEach((x) => x.onchange = () => mark(x.dataset.rule, "rule_id", x.value ? Number(x.value) : null));
          $$("[data-min]", tEl).forEach((x) => x.onchange = () => mark(x.dataset.min, "min_price", x.value === "" ? null : Number(x.value)));
          $$("[data-max]", tEl).forEach((x) => x.onchange = () => mark(x.dataset.max, "max_price", x.value === "" ? null : Number(x.value)));
          $$("[data-en]", tEl).forEach((x) => x.onchange = () => mark(x.dataset.en, "enabled", x.checked ? 1 : 0));
        },
      });
      $("#q").oninput = debounce(() => { term = $("#q").value.toLowerCase(); draw(); setTimeout(() => { const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300);
      $("#only").onchange = () => { only = $("#only").value; draw(); };
      if (!canEdit()) return;
      $("#save").onclick = async () => {
        const items = d.skus.filter((r) => r._dirty).map((r) => ({ sku: r.sku, ruleId: r.rule_id, min: r.min_price, max: r.max_price, enabled: !!r.enabled }));
        if (!items.length) return toast("No changes to save.");
        try { await api("PUT", "/repricer/skus", { items }); d.skus.forEach((r) => delete r._dirty); toast(`Saved ${items.length} products`); }
        catch (e) { toast(e.message, true); }
      };
      $("#bulk").onclick = () => {
        const sel = $$("[data-sel]:checked").map((c) => c.dataset.sel);
        if (!sel.length) return toast("Select products first (checkboxes on the left).", true);
        const m = modal(`<h2>Bulk edit ${sel.length} products</h2><div class="form-grid">
          <label class="f">Rule<select id="b-rule"><option value="keep">Keep current</option>${d.rules.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></label>
          <label class="f">Min price<select id="b-mint"><option value="keep">Keep</option><option value="$">Set to $</option><option value="%">% of current price</option></select></label>
          <label class="f">&nbsp;<input type="number" step="0.01" id="b-minv" placeholder="e.g. 85"></label>
          <label class="f">Max price<select id="b-maxt"><option value="keep">Keep</option><option value="$">Set to $</option><option value="%">% of current price</option></select></label>
          <label class="f">&nbsp;<input type="number" step="0.01" id="b-maxv" placeholder="e.g. 130"></label>
          <label class="f">Repricing<select id="b-en"><option value="keep">Keep</option><option value="1">Turn on</option><option value="0">Turn off</option></select></label></div>
          <div class="foot"><button data-close>Cancel</button><button class="primary" id="b-ok">Apply</button></div>`);
        $("#b-ok", m.el).onclick = async () => {
          const items = sel.map((sku) => {
            const r = d.skus.find((x) => x.sku === sku), cur = r.our_price ?? r.price;
            const v = (t, val, keep) => t === "keep" ? keep : t === "$" ? Number(val) : cur ? Math.round(cur * Number(val)) / 100 : keep;
            const it = { sku, ruleId: $("#b-rule", m.el).value === "keep" ? r.rule_id : Number($("#b-rule", m.el).value),
              min: v($("#b-mint", m.el).value, $("#b-minv", m.el).value, r.min_price), max: v($("#b-maxt", m.el).value, $("#b-maxv", m.el).value, r.max_price),
              enabled: $("#b-en", m.el).value === "keep" ? !!r.enabled : $("#b-en", m.el).value === "1" };
            return it;
          });
          try { await api("PUT", "/repricer/skus", { items }); m.close(); toast(`Updated ${items.length} products`); route(); }
          catch (e) { toast(e.message, true); }
        };
      };
    } else if (tab === "rules") {
      body.innerHTML = `<div class="card"><div class="row between"><div class="muted small">Rules decide the target price. Every product still stays between its own min and max.</div>${canEdit() ? `<button class="primary" id="newr">New rule</button>` : ""}</div></div><div class="card flush" id="t"></div>`;
      table($("#t"), [
        { k: "name", l: "Rule", f: (r) => `<b>${esc(r.name)}</b>` },
        { k: "strategy", l: "Target", f: (r) => `${STRATS[r.strategy]}${r.amount ? ` by ${r.amountType === "$" ? "$" + r.amount : r.amount + "%"}` : ""}` },
        { k: "f", l: "Ignore", f: (r) => [r.ignoreFbm && "FBM sellers", r.ignoreAmazon && "Amazon", r.minFeedbackPct && `<${r.minFeedbackPct}% feedback`, r.minFeedbackCount && `<${r.minFeedbackCount} ratings`].filter(Boolean).join(", ") || "—", noSort: 1 },
        { k: "w", l: "When we own the Buy Box", f: (r) => r.whenWinning === "raise" ? "Raise toward next competitor" : "Hold price", noSort: 1 },
        { k: "c", l: "No competition", f: (r) => r.noCompetition === "max" ? "Go to max" : "Hold", noSort: 1 },
        { k: "m", l: "Below min", f: (r) => r.belowMin === "min" ? "Sit at min" : "Hold price", noSort: 1 },
        { k: "used", l: "Products", n: 1, f: (r) => fmtN(d.skus.filter((s) => s.rule_id === r.id).length), noSort: 1 },
        { k: "e", l: "", noSort: 1, f: (r) => canEdit() ? `<button class="sm" data-edit="${r.id}">Edit</button> <button class="sm danger" data-del="${r.id}">Delete</button>` : "" },
      ], d.rules, { tall: false });
      if (!canEdit()) return;
      $("#newr").onclick = () => ruleEditor({});
      $$("[data-edit]").forEach((b) => b.onclick = () => ruleEditor(d.rules.find((r) => r.id === Number(b.dataset.edit))));
      $$("[data-del]").forEach((b) => b.onclick = async () => {
        if (!await confirmBox("Delete rule?", "Products using it will stop repricing until you pick another rule.", "Delete")) return;
        await api("DELETE", "/repricer/rules/" + b.dataset.del); route();
      });
    } else {
      body.innerHTML = `<div class="card flush" id="t"></div>`;
      table($("#t"), [
        { k: "ts", l: "When", f: (r) => dt(r.ts) },
        { k: "sku", l: "SKU", f: (r) => `<b class="mono">${esc(r.sku)}</b><div class="small">${esc(r.asin)}</div>` },
        { k: "old_price", l: "Price", n: 1, f: (r) => `${fmt$(r.old_price)} → <b>${fmt$(r.new_price)}</b>` },
        { k: "bb_price", l: "Buy Box", n: 1, f: (r) => `${fmt$(r.bb_price)} ${r.we_had_bb ? '<span class="badge good">ours</span>' : ""}` },
        { k: "reason", l: "Why", f: (r) => `<span class="small">${esc(r.reason)}</span>` },
        { k: "status", l: "Status", f: (r) => `<span class="badge ${r.status === "applied" ? "good" : r.status === "error" ? "bad" : r.status === "dry-run" ? "info" : ""}">${esc(r.status)}</span>` },
      ], d.log, { sort: "ts", empty: "No repricing activity yet." });
    }
  };
  const ruleEditor = (r) => {
    const m = modal(`<h2>${r.id ? "Edit rule" : "New rule"}</h2><div class="form-grid">
      <label class="f" style="grid-column:1/-1">Name<input id="r-name" value="${esc(r.name || "")}" placeholder="e.g. Beat FBA by 5 cents"></label>
      <label class="f">Target<select id="r-strat">${Object.entries(STRATS).map(([k, l]) => `<option value="${k}" ${r.strategy === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">By<input type="number" step="0.01" id="r-amt" value="${r.amount ?? 0.01}"></label>
      <label class="f">Unit<select id="r-unit"><option value="$" ${r.amountType !== "%" ? "selected" : ""}>$</option><option value="%" ${r.amountType === "%" ? "selected" : ""}>%</option></select></label>
      <label class="f">When we own the Buy Box<select id="r-win"><option value="raise">Raise toward next competitor</option><option value="hold" ${r.whenWinning === "hold" ? "selected" : ""}>Hold price</option></select></label>
      <label class="f">If nobody else is selling<select id="r-nc"><option value="max">Go to max price</option><option value="hold" ${r.noCompetition === "hold" ? "selected" : ""}>Hold price</option></select></label>
      <label class="f">If target is below min<select id="r-bm"><option value="min">Sit at min price</option><option value="hold" ${r.belowMin === "hold" ? "selected" : ""}>Hold current price</option></select></label>
      <label class="f">Ignore sellers under % positive<input type="number" id="r-fbp" value="${r.minFeedbackPct || 0}"></label>
      <label class="f">Ignore sellers with fewer ratings than<input type="number" id="r-fbc" value="${r.minFeedbackCount || 0}"></label>
      <label class="chk"><input type="checkbox" id="r-fbm" ${r.ignoreFbm !== false ? "checked" : ""}> Ignore FBM (merchant-fulfilled) sellers</label>
      <label class="chk"><input type="checkbox" id="r-amz" ${r.ignoreAmazon ? "checked" : ""}> Ignore Amazon itself</label></div>
      <div class="foot"><button data-close>Cancel</button><button class="primary" id="r-save">Save rule</button></div>`);
    $("#r-save", m.el).onclick = async () => {
      try {
        await api("POST", "/repricer/rules", { id: r.id, name: $("#r-name", m.el).value, strategy: $("#r-strat", m.el).value, amount: $("#r-amt", m.el).value, amountType: $("#r-unit", m.el).value,
          whenWinning: $("#r-win", m.el).value, noCompetition: $("#r-nc", m.el).value, belowMin: $("#r-bm", m.el).value, minFeedbackPct: $("#r-fbp", m.el).value,
          minFeedbackCount: $("#r-fbc", m.el).value, ignoreFbm: $("#r-fbm", m.el).checked, ignoreAmazon: $("#r-amz", m.el).checked });
        m.close(); toast("Rule saved"); route();
      } catch (e) { toast(e.message, true); }
    };
  };
  draw();
};

// ---------------- Mr Miracle pricing (manual / bulk) ----------------
PAGES.pricing = async (el, params) => {
  let scope = params.get("scope") || "mrm";
  el.innerHTML = header("Mr Miracle pricing", "Change prices by hand — one product or many at once. No repricing rules apply here.") + `
    <div class="card"><div class="row between">
      <div class="row"><div class="seg" id="scope">${[["mrm", "Mr Miracle"], ["non_mrm", "Other products"], ["all", "All"]].map(([k, l]) => `<button data-s="${k}" class="${k === scope ? "on" : ""}">${l}</button>`).join("")}</div>
        <input id="q" placeholder="Search" style="width:200px"></div>
      ${canEdit() ? `<div class="row"><button id="bulk">Bulk change selected</button><button id="paste">Paste SKU,price list</button><button id="clear">Clear</button><button class="primary" id="push">Review & push</button></div>` : ""}
    </div><div class="small muted" style="margin-top:8px">Type a new price in the “New price” column, or select rows and use bulk change. Nothing changes on Amazon until you review and push.</div></div>
    <div class="card flush" id="t"></div>
    <div class="card flush"><div class="card-h"><h2>Recent price pushes</h2><button class="sm" id="rq">Refresh</button></div><div id="queue"></div></div>`;
  let rows = await GET("/pricing?scope=" + scope), term = "";
  const pending = new Map();
  const profit = (r, p) => {
    if (!p || r.cogs === null || r.cogs === undefined) return null;
    const ref = r.fee_price && r.referral_fee !== null ? r.referral_fee / r.fee_price : 0.15;
    return p - p * ref - (r.fulfil_fee || 0) - r.cogs;
  };
  const draw = () => {
    let data = rows;
    if (term) data = data.filter((r) => (r.sku + r.asin + r.title).toLowerCase().includes(term));
    table($("#t"), [
      { k: "sel", l: canEdit() ? `<input type="checkbox" id="all">` : "", noSort: 1, f: (r) => canEdit() ? `<input type="checkbox" data-sel="${esc(r.sku)}">` : "" },
      { k: "sku", l: "Product", f: prodCell, cls: "prod" },
      { k: "fulfillable", l: "Stock", n: 1, f: (r) => fmtN(r.fulfillable) },
      { k: "units7", l: "Sold 7d", n: 1, f: (r) => fmtN(r.units7) },
      { k: "units30", l: "Sold 30d", n: 1, f: (r) => fmtN(r.units30) },
      { k: "bb_price", l: "Buy Box", n: 1, f: (r) => r.bb_price ? `${fmt$(r.bb_price)} ${r.we_have_bb ? '<span class="badge good">ours</span>' : '<span class="badge bad">lost</span>'}` : `<span class="faint">—</span>` },
      { k: "price", l: "Current price", n: 1, f: (r) => `<b>${fmt$(r.price)}</b>` },
      { k: "profit", l: "Profit/unit now", n: 1, f: (r) => fmt$(profit(r, r.price)), sort: (r) => profit(r, r.price) },
      { k: "new", l: "New price", n: 1, noSort: 1, f: (r) => canEdit() ? `<input class="w-num" type="number" step="0.01" data-p="${esc(r.sku)}" value="${pending.get(r.sku) ?? ""}" placeholder="—">` : "" },
      { k: "chg", l: "Change", n: 1, noSort: 1, f: (r) => { const p = pending.get(r.sku); return p && r.price ? `<span class="${signCls(p - r.price)}" data-chg="${esc(r.sku)}">${fmtPct((p / r.price - 1) * 100)}</span>` : `<span data-chg="${esc(r.sku)}"></span>`; } },
      { k: "np", l: "Profit/unit new", n: 1, noSort: 1, f: (r) => `<span data-np="${esc(r.sku)}">${pending.get(r.sku) ? fmt$(profit(r, pending.get(r.sku))) : ""}</span>` },
      { k: "last_change", l: "Last change", f: (r) => `<span class="small">${r.last_change ? ago(r.last_change) : "—"}</span>${r.queue_status === "pending" ? ' <span class="badge info">pending</span>' : r.queue_status === "error" ? ' <span class="badge bad">error</span>' : ""}` },
      { k: "a", l: "", noSort: 1, f: (r) => `<a class="small" href="#/price?ids=${encodeURIComponent(r.asin)}">History</a>` },
    ], data, {
      sort: "units30", after: (tEl) => {
        const all = $("#all", tEl); if (all) all.onchange = () => $$("[data-sel]", tEl).forEach((c) => c.checked = all.checked);
        $$("[data-p]", tEl).forEach((i) => i.oninput = () => {
          const r = rows.find((x) => x.sku === i.dataset.p), v = Number(i.value);
          if (i.value === "" || !(v > 0)) pending.delete(r.sku); else pending.set(r.sku, Math.round(v * 100) / 100);
          const p = pending.get(r.sku);
          $(`[data-chg="${CSS.escape(r.sku)}"]`, tEl).outerHTML = p && r.price ? `<span class="${signCls(p - r.price)}" data-chg="${esc(r.sku)}">${fmtPct((p / r.price - 1) * 100)}</span>` : `<span data-chg="${esc(r.sku)}"></span>`;
          $(`[data-np="${CSS.escape(r.sku)}"]`, tEl).textContent = p ? fmt$(profit(r, p)) : "";
        });
      },
    });
  };
  const loadQueue = async () => {
    const q = await GET("/price-queue");
    table($("#queue"), [
      { k: "created_at", l: "When", f: (r) => dt(r.created_at) },
      { k: "sku", l: "SKU", f: (r) => `<b class="mono">${esc(r.sku)}</b>` },
      { k: "price", l: "Price", n: 1, f: (r) => `${r.old_price ? fmt$(r.old_price) + " → " : ""}<b>${fmt$(r.price)}</b>` },
      { k: "source", l: "Source", f: (r) => `${esc(r.source)} <span class="faint small">${esc(r.user || "")}</span>` },
      { k: "status", l: "Status", f: (r) => `<span class="badge ${r.status === "done" ? "good" : r.status === "error" ? "bad" : r.status === "pending" ? "info" : ""}">${r.status === "done" ? "applied" : esc(r.status)}</span> <span class="small bad">${esc(r.error || "")}</span>` },
    ], q, { sort: "created_at", tall: false, limit: 50, empty: "No price changes pushed yet." });
  };
  $$("#scope button").forEach((b) => b.onclick = async () => { scope = b.dataset.s; $$("#scope button").forEach((x) => x.classList.toggle("on", x === b)); rows = await GET("/pricing?scope=" + scope); draw(); });
  $("#q").oninput = debounce(() => { term = $("#q").value.toLowerCase(); draw(); }, 200);
  $("#rq").onclick = loadQueue;
  if (canEdit()) {
    $("#clear").onclick = () => { pending.clear(); draw(); };
    $("#bulk").onclick = () => {
      const sel = $$("[data-sel]:checked").map((c) => c.dataset.sel);
      if (!sel.length) return toast("Select products first.", true);
      const m = modal(`<h2>Change ${sel.length} prices</h2><div class="form-grid">
        <label class="f">How<select id="bk-t"><option value="set">Set to $</option><option value="add">Raise / lower by $</option><option value="pct">Raise / lower by %</option><option value="bb">Match Buy Box</option></select></label>
        <label class="f">Amount<input type="number" step="0.01" id="bk-v" placeholder="e.g. 19.99, -0.50 or 5"></label>
        <label class="f">Round to<select id="bk-r"><option value="">Cents</option><option value=".99">.99</option><option value=".49">.49 / .99</option></select></label></div>
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="bk-ok">Apply to list</button></div>`);
      $("#bk-ok", m.el).onclick = () => {
        const t = $("#bk-t", m.el).value, v = Number($("#bk-v", m.el).value), rnd = $("#bk-r", m.el).value;
        for (const sku of sel) {
          const r = rows.find((x) => x.sku === sku); if (!r || !r.price) continue;
          let p = t === "set" ? v : t === "add" ? r.price + v : t === "pct" ? r.price * (1 + v / 100) : r.bb_price;
          if (!(p > 0)) continue;
          if (rnd === ".99") p = Math.floor(p) + 0.99;
          else if (rnd === ".49") p = (p - Math.floor(p)) < 0.5 ? Math.floor(p) + 0.49 : Math.floor(p) + 0.99;
          pending.set(sku, Math.round(p * 100) / 100);
        }
        m.close(); draw();
      };
    };
    $("#paste").onclick = () => {
      const m = modal(`<h2>Paste prices</h2><p class="small muted">One per line: <span class="mono">SKU, price</span> (or ASIN, price — applies to all its SKUs). You can paste straight from a spreadsheet.</p>
        <textarea id="ps" rows="10" placeholder="MrM Plates Paper 9in 200pk, 18.99"></textarea>
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="ps-ok">Add to list</button></div>`);
      $("#ps-ok", m.el).onclick = async () => {
        const all = await GET("/pricing?scope=all");
        let n = 0, miss = [];
        for (const line of $("#ps", m.el).value.split(/\n/)) {
          const parts = line.split(/[\t,]/).map((s) => s.trim()).filter(Boolean);
          if (parts.length < 2) continue;
          const price = Number(parts[parts.length - 1].replace(/[$]/g, "")), id = parts.slice(0, -1).join(",");
          if (!(price > 0)) continue;
          const hits = all.filter((r) => r.sku === id || r.asin === id.toUpperCase());
          if (!hits.length) { miss.push(id); continue; }
          hits.forEach((h) => { pending.set(h.sku, Math.round(price * 100) / 100); if (!rows.find((x) => x.sku === h.sku)) rows.push(h); n++; });
        }
        m.close(); draw();
        toast(`Added ${n} prices${miss.length ? ` · not found: ${miss.slice(0, 5).join(", ")}${miss.length > 5 ? "…" : ""}` : ""}`, !!miss.length);
      };
    };
    $("#push").onclick = async () => {
      if (!pending.size) return toast("Enter at least one new price first.", true);
      const items = [...pending.entries()].map(([sku, price]) => ({ sku, price, r: rows.find((x) => x.sku === sku) }));
      const big = items.filter((i) => i.r?.price && Math.abs(i.price / i.r.price - 1) > 0.2);
      const html = `<p>${items.length} price change${items.length === 1 ? "" : "s"} will be sent to Amazon. They go live within about 15 minutes.</p>
        ${big.length ? `<div class="banner warn"><div class="txt">${big.length} change${big.length === 1 ? " is" : "s are"} more than 20% — please double check.</div></div>` : ""}
        <div class="tbl-wrap" style="max-height:340px"><table class="t"><thead><tr><th>SKU</th><th class="n">Now</th><th class="n">New</th><th class="n">Change</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td class="mono">${esc(i.sku)}</td><td class="n">${fmt$(i.r?.price)}</td><td class="n"><b>${fmt$(i.price)}</b></td><td class="n ${signCls(i.price - (i.r?.price || 0))}">${i.r?.price ? fmtPct((i.price / i.r.price - 1) * 100) : ""}</td></tr>`).join("")}</tbody></table></div>`;
      if (!await confirmBox("Push price changes to Amazon?", html, `Push ${items.length} change${items.length === 1 ? "" : "s"}`)) return;
      try { await api("POST", "/prices", { items: items.map(({ sku, price }) => ({ sku, price })) }); pending.clear(); toast("Queued — watch “Recent price pushes” below."); draw(); loadQueue(); }
      catch (e) { toast(e.message, true); }
    };
  }
  draw(); loadQueue();
};

// ---------------- fees ----------------
const CAT = { dimensions: ["Dimensions changed", "warn"], low_inventory: ["Low-inventory fee", "bad"], rate: ["Fee rate change", "info"], price_band: ["Price band", ""] };
PAGES.fees = async (el) => {
  const to0 = todayLA();
  let from = addDays(to0, -6), to = to0, cat = "";
  el.innerHTML = header("FBA fee changes", "Daily check of fulfillment fees, dimensions and low-inventory-level fees", `<button id="em">Email report settings</button>${canEdit() ? `<button id="rc">Re-check now</button>` : ""}`) + `<div id="body"><div class="loading"><span class="spinner"></span></div></div>`;
  const load = async () => {
    const d = await GET("/fees" + qs({ from, to }));
    const counts = Object.fromEntries(Object.keys(CAT).map((k) => [k, d.changes.filter((c) => c.category === k).length]));
    const list = cat ? d.changes.filter((c) => c.category === cat) : d.changes;
    $("#body").innerHTML = `${d.snapshotCount < 2 ? `<div class="banner info"><div class="txt">Fee tracking started ${d.lastSnapshot ? dayFmt(d.lastSnapshot) : "today"}. Amazon's fee report is saved once a day, and changes appear from the second day on.</div></div>` : ""}
      <div class="card"><div class="filters"><div class="row" id="rng"></div>
        <div class="seg" id="cats"><button data-c="" class="${!cat ? "on" : ""}">All (${d.changes.length})</button>${Object.entries(CAT).map(([k, [l]]) => `<button data-c="${k}" class="${cat === k ? "on" : ""}">${l} (${counts[k]})</button>`).join("")}</div></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>Changes per day — last 30 days</h2></div><div class="chart-box sm"><canvas id="c"></canvas></div></div>
        <div class="card"><div class="card-h"><h2>Paying the low-inventory-level fee now</h2><span class="badge warn">${d.lowInv.length} SKUs</span></div>
          <div class="tbl-wrap" style="max-height:200px"><table class="t"><thead><tr><th>SKU</th><th class="n">Hist. days of supply</th><th class="n">Min level</th><th>Health</th></tr></thead><tbody>
          ${d.lowInv.map((r) => `<tr><td><b class="mono">${esc(r.sku)}</b> <span class="small faint">${esc(r.asin)}</span></td><td class="n">${fmtN(r.hist_dos)}</td><td class="n">${fmtN(r.min_level)}</td><td class="small">${esc(r.health)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">None this week 🎉</td></tr>`}</tbody></table></div></div>
      </div>
      <div class="card flush"><div class="card-h"><h2>Fee changes ${dayFmt(from)} – ${dayFmt(to)}</h2><button class="sm" id="csv">Export CSV</button></div><div id="t"></div></div>`;
    const r = rangeCtl($("#rng"), "custom", (f, t) => { from = f; to = t; load(); });
    r.set(from, to);
    $$("#cats button").forEach((b) => b.onclick = () => { cat = b.dataset.c; load(); });
    const days = [...new Set(d.daily.map((x) => x.day))];
    const C = COLORS();
    chart($("#c"), { type: "bar", data: { labels: days.map(dayShort), datasets: Object.keys(CAT).map((k, i) => ({ label: CAT[k][0], data: days.map((dd) => d.daily.find((x) => x.day === dd && x.category === k)?.n || 0), backgroundColor: C[i] })) },
      options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }, plugins: { legend: { position: "bottom" } } } });
    table($("#t"), [
      { k: "day", l: "Date", f: (c) => dayFmt(c.day) },
      { k: "sku", l: "Product", f: (c) => prodCell(c), cls: "prod" },
      { k: "category", l: "Type", f: (c) => `<span class="badge ${CAT[c.category]?.[1] || ""}">${CAT[c.category]?.[0] || c.category}</span>` },
      { k: "dims", l: "Old → new dimensions", noSort: 1, f: (c) => c.category === "dimensions" ? `<div class="small faint">${esc(c.old_dims)}</div><div class="small"><b>${esc(c.new_dims)}</b></div>${c.old_tier !== c.new_tier ? `<div class="small warn">${esc(c.old_tier)} → ${esc(c.new_tier)}</div>` : ""}` : `<span class="small">${esc(c.note)}</span>` },
      { k: "fee", l: "Fulfillment fee", n: 1, f: (c) => c.category === "low_inventory" ? "—" : `${fmt$(c.old_fee)} → <b>${fmt$(c.new_fee)}</b>`, sort: (c) => c.new_fee },
      { k: "delta", l: "Change/unit", n: 1, f: (c) => { const v = (c.new_fee ?? 0) - (c.old_fee ?? 0); return c.category === "low_inventory" ? "" : `<b class="${signCls(v, true)}">${v > 0 ? "+" : ""}${fmt$(v)}</b>`; }, sort: (c) => (c.new_fee ?? 0) - (c.old_fee ?? 0) },
      { k: "units30", l: "Units 30d", n: 1, f: (c) => fmtN(c.units30) },
      { k: "monthly", l: "Monthly impact", n: 1, f: (c) => c.category === "low_inventory" ? "" : (() => { const v = ((c.new_fee ?? 0) - (c.old_fee ?? 0)) * (c.units30 || 0); return `<span class="${signCls(v, true)}">${fmt$0(v)}</span>`; })(), sort: (c) => ((c.new_fee ?? 0) - (c.old_fee ?? 0)) * (c.units30 || 0) },
      { k: "price", l: "Price", n: 1, f: (c) => c.old_price !== c.new_price ? `${fmt$(c.old_price)} → ${fmt$(c.new_price)}` : fmt$(c.new_price) },
      { k: "h", l: "", noSort: 1, f: (c) => `<button class="sm" data-h="${esc(c.sku)}">History</button>` },
    ], list, {
      sort: "monthly", empty: "No fee changes in this period.", after: (tEl) => $$("[data-h]", tEl).forEach((b) => b.onclick = () => feeHistory(b.dataset.h)),
    });
    $("#csv").onclick = () => downloadCsv("fee-changes.csv", ["Date", "SKU", "ASIN", "Type", "Old dims", "New dims", "Old tier", "New tier", "Old fee", "New fee", "Units 30d", "Note"],
      list.map((c) => [c.day, c.sku, c.asin, c.category, c.old_dims, c.new_dims, c.old_tier, c.new_tier, c.old_fee, c.new_fee, c.units30, c.note]));
    $("#em").onclick = () => feeEmailSettings(d.email);
  };
  const feeHistory = async (sku) => {
    const h = await GET("/fees/history?sku=" + encodeURIComponent(sku));
    modal(`<h2>Fee history — ${esc(sku)}</h2><div class="tbl-wrap" style="max-height:60vh"><table class="t"><thead><tr><th>Day</th><th class="n">Price</th><th class="n">Fulfillment fee</th><th class="n">Referral</th><th>Dimensions</th><th>Tier</th><th>Low-inv fee</th></tr></thead><tbody>
      ${h.map((r) => `<tr><td>${dayFmt(r.day)}</td><td class="n">${fmt$(r.price)}</td><td class="n"><b>${fmt$(r.fulfil_fee)}</b></td><td class="n">${fmt$(r.referral_fee)}</td><td class="small">${r.longest} × ${r.median} × ${r.shortest} ${esc(r.dim_unit)}, ${r.weight} ${esc(r.weight_unit)}</td><td class="small">${esc(r.size_tier)}</td><td class="small">${esc(r.low_inv || "")}</td></tr>`).join("")}</tbody></table></div>
      <div class="foot"><button data-close>Close</button></div>`, true);
  };
  const feeEmailSettings = (e) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const m = modal(`<h2>Daily fee report email</h2><div class="stack">
      <label class="chk"><input type="checkbox" id="e-on" ${e.enabled ? "checked" : ""}> Send the fee report by email</label>
      <div><div class="small muted" style="margin-bottom:6px">Days to send</div><div class="row">${days.map((dd, i) => `<label class="chk"><input type="checkbox" data-d="${i}" ${e.days.includes(i) ? "checked" : ""}> ${dd}</label>`).join("")}</div></div>
      <div class="form-grid">
        <label class="f">Send at (your time zone)<select id="e-h">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${e.hour === h ? "selected" : ""}>${(h % 12 || 12) + (h < 12 ? " am" : " pm")}</option>`).join("")}</select></label>
        <label class="f">Products<select id="e-p"><option value="all">All products</option><option value="mrm" ${e.products === "mrm" ? "selected" : ""}>Mr Miracle only</option><option value="non_mrm" ${e.products === "non_mrm" ? "selected" : ""}>Non–Mr Miracle only</option></select></label>
        <label class="f">Only fee changes of at least $<input type="number" step="0.01" id="e-min" value="${e.minDelta || 0}"></label></div>
      <div><div class="small muted" style="margin-bottom:6px">Include</div><div class="row">${Object.entries(CAT).map(([k, [l]]) => `<label class="chk"><input type="checkbox" data-cat="${k}" ${e.categories.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}
        <label class="chk"><input type="checkbox" id="e-li" ${e.includeLowInvList ? "checked" : ""}> List of SKUs paying the low-inventory fee</label></div></div>
      <label class="f">Send to (leave empty for the main alert email)<input id="e-to" value="${esc(e.recipients.join(", "))}" placeholder="you@example.com"></label></div>
      <div class="foot"><button id="e-prev">Preview</button><button id="e-send">Send now</button><button data-close>Cancel</button><button class="primary" id="e-save" ${canEdit() ? "" : "disabled"}>Save</button></div>`);
    const payload = () => ({ enabled: $("#e-on", m.el).checked, days: $$("[data-d]:checked", m.el).map((x) => Number(x.dataset.d)), hour: Number($("#e-h", m.el).value),
      categories: $$("[data-cat]:checked", m.el).map((x) => x.dataset.cat), products: $("#e-p", m.el).value, minDelta: $("#e-min", m.el).value,
      includeLowInvList: $("#e-li", m.el).checked, recipients: $("#e-to", m.el).value });
    $("#e-save", m.el).onclick = async () => { await api("PUT", "/fees/email", payload()); toast("Saved"); m.close(); };
    $("#e-prev", m.el).onclick = async () => { if (canEdit()) await api("PUT", "/fees/email", payload()); window.open("/api/fees/email/preview" + qs({ from, to }), "_blank"); };
    $("#e-send", m.el).onclick = async () => { try { if (canEdit()) await api("PUT", "/fees/email", payload()); const r = await api("POST", "/fees/email/send", { from, to }); toast(`Sent (${r.count} changes)`); } catch (err) { toast(err.message, true); } };
  };
  if (canEdit()) $("#rc").onclick = async () => { await api("POST", "/fees/recheck"); toast("Requested fresh fee reports from Amazon — takes a few minutes."); };
  load();
};

// ---------------- sellers ----------------
PAGES.sellers = async (el) => {
  let days = 14;
  el.innerHTML = header("Seller count", "Get an email when the number of sellers on a listing changes", canEdit() ? `<button id="set">Alert settings</button><button class="primary" id="add">Add ASINs</button>` : "") + `<div id="body"><div class="loading"><span class="spinner"></span></div></div>`;
  const load = async () => {
    const d = await GET("/sellers?days=" + days);
    $("#body").innerHTML = `<div class="grid g3" style="margin-bottom:16px">
        <div class="kpi"><div class="l">Listings watched</div><div class="v">${fmtN(d.tracked.length)}</div><div class="s">checked every ${d.settings.intervalMin} min</div></div>
        <div class="kpi"><div class="l">Changes in last ${days} days</div><div class="v">${fmtN(d.events.length)}</div><div class="s">${fmtN(d.events.filter((e) => e.new_count > e.old_count).length)} up · ${fmtN(d.events.filter((e) => e.new_count < e.old_count).length)} down</div></div>
        <div class="kpi"><div class="l">Email alerts</div><div class="v">${d.settings.enabled ? "On" : "Off"}</div><div class="s">${esc((d.settings.recipients || []).join(", ") || "main alert email")}</div></div></div>
      <div class="card flush"><div class="card-h"><h2>Recent changes</h2><select id="days">${[1, 3, 7, 14, 30, 60].map((n) => `<option value="${n}" ${n === days ? "selected" : ""}>Last ${n} day${n > 1 ? "s" : ""}</option>`).join("")}</select></div><div id="ev"></div></div>
      <div class="card flush"><div class="card-h"><h2>Watched listings</h2>${canEdit() ? `<button class="sm danger" id="rm">Stop watching selected</button>` : ""}</div><div id="tr"></div></div>`;
    $("#days").onchange = () => { days = Number($("#days").value); load(); };
    const sl = (id) => `<a class="mono small" target="_blank" rel="noopener" href="https://www.amazon.com/sp?seller=${esc(id)}">${esc(id)}</a>`;
    table($("#ev"), [
      { k: "ts", l: "When", f: (e) => dt(e.ts) },
      { k: "asin", l: "Listing", f: (e) => prodCell({ sku: e.asin, asin: e.asin, title: e.title }), cls: "prod" },
      { k: "chg", l: "Sellers", n: 1, f: (e) => `${e.old_count} → <b>${e.new_count}</b> <span class="${signCls(e.new_count - e.old_count, true)}">(${e.new_count > e.old_count ? "+" : ""}${e.new_count - e.old_count})</span>`, sort: (e) => e.new_count - e.old_count },
      { k: "added", l: "New sellers", f: (e) => JSON.parse(e.added || "[]").map(sl).join("<br>") || "—", noSort: 1 },
      { k: "removed", l: "Left", f: (e) => JSON.parse(e.removed || "[]").map(sl).join("<br>") || "—", noSort: 1 },
      { k: "emailed", l: "Email", f: (e) => e.emailed === 1 ? '<span class="badge good">sent</span>' : e.emailed === 0 ? '<span class="badge info">pending</span>' : e.emailed === 3 ? '<span class="badge bad">failed</span>' : '<span class="badge">off</span>' },
    ], d.events, { sort: "ts", tall: false, limit: 200, empty: "No seller count changes in this period." });
    table($("#tr"), [
      { k: "sel", l: canEdit() ? `<input type="checkbox" id="all">` : "", noSort: 1, f: (t) => canEdit() ? `<input type="checkbox" data-sel="${t.asin}">` : "" },
      { k: "asin", l: "Listing", f: (t) => prodCell({ sku: t.asin, asin: t.asin, title: t.title, image: t.image }), cls: "prod" },
      { k: "sellers", l: "Sellers now", n: 1, f: (t) => t.error ? `<span class="small bad">${esc(t.error)}</span>` : t.sellers === null || t.sellers === undefined ? '<span class="faint">checking…</span>' : `<b>${t.sellers}</b> <span class="small faint">${t.fba} FBA · ${t.fbm} FBM</span>` },
      { k: "bb", l: "Buy Box", f: (t) => t.bb_seller ? (t.we_have_bb ? '<span class="badge good">ours</span>' : sl(t.bb_seller)) + ` ${fmt$(t.bb_price)}` : "—", noSort: 1 },
      { k: "ts", l: "Checked", f: (t) => `<span class="small">${ago(t.ts)}</span>` },
      { k: "last_change", l: "Last change", f: (t) => `<span class="small">${t.last_change ? ago(t.last_change) : "—"}</span>` },
      { k: "x", l: "", noSort: 1, f: (t) => `<button class="sm" data-hist="${t.asin}">Details</button>` },
    ], d.tracked, {
      sort: "last_change", empty: "Not watching any listings yet — click “Add ASINs”.", after: (tEl) => {
        const all = $("#all", tEl); if (all) all.onchange = () => $$("[data-sel]", tEl).forEach((c) => c.checked = all.checked);
        $$("[data-hist]", tEl).forEach((b) => b.onclick = () => detail(b.dataset.hist));
      },
    });
    if (canEdit()) {
      $("#rm").onclick = async () => {
        const asins = $$("[data-sel]:checked").map((c) => c.dataset.sel);
        if (!asins.length) return toast("Select listings first.", true);
        await api("POST", "/sellers/untrack", { asins }); load();
      };
      $("#set").onclick = () => {
        const s = d.settings;
        const m = modal(`<h2>Seller count alerts</h2><div class="stack">
          <label class="chk"><input type="checkbox" id="s-on" ${s.enabled ? "checked" : ""}> Email me when the seller count changes</label>
          <label class="f">Check every<select id="s-int">${[15, 30, 60, 120, 240].map((n) => `<option value="${n}" ${s.intervalMin === n ? "selected" : ""}>${n} minutes</option>`).join("")}</select></label>
          <label class="f">Send to (leave empty for the main alert email)<input id="s-to" value="${esc((s.recipients || []).join(", "))}"></label></div>
          <div class="foot"><button data-close>Cancel</button><button class="primary" id="s-save">Save</button></div>`);
        $("#s-save", m.el).onclick = async () => { await api("PUT", "/sellers/settings", { enabled: $("#s-on", m.el).checked, intervalMin: $("#s-int", m.el).value, recipients: $("#s-to", m.el).value }); m.close(); toast("Saved"); load(); };
      };
    }
  };
  const detail = async (asin) => {
    const [h, o] = await Promise.all([GET("/sellers/history?asin=" + asin), GET("/sellers/offers?asin=" + asin)]);
    const m = modal(`<h2>${esc(asin)} — sellers over time</h2><div class="chart-box sm"><canvas id="sh"></canvas></div>
      <h3 style="margin-top:16px">Current offers</h3><div class="tbl-wrap" style="max-height:300px"><table class="t"><thead><tr><th>Seller</th><th class="n">Price</th><th>Type</th><th class="n">Feedback</th><th>Buy Box</th></tr></thead><tbody>
      ${(o?.offers || []).map((x) => `<tr><td><a class="mono" target="_blank" rel="noopener" href="https://www.amazon.com/sp?seller=${esc(x.sellerId)}">${esc(x.sellerId)}</a></td><td class="n">${fmt$(x.landed)}</td><td>${x.fba ? "FBA" : "FBM"}</td><td class="n">${x.feedbackPct ?? "—"}% (${fmtN(x.feedbackCount)})</td><td>${x.buyBox ? '<span class="badge good">Buy Box</span>' : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Not checked yet</td></tr>`}
      </tbody></table></div><div class="foot"><button data-close>Close</button></div>`, true);
    const C = COLORS();
    chart($("#sh", m.el), { type: "line", data: { labels: h.map((x) => dt(x.ts)), datasets: [
      { label: "Sellers", data: h.map((x) => x.sellers), borderColor: C[0], stepped: true, pointRadius: 0, borderWidth: 2 },
      { label: "FBA offers", data: h.map((x) => x.fba), borderColor: C[2], stepped: true, pointRadius: 0, borderWidth: 1.5 },
      { label: "FBM offers", data: h.map((x) => x.fbm), borderColor: C[1], stepped: true, pointRadius: 0, borderWidth: 1.5 } ] },
      options: { maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { ticks: { precision: 0 }, beginAtZero: true } }, plugins: { legend: { position: "bottom" } } } });
  };
  if (canEdit()) $("#add").onclick = async () => {
    const m = modal(`<h2>Watch listings</h2><p class="small muted">Paste ASINs (any separator). Or pick from your products.</p>
      <textarea id="as" rows="6" placeholder="B07CYKKR9K, B00VXR85OM"></textarea><div style="margin-top:10px" id="pk"></div>
      <div class="foot"><button data-close>Cancel</button><button class="primary" id="as-ok">Start watching</button></div>`);
    let picked = [];
    await picker($("#pk", m.el), { placeholder: "…or search your products", onChange: (s) => picked = s });
    $("#as-ok", m.el).onclick = async () => {
      const list = await products();
      const fromPick = picked.map((id) => list.find((p) => p.sku === id)?.asin || id);
      const r = await api("POST", "/sellers/track", { asins: $("#as", m.el).value + " " + fromPick.join(" ") });
      m.close(); toast(`Watching ${r.added} listings — first check runs within a minute.`); load();
    };
  };
  load();
};

// ---------------- images ----------------
PAGES.images = async (el, params) => {
  el.innerHTML = header("Image updates", "Pick a product, swap images, push to Amazon") + `
    <div class="card"><div class="filters"><label class="f" style="flex:1">Product<div id="pk"></div></label></div></div>
    <div id="body"><div class="empty">Pick a product to see its current images.</div></div>
    <div class="card flush"><div class="card-h"><h2>Recent image pushes</h2></div><div id="jobs"></div></div>`;
  const SL = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08", "SWCH"];
  const label = (s) => s === "MAIN" ? "Main image" : s === "SWCH" ? "Swatch" : "Image " + (Number(s.slice(2)) + 1);
  const loadJobs = async () => {
    const j = await GET("/images/jobs");
    table($("#jobs"), [
      { k: "created_at", l: "When", f: (r) => dt(r.created_at) },
      { k: "sku", l: "SKU", f: (r) => `<b class="mono">${esc(r.sku)}</b><div class="small">${esc(r.asin)}</div>` },
      { k: "slots", l: "Changes", f: (r) => Object.entries(JSON.parse(r.slots)).map(([k, v]) => `${label(k)}: ${v === null ? "remove" : "replace"}`).join("<br>"), noSort: 1 },
      { k: "user", l: "By", f: (r) => esc(r.user) },
      { k: "status", l: "Status", f: (r) => `<span class="badge ${r.status === "accepted" ? "good" : r.status === "error" ? "bad" : "info"}">${esc(r.status)}</span><div class="small" style="max-width:380px;white-space:pre-wrap">${esc(r.result || "")}</div>` },
    ], j, { sort: "created_at", tall: false, limit: 50, empty: "No image updates yet." });
  };
  const show = async (sku) => {
    $("#body").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    let d;
    try { d = await GET("/images/" + encodeURIComponent(sku)); } catch (e) { $("#body").innerHTML = `<div class="banner bad"><div class="txt">${esc(e.message)}</div></div>`; return; }
    const changes = {};
    const draw = () => {
      $("#body").innerHTML = `<div class="card"><div class="card-h"><div>${prodCell(d.product)}</div>
        ${canEdit() ? `<div class="row"><button id="reset">Reset</button><button class="primary" id="push">Push ${Object.keys(changes).length || ""} change${Object.keys(changes).length === 1 ? "" : "s"} to Amazon</button></div>` : ""}</div>
        <div class="img-grid">${SL.map((s) => {
          const cur = d.images[s], ch = changes[s];
          const src = ch === undefined ? cur?.link : ch;
          return `<div class="img-slot ${ch !== undefined ? (ch === null ? "del changed" : "changed") : ""}">
            <div class="row between"><b class="small">${label(s)}</b><span class="faint small mono">${s}</span></div>
            <div class="pic">${src ? `<img src="${esc(src)}" alt="">` : cur?.link && ch === null ? `<img src="${esc(cur.link)}" alt="">` : `<span class="faint small">empty</span>`}</div>
            <div class="small faint">${cur ? `${cur.width}×${cur.height}` : "no image"}${ch === null ? " · <b class='bad'>will be removed</b>" : ch ? " · <b class='warn'>new</b>" : ""}</div>
            ${canEdit() ? `<div class="row"><label class="btn sm" style="cursor:pointer">Upload<input type="file" accept="image/jpeg,image/png,image/tiff,image/gif" data-up="${s}" hidden></label>
              <button class="sm" data-url="${s}">URL</button>${s !== "MAIN" && cur ? `<button class="sm danger" data-del="${s}">Remove</button>` : ""}
              ${ch !== undefined ? `<button class="sm" data-undo="${s}">Undo</button>` : ""}</div>` : ""}
          </div>`;
        }).join("")}</div>
        <p class="small muted" style="margin-top:12px">Amazon wants the main image on a pure white background, at least 1000 px on the longest side (for zoom). Images normally show on the listing within 15 minutes to a few hours.</p></div>`;
      if (!canEdit()) return;
      $$("[data-up]").forEach((i) => i.onchange = async () => {
        const f = i.files[0]; if (!f) return;
        const fd = new FormData(); fd.append("file", f);
        try { toast("Uploading…"); const r = await api("POST", "/images/upload", fd); changes[i.dataset.up] = r.url; draw(); } catch (e) { toast(e.message, true); }
      });
      $$("[data-url]").forEach((b) => b.onclick = () => { const u = prompt("Image URL (https://…)"); if (u) { changes[b.dataset.url] = u.trim(); draw(); } });
      $$("[data-del]").forEach((b) => b.onclick = () => { changes[b.dataset.del] = null; draw(); });
      $$("[data-undo]").forEach((b) => b.onclick = () => { delete changes[b.dataset.undo]; draw(); });
      $("#reset").onclick = () => { Object.keys(changes).forEach((k) => delete changes[k]); draw(); };
      $("#push").onclick = async () => {
        if (!Object.keys(changes).length) return toast("Make a change first.", true);
        const html = `<p>These image changes will be sent to Amazon for <b class="mono">${esc(sku)}</b> (${esc(d.product.asin)}):</p><ul>${Object.entries(changes).map(([k, v]) => `<li>${label(k)}: ${v === null ? "<b class='bad'>remove</b>" : "replace"}</li>`).join("")}</ul>`;
        if (!await confirmBox("Push image changes?", html, "Push to Amazon")) return;
        try { await api("POST", "/images/push", { sku, slots: changes }); toast("Sent — Amazon's response appears below in a few seconds."); setTimeout(loadJobs, 4000); loadJobs(); }
        catch (e) { toast(e.message, true); }
      };
    };
    draw();
  };
  await picker($("#pk"), { single: true, placeholder: "Search SKU, ASIN or title…", onChange: (s) => s[0] && show(s[0]) });
  if (params.get("sku")) show(params.get("sku"));
  loadJobs();
};

// ---------------- settings & sync ----------------
PAGES.settings = async (el) => {
  const d = await GET("/system");
  const sec = d.secrets;
  const JOBS = [["listings", "Product list", "every 12 h"], ["orders_recent", "Recent orders (sales)", "every hour"], ["orders_refresh", "Order corrections (last 3 weeks)", "daily"],
    ["inventory", "FBA inventory", "every hour"], ["catalog", "Images & brands", "every 6 h"], ["fees", "Fee + inventory-planning reports", "daily"],
    ["reprice", "Repricer", "every 15 min"], ["sellers", "Seller count check", "every 30 min"]];
  const st = (k) => sec[k] === "worker-secret" ? '<span class="badge good">set (Worker secret)</span>' : sec[k] ? '<span class="badge good">set</span>' : '<span class="badge">not set</span>';
  el.innerHTML = header("Settings & sync") + `
    <div class="tabs"><button data-t="conn" class="on">Connections</button><button data-t="sync">Data sync</button><button data-t="prod">Products & costs</button><button data-t="logs">Logs</button>${d.isAdmin ? `<button data-t="audit">Audit trail</button>` : ""}</div>
    <div data-p="conn">
      <div class="grid g2">
      <div class="card"><h2>Amazon</h2>
        <p class="row"><span class="dot ${d.connected ? "good" : "bad"}"></span><b>${d.connected ? "Connected" : "Not connected"}</b> <span class="muted small">via your commerce-mcp Worker</span></p>
        <p class="small muted">This system reaches Amazon through the <span class="mono">commerce-mcp</span> Worker you already run, the same way your review requester does. Paste that Worker's MCP secret: it's the last part of your Commerce connector URL (<span class="mono">…/mcp/<b>THIS-PART</b></span>), or the same value you gave the review requester as <span class="mono">COMMERCE_MCP_SECRET</span>.</p>
        ${d.isAdmin ? `<label class="f">commerce-mcp secret ${st("COMMERCE_MCP_SECRET")}<input type="password" id="k-mcp" placeholder="${sec.COMMERCE_MCP_SECRET ? "•••••••• (leave blank to keep)" : "paste secret"}" autocomplete="off"></label>
        <div class="row" style="margin-top:10px"><button class="primary" id="save-mcp">Save</button><button id="test-amz">Test connection</button></div>` : `<p class="small muted">Only admins can change connections.</p>`}
      </div>
      <div class="card"><h2>Email</h2>
        <p class="row"><span class="dot ${d.email ? "good" : "bad"}"></span><b>${d.email === "gmail" ? "Gmail" : d.email === "resend" ? "Resend" : "Not set up"}</b></p>
        <p class="small muted"><b>Easiest: Gmail.</b> Turn on 2-Step Verification in your Google Account, then create an <b>App password</b> (Google Account → Security → App passwords) and paste it here. Alerts are sent from and to your Gmail.</p>
        ${d.isAdmin ? `<div class="form-grid"><label class="f">Gmail address ${st("GMAIL_USER")}<input id="k-gu" placeholder="you@gmail.com" autocomplete="off"></label>
          <label class="f">Gmail app password ${st("GMAIL_APP_PASSWORD")}<input type="password" id="k-gp" placeholder="16 letters" autocomplete="off"></label></div>
          <details style="margin-top:10px"><summary class="small">Or use Resend instead</summary><label class="f" style="margin-top:8px">Resend API key ${st("RESEND_API_KEY")}<input type="password" id="k-rs" autocomplete="off"></label></details>
          <hr class="sep">
          <div class="form-grid"><label class="f">Alert email(s)<input id="k-to" value="${esc(d.alertEmails.join(", "))}" placeholder="defaults to the Gmail address"></label>
          <label class="f">Your time zone (for email times)<select id="k-tz">${["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Jerusalem"].map((z) => `<option ${z === d.timezone ? "selected" : ""}>${z}</option>`).join("")}</select></label></div>
          <div class="row" style="margin-top:10px"><button class="primary" id="save-em">Save</button><button id="test-em">Send test email</button></div>` : ""}
      </div></div>
    </div>
    <div data-p="sync" class="hidden">
      ${d.storage ? `<div class="card"><h2>Cloudflare storage today</h2><div class="progress"><div style="width:${Math.min(100, d.storage.writesToday / d.storage.budget * 100)}%"></div></div>
        <p class="small muted">${fmtN(d.storage.writesToday)} of ${fmtN(d.storage.budget)} database writes used today (resets midnight UTC). The history import pauses at 50% and other syncs at 85% so the dashboard keeps working.</p></div>` : ""}
      ${d.backfill ? `<div class="card"><h2>Sales history</h2><div class="progress"><div style="width:${Math.min(100, d.backfill.daysLoaded / d.backfill.total * 100)}%"></div></div>
        <p class="small muted">${d.backfill.done ? "Complete" : `Loading: ${fmtN(d.backfill.daysLoaded)} of ${d.backfill.total} days`} · oldest day loaded: ${dayFmt(d.backfill.oldest)} · ${fmtN(d.counts.salesRows)} SKU-days</p></div>` : ""}
      <div class="card flush"><div class="card-h"><h2>Scheduled jobs</h2>${canEdit() ? `<button class="sm" data-sync="all">Run everything now</button>` : ""}</div>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Job</th><th>Schedule</th><th>Last run</th><th>Last success</th><th>Info</th><th></th></tr></thead><tbody>
        ${JOBS.map(([k, l, s]) => { const j = d.jobs[k] || {}; const ok = j.last_ok && j.last_ok === j.last_run; return `<tr><td><span class="dot ${!j.last_run ? "" : ok ? "good" : "bad"}"></span> <b>${l}</b></td><td class="small">${s}</td><td class="small">${ago(j.last_run)}</td><td class="small">${ago(j.last_ok)}</td><td class="small" style="max-width:340px">${esc(j.info || "")}</td><td>${canEdit() ? `<button class="sm" data-sync="${k}">Run now</button>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div></div>
      <div class="card flush"><div class="card-h"><h2>Amazon reports</h2></div><div class="tbl-wrap" style="max-height:400px"><table class="t"><thead><tr><th>Requested</th><th>Report</th><th>Status</th><th class="n">Rows</th><th>Details</th></tr></thead><tbody>
        ${d.reports.map((r) => `<tr><td class="small">${dt(r.created_at)}</td><td class="small"><b>${esc(r.kind)}</b> <span class="faint">${esc(r.params && r.params !== "{}" ? r.params : "")}</span></td><td><span class="badge ${r.status === "done" ? "good" : r.status === "error" ? "bad" : r.status === "empty" ? "" : "info"}">${esc(r.status)}</span></td><td class="n">${fmtN(r.rows)}</td><td class="small bad">${esc(r.error || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No reports yet</td></tr>`}
        </tbody></table></div></div>
    </div>
    <div data-p="prod" class="hidden">
      <div class="card"><div class="row between"><div><h2>Mr Miracle products & unit costs</h2><p class="small muted" style="margin:0">Anything with “Mr Miracle” in the brand or title is Mr Miracle by default. Override per product here. Unit cost (COGS) drives the profit numbers.</p></div>
        ${canEdit() ? `<button id="cogs">Import costs (CSV)</button>` : ""}</div>
        <div class="row" style="margin-top:12px"><input id="pq" placeholder="Search" style="width:240px"><select id="pf"><option value="">All</option><option value="1">Mr Miracle</option><option value="0">Not Mr Miracle</option><option value="nocost">Missing cost</option></select></div></div>
      <div class="card flush" id="ptbl"></div>
    </div>
    <div data-p="logs" class="hidden">
      <div class="card flush"><div class="card-h"><h2>Emails sent</h2></div><div class="tbl-wrap" style="max-height:300px"><table class="t"><thead><tr><th>When</th><th>Type</th><th>Subject</th><th>Status</th></tr></thead><tbody>
        ${d.emails.map((e) => `<tr><td class="small">${dt(e.ts)}</td><td class="small">${esc(e.kind)}</td><td class="small">${esc(e.subject)}</td><td><span class="badge ${e.status === "sent" ? "good" : "bad"}">${esc(e.status)}</span> <span class="small bad">${esc(e.error || "")}</span></td></tr>`).join("") || `<tr><td colspan="4" class="empty">No emails yet</td></tr>`}</tbody></table></div></div>
      <div class="card flush"><div class="card-h"><h2>System log</h2></div><div class="tbl-wrap" style="max-height:400px"><table class="t"><thead><tr><th>When</th><th>Area</th><th>Message</th></tr></thead><tbody>
        ${d.logs.map((l) => `<tr><td class="small nowrap">${dt(l.ts)}</td><td class="small">${esc(l.area)}</td><td class="small mono" style="white-space:pre-wrap">${esc(l.msg)}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">Nothing logged</td></tr>`}</tbody></table></div></div>
    </div>
    <div data-p="audit" class="hidden"><div class="card flush" id="aud"></div></div>`;
  $$(".tabs button").forEach((b) => b.onclick = async () => {
    $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    $$("[data-p]").forEach((p) => p.classList.toggle("hidden", p.dataset.p !== b.dataset.t));
    if (b.dataset.t === "prod") drawProducts();
    if (b.dataset.t === "audit") {
      const a = await GET("/audit");
      table($("#aud"), [{ k: "ts", l: "When", f: (r) => dt(r.ts) }, { k: "user", l: "User" }, { k: "action", l: "Action" }, { k: "detail", l: "Detail", f: (r) => `<span class="small mono">${esc(r.detail)}</span>` }], a, { sort: "ts" });
    }
  });
  $$("[data-sync]").forEach((b) => b.onclick = async () => { await api("POST", "/system/sync", { task: b.dataset.sync }); toast("Started — refresh in a minute to see results."); });
  if (d.isAdmin) {
    $("#save-mcp").onclick = async () => { const v = $("#k-mcp").value.trim(); if (!v) return toast("Paste the secret first.", true); await api("PUT", "/system/connections", { COMMERCE_MCP_SECRET: v }); toast("Saved — testing…"); setTimeout(() => $("#test-amz").click(), 300); };
    $("#test-amz").onclick = async () => { try { const r = await api("POST", "/system/test-amazon"); toast(`Amazon connected ✓ (${(r.marketplaces || []).join(", ")})`); route(); } catch (e) { toast(e.message, true); } };
    $("#save-em").onclick = async () => {
      const b = { alertEmails: $("#k-to").value, timezone: $("#k-tz").value };
      if ($("#k-gu").value.trim()) b.GMAIL_USER = $("#k-gu").value.trim();
      if ($("#k-gp").value.trim()) b.GMAIL_APP_PASSWORD = $("#k-gp").value.replace(/\s+/g, "");
      if ($("#k-rs").value.trim()) b.RESEND_API_KEY = $("#k-rs").value.trim();
      await api("PUT", "/system/connections", b); toast("Saved"); route();
    };
    $("#test-em").onclick = async () => { try { const r = await api("POST", "/system/test-email"); toast("Test email sent to " + r.to.join(", ")); } catch (e) { toast(e.message, true); } };
  }
  let plist = null, pterm = "", pf = "";
  const drawProducts = async () => {
    plist = plist || await products(true);
    let rows = plist;
    if (pterm) rows = rows.filter((p) => (p.sku + p.asin + p.title + p.brand).toLowerCase().includes(pterm));
    if (pf === "1" || pf === "0") rows = rows.filter((p) => String(p.mrm) === pf);
    if (pf === "nocost") rows = rows.filter((p) => p.cogs === null);
    table($("#ptbl"), [
      { k: "sku", l: "Product", f: prodCell, cls: "prod" },
      { k: "brand", l: "Brand", f: (p) => esc(p.brand || "") },
      { k: "status", l: "Status", f: (p) => `<span class="small">${esc(p.status || "")} ${esc(p.fulfillment || "")}</span>` },
      { k: "units30", l: "Sold 30d", n: 1, f: (p) => fmtN(p.units30) },
      { k: "price", l: "Price", n: 1, f: (p) => fmt$(p.price) },
      { k: "mrm", l: "Mr Miracle?", f: (p) => canEdit() ? `<select data-m="${esc(p.sku)}"><option value="" ${p.is_mrm === null ? "selected" : ""}>Auto (${p.mrm_auto ? "yes" : "no"})</option><option value="1" ${p.is_mrm === 1 ? "selected" : ""}>Yes</option><option value="0" ${p.is_mrm === 0 ? "selected" : ""}>No</option></select>` : p.mrm ? "Yes" : "No" },
      { k: "cogs", l: "Unit cost", n: 1, f: (p) => canEdit() ? `<input class="w-num" type="number" step="0.01" data-c="${esc(p.sku)}" value="${p.cogs ?? ""}">` : fmt$(p.cogs) },
    ], rows, {
      sort: "units30", after: (tEl) => {
        $$("[data-m]", tEl).forEach((s) => s.onchange = async () => { await api("PATCH", "/products", { sku: s.dataset.m, mrm: s.value === "" ? null : Number(s.value) }); productsCache = null; toast("Saved"); });
        $$("[data-c]", tEl).forEach((s) => s.onchange = async () => { await api("PATCH", "/products", { sku: s.dataset.c, cogs: s.value === "" ? null : Number(s.value) }); toast("Saved"); });
      },
    });
  };
  $("#pq").oninput = debounce(() => { pterm = $("#pq").value.toLowerCase(); drawProducts(); }, 200);
  $("#pf").onchange = () => { pf = $("#pf").value; drawProducts(); };
  if ($("#cogs")) $("#cogs").onclick = () => {
    const m = modal(`<h2>Import unit costs</h2><p class="small muted">Paste two columns: <span class="mono">SKU (or ASIN), unit cost</span>. Straight from a spreadsheet works.</p>
      <textarea id="cv" rows="12"></textarea><div class="foot"><button data-close>Cancel</button><button class="primary" id="cv-ok">Import</button></div>`);
    $("#cv-ok", m.el).onclick = async () => { const r = await api("POST", "/products/cogs", { csv: $("#cv", m.el).value }); m.close(); toast(`Updated ${r.updated} SKUs`); plist = null; drawProducts(); };
  };
};

// ---------------- users ----------------
PAGES.users = async (el) => {
  if (state.me.role !== "admin") { el.innerHTML = header("Users") + `<div class="banner warn"><div class="txt">Admins only.</div></div>`; return; }
  const u = await GET("/users");
  el.innerHTML = header("Users", "Who can sign in, and what they can do", `<button class="primary" id="add">Add user</button>`) + `
    <div class="card small muted"><b>Admin</b>: everything, including users and connections. <b>Manager</b>: everything except users/connections (can change prices, rules, images). <b>Viewer</b>: read-only dashboards.</div>
    <div class="card flush" id="t"></div>`;
  table($("#t"), [
    { k: "name", l: "Name", f: (r) => `<b>${esc(r.name || "")}</b><div class="small muted">${esc(r.email)}</div>` },
    { k: "role", l: "Role", f: (r) => `<select data-role="${r.id}">${["admin", "manager", "viewer"].map((x) => `<option ${x === r.role ? "selected" : ""}>${x}</option>`).join("")}</select>` },
    { k: "active", l: "Active", f: (r) => `<input type="checkbox" data-act="${r.id}" ${r.active ? "checked" : ""}>` },
    { k: "last_login", l: "Last sign-in", f: (r) => ago(r.last_login) },
    { k: "x", l: "", noSort: 1, f: (r) => `<button class="sm" data-pw="${r.id}">Reset password</button> ${r.id !== state.me.id ? `<button class="sm danger" data-del="${r.id}">Delete</button>` : ""}` },
  ], u, { tall: false });
  const patch = async (id, b) => { try { await api("PATCH", "/users/" + id, b); toast("Saved"); } catch (e) { toast(e.message, true); route(); } };
  $$("[data-role]").forEach((s) => s.onchange = () => patch(s.dataset.role, { role: s.value }));
  $$("[data-act]").forEach((s) => s.onchange = () => patch(s.dataset.act, { active: s.checked }));
  $$("[data-pw]").forEach((b) => b.onclick = () => { const p = prompt("New password (8+ characters)"); if (p) patch(b.dataset.pw, { password: p }); });
  $$("[data-del]").forEach((b) => b.onclick = async () => { if (await confirmBox("Delete user?", "They will be signed out and can't sign in again.", "Delete")) { await api("DELETE", "/users/" + b.dataset.del); route(); } });
  $("#add").onclick = () => {
    const m = modal(`<h2>Add user</h2><div class="form-grid">
      <label class="f">Name<input id="u-n"></label><label class="f">Email<input id="u-e" type="email"></label>
      <label class="f">Role<select id="u-r"><option>viewer</option><option selected>manager</option><option>admin</option></select></label>
      <label class="f">Temporary password<input id="u-p" value="${Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)}"></label></div>
      <p class="small muted">Share the email and temporary password with them. They can change it after signing in.</p>
      <div class="foot"><button data-close>Cancel</button><button class="primary" id="u-ok">Create</button></div>`);
    $("#u-ok", m.el).onclick = async () => {
      try { await api("POST", "/users", { name: $("#u-n", m.el).value, email: $("#u-e", m.el).value, role: $("#u-r", m.el).value, password: $("#u-p", m.el).value }); m.close(); toast("User created"); route(); }
      catch (e) { toast(e.message, true); }
    };
  };
};

boot();
})();
