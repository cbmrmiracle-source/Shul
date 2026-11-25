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
  const onKey = (e) => { if (e.key === "Escape" && !bg.querySelector(".spinner")) close(); };
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  document.addEventListener("keydown", onKey);
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
// Multi-hue heat scale: pale yellow → orange → green → deep green (darker = better day). Returns [background, text color].
const HEAT = [[255, 247, 188], [254, 196, 79], [173, 221, 142], [65, 171, 93], [0, 104, 55], [0, 69, 41]];
function heat(t) {
  if (!(t > 0)) return ["transparent", "inherit"];
  t = Math.min(1, t);
  const x = t * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i;
  const c = HEAT[i].map((v, k) => Math.round(v + (HEAT[i + 1][k] - v) * f));
  return [`rgb(${c.join(",")})`, t > 0.62 ? "#ffffff" : "#1c2330"];
}

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
    box.innerHTML = sel.map((s) => `<span class="chip">${esc(s)}<button type="button" data-x="${esc(s)}" title="Remove">×</button></span>`).join("")
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
  truck: '<path d="M1 4h14v11H1zM15 8h4l3 3v4h-7z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="17.5" r="2"/><circle cx="18" cy="17.5" r="2"/>',
  users: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const NAV = [
  ["sec", "Overview"], ["dashboard", "Dashboard", "dash"],
  ["sec", "Sales"], ["sales", "Sales analysis", "sales"], ["price", "Price vs sales", "price"], ["grid", "Daily grid", "grid"], ["compare", "Compare periods", "compare"],
  ["sec", "Pricing"], ["repricer", "Repricer", "repricer"], ["pricing", "Mr Miracle pricing", "tag"],
  ["sec", "Monitoring"], ["fees", "FBA fee changes", "fees"], ["sellers", "Seller count", "sellers"],
  ["sec", "FBA"], ["inventory", "Inventory status", "inv"], ["shipping", "Shipping", "truck"],
  ["sec", "Listings"], ["images", "Image updates", "img"],
  ["sec", "Admin"], ["settings", "Settings & sync", "gear"], ["users", "Users", "users", "admin"],
];

function shell() {
  $("#root").innerHTML = `<div class="app">
    <aside class="side" id="side">
      <div class="logo"><div class="mark">MM</div><div><div class="t1">Mr Miracle</div><div class="t2">FBA System</div></div></div>
      <nav class="nav">${(state.me.role === "warehouse" ? [["sec", "FBA"], ["inventory", "Inventory status", "inv"], ["shipping", "Shipping", "truck"]] : NAV).filter((n) => !n[3] || state.me.role === n[3]).map((n) => n[0] === "sec"
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
  let r = (location.hash.replace(/^#\/?/, "").split("?")[0] || (state.me.role === "warehouse" ? "shipping" : "dashboard"));
  if (state.me.role === "warehouse" && !["inventory", "shipping"].includes(r)) r = "shipping";
  state.route = r;
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.r === r));
  $("#side").classList.remove("open");
  const main = $("#main");
  charts.forEach((c) => c.destroy()); charts.clear();
  $$(".modal-bg").forEach((m) => { if (!m.querySelector(".spinner")) m.remove(); });
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
      <div class="f" style="flex:1;min-width:280px">Products<div id="pk"></div></div>
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
      <div class="f" style="flex:1;min-width:300px">Products (one chart each)<div id="pk"></div></div>
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
      <div class="f" style="flex:1;min-width:280px">Products<div id="pk"></div></div>
      <div class="row" id="rng"></div>
      <label class="f">Show<select id="met"><option value="units">Units</option><option value="revenue">Sales $</option><option value="price">Avg price</option></select></label>
      <label class="f">Group by<select id="grp"><option value="asin">ASIN</option><option value="sku">SKU</option></select></label>
      <label class="f">Rows<select id="lim"><option>50</option><option selected>100</option><option>300</option><option value="5000">All</option></select></label>
      <label class="f">Color by<select id="scale"><option value="row" selected>Each product's own best day</option><option value="table">Whole table</option></select></label>
    </div>
    <div class="row small muted" style="margin-top:10px">Low <span class="heat-legend"></span> Best day · price view: <span class="badge" style="background:#fde68a;color:#1c2330">price up</span> <span class="badge" style="background:#bfdbfe;color:#1c2330">price down</span></div></div>
    <div class="card flush" id="out"></div>`;
  let ids = (params.get("ids") || "").split(",").filter(Boolean), data = null;
  const load = debounce(async () => {
    const [from, to] = rng.get();
    $("#out").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    data = await GET("/grid" + qs({ from, to, ids: ids.join(","), metric: $("#met").value, group: $("#grp").value }));
    const met = $("#met").value, lim = Number($("#lim").value);
    const items = data.items.slice(0, lim);
    const scope = $("#scale").value; // "row" = each product against its own best day
    let tableMax = 0; items.forEach((it) => Object.values(it.cells).forEach((v) => { if (v > tableMax) tableMax = v; }));
    items.forEach((it) => { it.rowMax = Math.max(0, ...Object.values(it.cells).map((v) => v || 0)); });
    const cell = (it, d, i) => {
      const v = it.cells[d];
      if (v === undefined || v === null) return `<td class="cell-heat faint">${met === "price" ? "" : "0"}</td>`;
      if (met === "price") {
        const next = data.days.slice(i + 1).find((x) => it.cells[x] !== undefined && it.cells[x] !== null);
        const pv = next ? it.cells[next] : null;
        const ch = pv !== null && Math.abs(v - pv) / pv > 0.02;
        const up = ch && v > pv;
        return `<td class="cell-heat ${ch ? "pchg" : ""}" style="${ch ? `background:${up ? "#fde68a" : "#bfdbfe"};color:#1c2330` : ""}" title="${ch ? `Changed from ${fmt$(pv)}` : ""}">${fmt$(v)}</td>`;
      }
      const max = scope === "row" ? it.rowMax : tableMax;
      const t = max ? v / max : 0;
      const [bg, fg] = heat(t);
      return `<td class="cell-heat" style="background:${bg};color:${fg}" title="${Math.round(t * 100)}% of ${scope === "row" ? "this product's best day" : "the table's best day"}">${met === "revenue" ? fmt$0(v) : fmtN(v)}</td>`;
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
  ["#met", "#grp", "#lim", "#scale"].forEach((s) => $(s).onchange = load);
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
      <div class="f" style="flex:1;min-width:260px">Products<div id="pk"></div></div>
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
  let f = params.get("f") || "all", term = "", brand = "", sortBy = f === "low" ? "toShip" : "l30";
  const send = new Map(); // sku -> qty to send
  el.innerHTML = header("FBA inventory status", `Live from Amazon · updated ${ago(d.syncedAt)}`,
    `<button id="set">Settings / rules</button><button id="csv">Export CSV</button>`) + `
    <div class="card"><div class="row between">
      <div class="seg" id="tabs">${[["all", "All inventory"], ["low", "Needs shipping"], ["oos", "Out of stock"], ["inactive", "Inactive"], ["discontinued", "Discontinued"], ["direct", "Direct to FBA"], ["errors", "Errors"]].map(([k, l]) => `<button data-f="${k}" class="${k === f ? "on" : ""}">${l} <span class="faint" data-c="${k}"></span></button>`).join("")}</div>
      <div class="row" id="filters"><select id="brand"><option value="">All brands</option><option value="1">Mr Miracle</option><option value="0">Other</option></select>
        <label class="row small muted" style="gap:6px">Sort by<select id="sort">
          <option value="toShip">Qty to ship (most first)</option><option value="daysShipped">Days of stock (fewest first)</option>
          <option value="l30">Sold last 30 days</option><option value="fulfillable">Sellable units</option><option value="total">Total in FBA</option><option value="sku">SKU A–Z</option></select></label>
        <input id="q" placeholder="Search SKU, ASIN, title" style="width:200px"></div>
    </div>
    <div class="row small" style="margin-top:12px;gap:14px;flex-wrap:wrap">
      <span><span class="pill bad">≤ ${s.minDays} days</span> below minimum — ship now</span>
      <span><span class="pill warn">≤ ${s.maxAlert} days</span> getting low</span>
      <span><span class="pill good">&gt; ${s.maxAlert} days</span> healthy</span>
      <span class="muted"><b>Direct to FBA</b> = your "Direct to FBA" list from the sheet (products you ship straight to Amazon) · <b>Discontinued</b> = no longer restocked (hidden from All, no qty to ship)</span>
    </div></div>
    <div class="card hidden" id="sendbar" style="position:sticky;top:8px;z-index:20;border-color:var(--brand-2)"><div class="row between">
      <div><b id="sendcount">0 products</b> <span class="muted" id="sendunits"></span></div>
      <div class="row"><button id="sendclear">Clear</button><button class="primary" id="sendgo">Create send list →</button></div></div></div>
    <div id="body"></div>`;
  $("#sort").value = sortBy;
  const today0 = todayLA();
  const match = (r, k) => k === "all" ? !r.discontinued : k === "low" ? r.state === "low" && r.toShip > 0 && !r.discontinued : k === "oos" ? r.state === "oos" && !r.discontinued : k === "inactive" ? r.state === "inactive" : k === "discontinued" ? r.discontinued : k === "direct" ? r.directFba && !r.discontinued : true;
  const counts = () => $$("[data-c]").forEach((x) => { if (x.dataset.c !== "errors") x.textContent = d.rows.filter((r) => match(r, x.dataset.c)).length; });
  counts();
  const pill = (v) => v === null ? `<span class="faint">—</span>` : `<span class="pill ${v <= s.minDays ? "bad" : v <= s.maxAlert ? "warn" : "good"}">${fmtN(v)}</span>`;
  const save = async (sku, patch) => { try { await api("PATCH", "/products", { sku, ...patch }); toast("Saved"); } catch (e) { toast(e.message, true); } };
  const STATE = { ok: ["In stock", "good"], low: ["Ship soon", "bad"], oos: ["Out of stock", "bad"], inactive: ["Inactive", "warn"], discontinued: ["Discontinued", ""] };
  const updSend = () => {
    const units = [...send.values()].reduce((a, b) => a + b, 0);
    $("#sendbar").classList.toggle("hidden", !send.size);
    $("#sendcount").textContent = `${send.size} product${send.size === 1 ? "" : "s"} to send`;
    $("#sendunits").textContent = `· ${fmtN(units)} units`;
  };
  $("#sendclear").onclick = () => { send.clear(); updSend(); draw(); };
  $("#sendgo").onclick = async () => {
    try {
      const r = await api("POST", "/ship/plans", { name: `Shipment ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, items: [...send].map(([sku, qty]) => ({ sku, qty })) });
      location.hash = "#/shipping?id=" + r.id;
    } catch (e) { toast(e.message, true); }
  };

  const drawErrors = async () => {
    $("#filters").classList.add("hidden");
    const list = await GET("/inv-errors");
    $("#body").innerHTML = `<div class="card"><h2>Inventory errors</h2>
      <p class="small muted" style="margin-top:-6px">Units Amazon shows that you can't count on (miscounts, damaged, lost in receiving…). They're subtracted from "Days of stock including shipped" until the end date, then stop counting automatically.</p>
      ${canEdit() ? `<div class="filters"><div class="f" style="flex:1;min-width:260px">Product<div id="epk"></div></div>
        <label class="f">Units<input type="number" id="eq" class="w-num" min="1"></label>
        <label class="f">Counts until<input type="date" id="ee" value="${addDays(today0, 14)}"></label>
        <label class="f" style="flex:1;min-width:180px">Note<input id="en" placeholder="e.g. 10 units lost at receiving, case open"></label>
        <button class="primary" id="eadd">Add error</button></div>` : ""}</div>
      <div class="card flush" id="et"></div>`;
    let esku = null;
    if (canEdit()) {
      await picker($("#epk"), { single: true, placeholder: "Search SKU, ASIN or title…", onChange: (x) => esku = x[0] || null });
      $("#eadd").onclick = async () => {
        try { await api("POST", "/inv-errors", { sku: esku, qty: $("#eq").value, endDay: $("#ee").value, note: $("#en").value }); toast("Added"); drawErrors(); }
        catch (e) { toast(e.message, true); }
      };
    }
    table($("#et"), [
      { k: "sku", l: "Product", f: (r) => prodCell(r), cls: "prod" },
      { k: "qty", l: "Units", n: 1, f: (r) => `<b>${fmtN(r.qty)}</b>` },
      { k: "note", l: "Note", f: (r) => `<span class="small">${esc(r.note || "")}</span>` },
      { k: "start_day", l: "From", f: (r) => dayFmt(r.start_day) },
      { k: "end_day", l: "Until", f: (r) => canEdit() ? `<input type="date" data-end="${r.id}" value="${r.end_day}">` : dayFmt(r.end_day) },
      { k: "active", l: "Status", f: (r) => r.end_day >= today0 ? `<span class="badge warn">counting</span>` : `<span class="badge">ended</span>`, sort: (r) => r.end_day >= today0 ? 1 : 0 },
      { k: "created_by", l: "Added by", f: (r) => `<span class="small">${esc(r.created_by || "")}</span>` },
      { k: "x", l: "", noSort: 1, f: (r) => canEdit() ? `<button class="sm danger" data-del="${r.id}">Remove</button>` : "" },
    ], list, {
      sort: "active", tall: false, empty: "No errors recorded.", after: (t) => {
        $$("[data-end]", t).forEach((i) => i.onchange = async () => { await api("PATCH", "/inv-errors/" + i.dataset.end, { endDay: i.value }); toast("Saved"); });
        $$("[data-del]", t).forEach((b) => b.onclick = async () => { await api("DELETE", "/inv-errors/" + b.dataset.del); drawErrors(); });
      },
    });
  };

  const draw = () => {
    if (f === "errors") return drawErrors();
    $("#filters").classList.remove("hidden");
    let rows = d.rows.filter((r) => match(r, f));
    if (brand) rows = rows.filter((r) => String(r.mrm) === brand);
    if (term) rows = rows.filter((r) => (r.sku + r.asin + r.title + r.fnsku).toLowerCase().includes(term));
    $("#body").innerHTML = `<div class="card flush" id="tbl"></div>`;
    table($("#tbl"), [
      { k: "send", l: canShip() ? `<span title="Tick to add to a send list">Send</span>` : "", noSort: 1, f: (r) => canShip() && !r.discontinued ? `<label class="chk"><input type="checkbox" data-send="${esc(r.sku)}" ${send.has(r.sku) ? "checked" : ""}></label> <input class="w-num" style="width:64px" type="number" min="0" data-sq="${esc(r.sku)}" value="${send.get(r.sku) ?? (r.toShip || "")}" placeholder="qty">` : "" },
      { k: "sku", l: "Product", f: (r) => prodCell(r), cls: "prod", sort: (r) => r.sku.toLowerCase() },
      { k: "state", l: "Status", f: (r) => { const [l, c] = STATE[r.discontinued ? "discontinued" : r.state] || STATE.ok; return `<span class="badge ${c}">${l}</span>`; } },
      { k: "toShip", l: "Qty to ship", n: 1, f: (r) => r.toShip ? `<span class="pill info"><b>${fmtN(r.toShip)}</b></span>` : `<span class="faint">–</span>` },
      { k: "daysShipped", l: "Days inc. shipped", n: 1, f: (r) => pill(r.daysShipped) },
      { k: "daysSellable", l: "Days sellable", n: 1, f: (r) => pill(r.daysSellable) },
      { k: "daysReserve", l: "Days inc. reserve", n: 1, f: (r) => pill(r.daysReserve) },
      { k: "total", l: "Total in FBA", n: 1, f: (r) => `<b>${fmtN(r.total)}</b>` },
      { k: "fulfillable", l: "Sellable", n: 1, f: (r) => `<span class="good">${fmtN(r.fulfillable)}</span>` },
      { k: "reserved", l: "Reserved", n: 1, f: (r) => fmtN(r.reserved) },
      { k: "shipped", l: "Shipped", n: 1, f: (r) => r.shipped ? `<span class="info">${fmtN(r.shipped)}</span>` : "0" },
      { k: "receiving", l: "Receiving", n: 1, f: (r) => r.receiving ? `<span class="info">${fmtN(r.receiving)}</span>` : "0" },
      { k: "shipmentCreated", l: "Shipment created", n: 1, f: (r) => fmtN(r.shipmentCreated) },
      { k: "fcTransfer", l: "FC transfer", n: 1, f: (r) => fmtN(r.fcTransfer) },
      { k: "unfulfillable", l: "Unfulfillable", n: 1, f: (r) => r.unfulfillable ? `<span class="bad">${fmtN(r.unfulfillable)}</span>` : "0" },
      { k: "errors", l: "Errors", n: 1, f: (r) => r.errors ? `<a class="bad" href="#/inventory?f=errors">−${fmtN(r.errors)}</a>` : `<span class="faint">0</span>` },
      { k: "l7", l: "Sold 7d", n: 1, f: (r) => fmtN(r.l7) },
      { k: "l14", l: "14d", n: 1, f: (r) => fmtN(r.l14) },
      { k: "l30", l: "30d", n: 1, f: (r) => fmtN(r.l30) },
      { k: "avg30", l: "Avg 30d", n: 1, f: (r) => fmtN(r.avg30) },
      { k: "buyBox", l: "Buy Box", f: (r) => r.buyBox ? `<span class="badge ${r.buyBox === "won" ? "good" : "bad"}">${r.buyBox}</span>` : `<span class="faint">—</span>` },
      { k: "unitProfit", l: "Profit/unit", n: 1, f: (r) => `<span class="${signCls(r.unitProfit)}">${fmt$(r.unitProfit)}</span>` },
      { k: "lowInvFee", l: "Low-inv fee", f: (r) => /^y/i.test(r.lowInvFee) ? `<span class="badge warn">Yes</span>` : `<span class="faint">${esc(r.lowInvFee || "—")}</span>` },
      { k: "fnsku", l: "FNSKU", f: (r) => `<span class="mono">${esc(r.fnsku || "")}</span>` },
      { k: "directFba", l: `<span title="Your 'Direct to FBA' list">Direct to FBA</span>`, f: (r) => canEdit() ? `<input type="checkbox" data-dir="${esc(r.sku)}" ${r.directFba ? "checked" : ""} title="On my Direct-to-FBA list">` : r.directFba ? "✓" : "", sort: (r) => r.directFba ? 1 : 0 },
      { k: "discontinued", l: `<span title="No longer restocked">Discontinued</span>`, f: (r) => canEdit() ? `<input type="checkbox" data-disc="${esc(r.sku)}" ${r.discontinued ? "checked" : ""} title="Discontinued">` : r.discontinued ? "✓" : "", sort: (r) => r.discontinued ? 1 : 0 },
    ], rows, {
      sort: sortBy, dir: ["daysShipped", "sku"].includes(sortBy) ? 1 : -1, empty: "No products here.",
      after: (tEl) => {
        $$("tbody tr[data-i]", tEl).forEach((tr) => {
          const r = rows[Number(tr.dataset.i)];
          if (r) tr.classList.add("st-" + (r.discontinued ? "discontinued" : r.state));
        });
        $$("[data-send]", tEl).forEach((c) => c.onchange = () => {
          const qi = $(`[data-sq="${CSS.escape(c.dataset.send)}"]`, tEl);
          const qty = Math.round(Number(qi.value) || 0);
          if (c.checked) { if (!qty) { toast("Enter a quantity first.", true); c.checked = false; return; } send.set(c.dataset.send, qty); }
          else send.delete(c.dataset.send);
          updSend();
        });
        $$("[data-sq]", tEl).forEach((i) => i.oninput = () => {
          const qty = Math.round(Number(i.value) || 0);
          const c = $(`[data-send="${CSS.escape(i.dataset.sq)}"]`, tEl);
          if (qty > 0) { send.set(i.dataset.sq, qty); c.checked = true; } else { send.delete(i.dataset.sq); c.checked = false; }
          updSend();
        });
        $$("[data-dir]", tEl).forEach((i) => i.onchange = () => { d.rows.find((x) => x.sku === i.dataset.dir).directFba = i.checked; save(i.dataset.dir, { directFba: i.checked }); counts(); });
        $$("[data-disc]", tEl).forEach((i) => i.onchange = () => { d.rows.find((x) => x.sku === i.dataset.disc).discontinued = i.checked; save(i.dataset.disc, { discontinued: i.checked }); counts(); });
      },
    });
    if (canShip() && f === "low") {
      const b = document.createElement("div");
      b.className = "row"; b.style.margin = "0 0 10px";
      b.innerHTML = `<button id="selall">Select all ${rows.length} with their qty to ship</button>`;
      $("#body").prepend(b);
      $("#selall").onclick = () => { rows.forEach((r) => { if (r.toShip > 0) send.set(r.sku, r.toShip); }); updSend(); draw(); };
    }
  };
  $$("#tabs button").forEach((b) => b.onclick = () => { f = b.dataset.f; $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b)); if (f === "low") { sortBy = "toShip"; $("#sort").value = sortBy; } draw(); });
  $("#q").oninput = debounce(() => { term = $("#q").value.toLowerCase(); draw(); }, 150);
  $("#brand").onchange = () => { brand = $("#brand").value; draw(); };
  $("#sort").onchange = () => { sortBy = $("#sort").value; draw(); };
  $("#csv").onclick = () => downloadCsv("fba-inventory.csv",
    ["ASIN", "SKU", "Status", "Qty to ship", "Days inc shipped", "Days sellable", "Days inc reserve", "Total", "Sellable", "Reserved", "Shipped", "Receiving", "Shipment created", "FC transfer", "Unfulfillable", "Errors", "Sold 7d", "Sold 14d", "Sold 30d", "Avg 30d", "Buy Box", "Profit/unit", "Low inv fee", "Title", "FNSKU", "Direct to FBA", "Discontinued"],
    d.rows.filter((r) => match(r, f)).map((r) => [r.asin, r.sku, r.state, r.toShip, r.daysShipped, r.daysSellable, r.daysReserve, r.total, r.fulfillable, r.reserved, r.shipped, r.receiving, r.shipmentCreated, r.fcTransfer, r.unfulfillable, r.errors, r.l7, r.l14, r.l30, r.avg30, r.buyBox, r.unitProfit, r.lowInvFee, r.title, r.fnsku, r.directFba ? "yes" : "", r.discontinued ? "yes" : ""]));
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

// ---------------- shipping (FBA inbound, "plan then pack") ----------------
const SHIP_STEPS = [["plan", "1. Plan"], ["find", "2. Find warehouse"], ["boxes", "3. Boxes & labels"], ["freight", "4. Freight"], ["done", "5. Ready"]];
const STATUS_STEP = { draft: "plan", creating: "plan", targeting: "find", found: "find", boxes: "boxes", freight: "freight", confirmed: "done", cancelled: "done" };
const STATUS_LABEL = { draft: ["Draft", ""], creating: ["Creating…", "info"], targeting: ["Looking for warehouse", "info"], found: ["Warehouse found!", "good"],
  boxes: ["Enter boxes", "warn"], freight: ["Book freight", "warn"], confirmed: ["Ready to ship", "good"], cancelled: ["Cancelled", "bad"] };
const canSpend = () => state.me && ["admin", "manager"].includes(state.me.role);
const canShip = () => state.me && ["admin", "manager", "warehouse"].includes(state.me.role);
const optFee = (o) => (o.fees || []).reduce((s, f) => s + (f.value?.amount || 0), 0) - (o.discounts || []).reduce((s, f) => s + (f.value?.amount || 0), 0);

let barcodeLib = null;
function loadBarcodes() {
  if (window.bwipjs) return Promise.resolve(window.bwipjs);
  if (!barcodeLib) barcodeLib = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "/bwip-js-min.js";
    sc.onload = () => (window.bwipjs ? res(window.bwipjs) : rej(new Error("barcode library missing")));
    sc.onerror = () => { barcodeLib = null; rej(new Error("barcode library failed to load")); };
    document.head.appendChild(sc);
  });
  return barcodeLib;
}

async function shipStep(id, action, args = {}) {
  const m = modal(`<div class="row" style="gap:12px"><span class="spinner"></span><div><b>Working with Amazon…</b><div class="small muted">This can take a minute or two. Please keep this page open.</div></div></div>`);
  try { return await api("POST", `/ship/plans/${id}/step`, { action, ...args }); }
  finally { m.close(); }
}

function pasteBox(onDone, title = "New shipment", button = "Create shipment") {
  const m = modal(`<h2>${title}</h2>
    <p class="small muted">Paste one product per line: <span class="mono">SKU [tab] quantity</span> — straight from a spreadsheet works. ASIN or FNSKU instead of SKU is fine too.</p>
    <textarea id="pt" rows="10" class="mono" placeholder="MrM 12OZ Foam Cups 100 PK w Lids&#9;180"></textarea>
    <div id="pv" style="margin-top:10px"></div>
    <div class="foot"><button data-close>Cancel</button><button id="pchk">Check</button><button class="primary" id="pok" disabled>${button}</button></div>`, true);
  let parsed = null;
  const check = async () => {
    parsed = await api("POST", "/ship/parse", { text: $("#pt", m.el).value });
    const units = parsed.items.reduce((s, x) => s + x.qty, 0);
    $("#pv", m.el).innerHTML = `${parsed.bad.length ? `<div class="banner bad"><div class="txt"><b>${parsed.bad.length} line(s) need fixing:</b><br>${parsed.bad.map((b) => `<span class="mono">${esc(b.line)}</span> — ${esc(b.reason)}`).join("<br>")}</div></div>` : ""}
      ${parsed.items.length ? `<div class="small"><b class="good">✓ ${parsed.items.length} products · ${fmtN(units)} units</b></div><div class="tbl-wrap" style="max-height:260px"><table class="t"><thead><tr><th>SKU</th><th>ASIN</th><th>FNSKU</th><th class="n">Qty</th><th class="n">Sellable in FBA</th></tr></thead><tbody>
      ${parsed.items.map((x) => `<tr><td class="mono">${esc(x.sku)}</td><td>${esc(x.asin || "")}</td><td class="mono">${esc(x.fnsku || "")}</td><td class="n"><b>${fmtN(x.qty)}</b></td><td class="n">${fmtN(x.fulfillable)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    $("#pok", m.el).disabled = !parsed.items.length || parsed.bad.length > 0;
  };
  $("#pchk", m.el).onclick = () => check().catch((e) => toast(e.message, true));
  $("#pt", m.el).addEventListener("input", debounce(() => check().catch(() => {}), 600));
  $("#pok", m.el).onclick = async () => { try { await onDone(parsed.items); m.close(); } catch (e) { toast(e.message, true); } };
}

const SHIP_TABS = [["all", "All"], ["drafts", "Drafts"], ["working", "Working"], ["transit", "In transit"], ["receiving", "Receiving"], ["closed", "Closed"], ["cancelled", "Cancelled"]];
const tabOf = (r) => r.kind === "plan" ? (r.status === "CANCELLED" ? "cancelled" : "drafts")
  : ["WORKING", "READY_TO_SHIP"].includes(r.status) ? "working" : ["SHIPPED", "IN_TRANSIT", "DELIVERED", "CHECKED_IN"].includes(r.status) ? "transit"
  : r.status === "RECEIVING" ? "receiving" : r.status === "CLOSED" ? "closed" : ["CANCELLED", "DELETED"].includes(r.status) ? "cancelled" : "working";
const ST_BADGE = { WORKING: "info", READY_TO_SHIP: "info", SHIPPED: "info", IN_TRANSIT: "info", DELIVERED: "info", CHECKED_IN: "info", RECEIVING: "warn", CLOSED: "good", CANCELLED: "bad", DELETED: "bad", ERROR: "bad", DRAFT: "" };
const stLabel = (r) => r.kind === "plan" ? (STATUS_LABEL[r.planStatus]?.[0] || "Draft") : r.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

PAGES.shipping = async (el, params) => {
  if (params.get("id")) return shipPlanPage(el, Number(params.get("id")));
  if (params.get("fba")) return fbaShipmentPage(el, params.get("fba"));
  el.innerHTML = header("Shipments", "Every FBA shipment on the account, plus drafts made here", `<span class="small muted" id="synced"></span>${canShip() ? `<button class="primary" id="plan">Plan shipment</button>` : ""}`) + `<div id="body"><div class="loading"><span class="spinner"></span></div></div>`;
  let data = await GET("/ship/list");
  let tab = params.get("tab") || "all", term = "", openRows = new Set(), sel = new Set(), limit = 150;
  const f = { dest: "", from: "", to: "", by: "", note: "", src: "" };
  const fcs = () => [...new Set(data.rows.map((r) => r.destination).filter(Boolean))].sort();
  const users = () => [...new Set(data.rows.map((r) => r.submittedBy).filter(Boolean))].sort();
  const filtered = () => data.rows.filter((r) => (tab === "all" || tabOf(r) === tab)
    && (!term || (r.id + " " + r.name + " " + r.destination + " " + (r.note || "") + " " + r.items.map((x) => `${x.sku} ${x.asin || ""} ${x.fnsku || ""}`).join(" ")).toLowerCase().includes(term))
    && (!f.dest || r.destination === f.dest) && (!f.from || (r.created || "") >= f.from) && (!f.to || (r.created || "") <= f.to)
    && (!f.by || r.submittedBy === f.by) && (!f.note || (f.note === "with" ? !!r.note : !r.note))
    && (!f.src || (f.src === "here" ? !!r.planId : !r.planId)));
  const draw = () => {
    $("#synced").textContent = data.syncedAt ? `Synced with Amazon ${ago(data.syncedAt)}` : "Loading shipments from Amazon…";
    const rows = filtered();
    const counts = Object.fromEntries(SHIP_TABS.map(([k]) => [k, data.rows.filter((r) => k === "all" || tabOf(r) === k).length]));
    $("#body").innerHTML = `<div class="card" style="padding:0 16px"><div class="tabs" style="margin:0">${SHIP_TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l} <span class="faint">${counts[k]}</span></button>`).join("")}</div></div>
      <div class="card"><div class="row between">
        <div class="row">
          <div class="dd-wrap"><button id="act">Select action ▾</button><div class="dd-menu hidden" id="actmenu">
            ${canShip() ? `<button data-a="draft">Create draft shipment</button>` : ""}
            ${canShip() ? `<button data-a="import">Import shipment from Amazon (by ID)</button>` : ""}
            ${canEdit() ? `<button data-a="sku">Import a SKU from Amazon</button>` : ""}
            ${canShip() ? `<button data-a="cost" ${sel.size ? "" : "disabled"}>Update shipping cost (${sel.size} selected)</button>` : ""}
            <button data-a="exp">Export shipments (spreadsheet)</button>
            <button data-a="expd">Export shipment details (SKU lines)</button>
            ${canShip() ? `<button data-a="sync">Sync with Amazon now</button>` : ""}
          </div></div>
          <input id="q" placeholder="Search shipment ID, name, SKU, ASIN, FNSKU" style="width:300px" value="${esc(term)}">
          <button id="ftog">Filters${Object.values(f).some(Boolean) ? " •" : ""}</button>
        </div>
        <span class="small muted">${rows.length} shipment${rows.length === 1 ? "" : "s"}${sel.size ? ` · ${sel.size} selected` : ""}</span></div>
        <div class="filters ${Object.values(f).some(Boolean) || $("#fbox")?.dataset.open === "1" ? "" : "hidden"}" id="fbox" data-open="${Object.values(f).some(Boolean) ? 1 : 0}" style="margin-top:12px">
          <label class="f">Destination<select data-f="dest"><option value="">All</option>${fcs().map((x) => `<option ${f.dest === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
          <label class="f">Created from<input type="date" data-f="from" value="${f.from}"></label><label class="f">to<input type="date" data-f="to" value="${f.to}"></label>
          <label class="f">Submitted by<select data-f="by"><option value="">Anyone</option>${users().map((x) => `<option ${f.by === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
          <label class="f">Made in<select data-f="src"><option value="">Anywhere</option><option value="here" ${f.src === "here" ? "selected" : ""}>This system</option><option value="amazon" ${f.src === "amazon" ? "selected" : ""}>Elsewhere (imported from Amazon)</option></select></label>
          <label class="f">Note<select data-f="note"><option value="">Any</option><option value="with" ${f.note === "with" ? "selected" : ""}>With a note</option><option value="without" ${f.note === "without" ? "selected" : ""}>Without</option></select></label>
          <button id="fclear">Clear filters</button></div></div>
      <div class="card flush"><div class="tbl-wrap tall"><table class="t ship-t"><thead><tr>
        <th><input type="checkbox" id="selall"></th><th></th><th>Shipment</th><th class="n">SKUs</th><th class="n">Qty</th><th>Destination</th><th>Status</th>
        <th class="n">Received</th><th>User note</th><th>Submitted by</th><th class="n">Boxes</th><th>Qty boxed</th><th class="n">Ship cost</th><th></th></tr></thead><tbody>
        ${rows.slice(0, limit).map((r) => {
          const pct = r.units ? Math.round(r.received / r.units * 1000) / 10 : 0;
          const link = r.planId ? `#/shipping?id=${r.planId}` : `#/shipping?fba=${encodeURIComponent(r.id)}`;
          return `<tr class="${openRows.has(r.id) ? "open" : ""} ${r.planId ? "made-here" : ""}"><td><input type="checkbox" data-s="${esc(r.id)}" ${sel.has(r.id) ? "checked" : ""}></td>
            <td><button class="sm" data-x="${esc(r.id)}" title="Show SKUs">${openRows.has(r.id) ? "▾" : "▸"}</button></td>
            <td><a href="${link}"><b class="mono">${esc(r.kind === "plan" ? (r.name || r.id) : r.id)}</b></a>${r.planId ? ` <span class="badge brand" title="Created in the Mr Miracle FBA System">Made here</span>` : ""}<div class="small faint" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.kind === "plan" ? "Draft · " + (r.created || "") : r.name)}</div></td>
            <td class="n">${fmtN(r.skus)}</td><td class="n">${fmtN(r.units)}</td>
            <td class="small">${r.from ? `<span class="faint">${esc(r.from.split(",")[0])} »</span> ` : ""}<b>${esc(r.destination || "—")}</b></td>
            <td><span class="badge ${ST_BADGE[r.status] || ""}">${esc(stLabel(r))}</span></td>
            <td class="n">${r.kind === "plan" ? "—" : `${pct}%`}</td>
            <td class="small" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.note || "")}">${esc(r.note || "")}</td>
            <td class="small">${esc(r.submittedBy || "")}</td>
            <td class="n">${r.boxes == null ? "—" : fmtN(r.boxes)}</td>
            <td>${r.boxed == null ? `<span class="faint small">—</span>` : `<div class="small">${fmtN(r.boxed)} / ${fmtN(r.units)}</div><div class="progress" style="height:5px;width:90px"><div style="width:${r.units ? Math.min(100, r.boxed / r.units * 100) : 0}%;background:${r.boxed >= r.units ? "var(--good)" : "var(--brand-2)"}"></div></div>`}</td>
            <td class="n">${r.shippingCost == null ? "—" : fmt$(r.shippingCost)}</td>
            <td><a class="btn sm" href="${link}">Details</a></td></tr>
            ${openRows.has(r.id) ? `<tr class="sub"><td></td><td colspan="13"><table class="t" style="background:var(--panel-2)"><thead><tr><th>SKU</th><th>ASIN</th><th>FNSKU</th><th>Product</th><th class="n">Shipped</th><th class="n">Received</th></tr></thead><tbody>
              ${r.items.map((x) => `<tr><td class="mono small">${esc(x.sku)}</td><td class="small">${esc(x.asin || "")}</td><td class="mono small">${esc(x.fnsku || "")}</td><td class="small" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.title || "")}</td><td class="n">${fmtN(x.shipped)}</td><td class="n">${fmtN(x.received)}</td></tr>`).join("") || `<tr><td colspan="6" class="faint">SKU lines are still loading from Amazon.</td></tr>`}
              </tbody></table></td></tr>` : ""}`;
        }).join("") || `<tr><td colspan="14" class="empty">${data.rows.length ? "No shipments match." : "Loading your shipments from Amazon — this runs in the background and takes a few minutes the first time."}</td></tr>`}
        </tbody></table></div>${rows.length > limit ? `<div class="row" style="padding:10px"><button id="more">Show more (${rows.length - limit} left)</button></div>` : ""}</div>`;

    $$("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; sel.clear(); draw(); });
    $("#q").oninput = debounce(() => { term = $("#q").value.toLowerCase(); draw(); const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250);
    $("#ftog").onclick = () => { $("#fbox").classList.toggle("hidden"); $("#fbox").dataset.open = $("#fbox").classList.contains("hidden") ? "0" : "1"; };
    $$("[data-f]").forEach((i) => i.onchange = () => { f[i.dataset.f] = i.value; draw(); });
    $("#fclear").onclick = () => { Object.keys(f).forEach((k) => f[k] = ""); draw(); };
    $$("[data-x]").forEach((b) => b.onclick = () => { const k = b.dataset.x; openRows.has(k) ? openRows.delete(k) : openRows.add(k); draw(); });
    $$("[data-s]").forEach((c) => c.onchange = () => { c.checked ? sel.add(c.dataset.s) : sel.delete(c.dataset.s); draw(); });
    $("#selall").onchange = () => { if ($("#selall").checked) rows.slice(0, limit).forEach((r) => sel.add(r.id)); else sel.clear(); draw(); };
    if ($("#more")) $("#more").onclick = () => { limit += 300; draw(); };
    $("#act").onclick = (e) => { e.stopPropagation(); $("#actmenu").classList.toggle("hidden"); };
    document.addEventListener("click", () => $("#actmenu")?.classList.add("hidden"), { once: true });
    $$("#actmenu [data-a]").forEach((b) => b.onclick = () => action(b.dataset.a, rows));
  };
  const reload = async () => { data = await GET("/ship/list"); draw(); };
  const newDraft = () => pasteBox(async (items) => {
    const r = await api("POST", "/ship/plans", { name: `Shipment ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, items });
    location.hash = "#/shipping?id=" + r.id;
  });
  const action = async (a, rows) => {
    $("#actmenu").classList.add("hidden");
    if (a === "draft") return newDraft();
    if (a === "import") {
      const m = modal(`<h2>Import shipment from Amazon</h2><p class="small muted">Enter one or more FBA shipment IDs (any separator). They're added to this list with their SKU lines and kept in sync.</p>
        <textarea id="ids" rows="3" placeholder="FBA19YKN00Q3"></textarea><div class="foot"><button data-close>Cancel</button><button class="primary" id="ok">Import</button></div>`);
      $("#ok", m.el).onclick = async () => {
        const ids = $("#ids", m.el).value.toUpperCase().split(/[^A-Z0-9]+/).filter((x) => /^FBA/.test(x));
        if (!ids.length) return toast("Enter a shipment ID starting with FBA.", true);
        let ok = 0; const errs = [];
        for (const id of ids) { try { await api("POST", "/ship/import", { shipmentId: id }); ok++; } catch (e) { errs.push(`${id}: ${e.message}`); } }
        m.close(); toast(`Imported ${ok} shipment${ok === 1 ? "" : "s"}${errs.length ? " · " + errs.join(" · ") : ""}`, !!errs.length); reload();
      };
      return;
    }
    if (a === "sku") {
      const m = modal(`<h2>Import a SKU from Amazon</h2><p class="small muted">Adds a product that isn't in the system yet (or refreshes it) straight from your Amazon listing.</p>
        <input id="sku" style="width:100%" placeholder="Exact seller SKU"><div class="foot"><button data-close>Cancel</button><button class="primary" id="ok">Import</button></div>`);
      $("#ok", m.el).onclick = async () => {
        try { const r = await api("POST", "/products/import-sku", { sku: $("#sku", m.el).value }); m.close(); productsCache = null; toast(`Imported ${r.product.sku} (${r.product.asin || "no ASIN"})`); }
        catch (e) { toast(e.message, true); }
      };
      return;
    }
    if (a === "cost") {
      const m = modal(`<h2>Shipping cost for ${sel.size} shipment${sel.size === 1 ? "" : "s"}</h2><label class="f">Cost per shipment ($) — leave empty to clear<input id="c" type="number" step="0.01"></label>
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="ok">Save</button></div>`);
      $("#ok", m.el).onclick = async () => { await api("POST", "/ship/costs", { ids: [...sel], cost: $("#c", m.el).value }); m.close(); toast("Saved"); reload(); };
      return;
    }
    if (a === "exp") {
      return downloadCsv(`shipments-${todayLA()}.csv`, ["Shipment ID", "Name", "Status", "Created", "Ship from", "Destination", "SKUs", "Units", "Received", "Received %", "Boxes", "Qty boxed", "Shipping cost", "Value", "Submitted by", "Note", "Box content source"],
        rows.map((r) => [r.kind === "plan" ? r.name : r.id, r.name, stLabel(r), r.created, r.from, r.destination, r.skus, r.units, r.received, r.units ? Math.round(r.received / r.units * 1000) / 10 : "", r.boxes ?? "", r.boxed ?? "", r.shippingCost ?? "", r.value ? Math.round(r.value * 100) / 100 : "", r.submittedBy, r.note, r.boxSource || ""]));
    }
    if (a === "expd") {
      const out = [];
      for (const r of rows) for (const x of r.items) out.push([r.kind === "plan" ? r.name : r.id, r.name, stLabel(r), r.created, r.destination, x.sku, x.asin || "", x.fnsku || "", x.title || "", x.shipped, x.received, x.price ?? "", x.price ? Math.round(x.price * x.shipped * 100) / 100 : ""]);
      return downloadCsv(`shipment-details-${todayLA()}.csv`, ["Shipment ID", "Name", "Status", "Created", "Destination", "SKU", "ASIN", "FNSKU", "Product", "Qty shipped", "Qty received", "Price", "Value"], out);
    }
    if (a === "sync") { await api("POST", "/ship/sync", {}); toast("Syncing with Amazon — refresh in a minute."); }
  };
  if ($("#plan")) $("#plan").onclick = newDraft;
  draw();
};

async function fbaShipmentPage(el, sid) {
  let r;
  try { r = await GET(`/ship/fba/${encodeURIComponent(sid)}`); }
  catch (e) { el.innerHTML = header(esc(sid)) + `<div class="banner bad"><div class="txt">${esc(e.message)}</div></div><a class="btn" href="#/shipping">← All shipments</a>`; return; }
  const pct = r.units ? Math.round(r.received / r.units * 1000) / 10 : 0;
  el.innerHTML = header(esc(r.id), `${esc(r.name)} · <span class="badge ${ST_BADGE[r.status] || ""}">${esc(stLabel(r))}</span>`,
    `<a class="btn" href="#/shipping">← All shipments</a>${canShip() ? `<button id="note">Note</button><button id="cost">Shipping cost</button>` : ""}<button id="ul">FNSKU labels (Letter)</button>`) + `
    <div class="card sumbar"><div class="sumgrid">
      <div><div class="sm-k">Shipment ID</div><div class="sm-v mono">${esc(r.id)}</div><div class="sm-k">Shipment name</div><div class="sm-v">${esc(r.name)}</div><div class="sm-k">Shipping cost</div><div class="sm-v">${r.shippingCost == null ? "—" : fmt$(r.shippingCost)}</div></div>
      <div><div class="sm-k">Ship from</div><div class="sm-v">${esc(r.from || "—")}</div><div class="sm-k">Deduct from</div><div class="sm-v faint">— (coming with stock system)</div></div>
      <div><div class="sm-k">Ship to</div><div class="sm-v"><b>${esc(r.destination || "—")}</b></div><div class="sm-k">Created</div><div class="sm-v">${esc(r.created || "—")}</div></div>
      <div class="sm-tbl"><div class="sm-k" style="grid-column:1/-1">Shipment content</div><span>SKUs</span><b>${fmtN(r.skus)}</b><span>Units</span><b>${fmtN(r.units)}</b><span>Received</span><b>${fmtN(r.received)} (${pct}%)</b><span>Total value</span><b>${fmt$(r.value)}</b></div>
      <div class="sm-tbl"><span>Label prep</span><b>${esc((r.labelPrep || "").replace(/_/g, " ").toLowerCase())}</b><span>Box content</span><b>${esc((r.boxSource || "").toLowerCase())}</b><span>Submitted by</span><b>${esc(r.submittedBy || "—")}</b><span>Note</span><b>${esc(r.note || "")}</b></div>
    </div></div>
    <div class="card flush"><div class="card-h"><h2>SKUs</h2></div><div id="t"></div></div>`;
  table($("#t"), [
    { k: "sku", l: "Product", f: (x) => prodCell({ sku: x.sku, asin: x.asin, title: x.title }), cls: "prod" },
    { k: "fnsku", l: "FNSKU", f: (x) => `<span class="mono">${esc(x.fnsku || "")}</span>` },
    { k: "shipped", l: "Shipped", n: 1, f: (x) => fmtN(x.shipped) },
    { k: "received", l: "Received", n: 1, f: (x) => `<span class="${x.received >= x.shipped ? "good" : x.received ? "warn" : ""}">${fmtN(x.received)}</span>` },
    { k: "diff", l: "Difference", n: 1, f: (x) => x.received - x.shipped ? `<span class="bad">${fmtN(x.received - x.shipped)}</span>` : "0", sort: (x) => x.received - x.shipped },
    { k: "lab", l: "", noSort: 1, f: (x) => `<button class="sm" data-lab="${esc(x.sku)}" data-q="${x.shipped}">FNSKU labels</button>` },
  ], r.items, { sort: "shipped", tall: false, after: (t) => $$("[data-lab]", t).forEach((b) => b.onclick = () => window.open(`/api/labels/units?sku=${encodeURIComponent(b.dataset.lab)}&qty=${b.dataset.q}&type=letter`, "_blank")) });
  $("#ul").onclick = () => r.items.forEach((x, i) => setTimeout(() => window.open(`/api/labels/units?sku=${encodeURIComponent(x.sku)}&qty=${x.shipped}&type=letter`, "_blank"), i * 400));
  const edit = (k, label, cur, isNum) => {
    const m = modal(`<h2>${label}</h2>${isNum ? `<input id="v" type="number" step="0.01" style="width:100%" value="${cur ?? ""}">` : `<textarea id="v" rows="4">${esc(cur || "")}</textarea>`}<div class="foot"><button data-close>Cancel</button><button class="primary" id="ok">Save</button></div>`);
    $("#ok", m.el).onclick = async () => { await api("PUT", `/ship/fba/${encodeURIComponent(sid)}`, { [k]: $("#v", m.el).value }); m.close(); fbaShipmentPage(el, sid); };
  };
  if ($("#note")) $("#note").onclick = () => edit("note", "Note", r.note);
  if ($("#cost")) $("#cost").onclick = () => edit("shippingCost", "Shipping cost ($)", r.shippingCost, true);
}

async function shipPlanPage(el, id) {
  let p = await GET(`/ship/plans/${id}`);
  const defaults = await GET("/ship/defaults").catch(() => ({}));
  const run = async (action, args, confirmTitle, confirmHtml, okLabel) => {
    if (confirmTitle && !await confirmBox(confirmTitle, confirmHtml, okLabel)) return;
    try { p = await shipStep(id, action, args); toast("Done"); }
    catch (e) { toast(e.message.split("\n")[0], true); p = await GET(`/ship/plans/${id}`); }
    render();
  };
  const labelUrl = (sid, kind) => `/api/ship/plans/${id}/labels?shipmentId=${encodeURIComponent(sid)}&kind=${kind}`;
  const render = async () => {
    const cur = STATUS_STEP[p.status] || "plan";
    const curIdx = SHIP_STEPS.findIndex(([k]) => k === cur);
    const [sl, sc] = STATUS_LABEL[p.status] || [p.status, ""];
    const d = p.data || {};
    const units = p.items.reduce((s, i) => s + i.qty, 0);
    const fbaIds = (d.shipments || []).map((x) => x.confirmationId).filter(Boolean);
    el.innerHTML = header(esc(fbaIds.length ? fbaIds.join(" + ") : p.name), `${fbaIds.length && p.name !== fbaIds.join(" + ") ? esc(p.name) + " · " : ""}<span class="badge ${sc}">${sl}</span> · ${p.items.length} products · ${fmtN(units)} units · target <b>${esc((d.target?.warehouses || [d.target?.warehouse || "HEA2"]).join(", "))}</b>${p.inbound_plan_id ? ` · <a target="_blank" rel="noopener" href="https://sellercentral.amazon.com/fba/sendtoamazon?wf=${encodeURIComponent(p.inbound_plan_id)}">Seller Central</a>` : ""}`,
      `<a class="btn" href="#/shipping">← All shipments</a><button id="pick">Pick list</button><button id="ul">FNSKU labels (Letter)</button>
       ${canSpend() && p.status !== "cancelled" && p.inbound_plan_id ? `<button class="danger" id="cancel">Cancel in Amazon</button>` : ""}
       ${canSpend() && (p.status === "draft" || p.status === "cancelled") ? `<button class="danger" id="del">Delete</button>` : ""}`) + `
      <div id="sumbar"></div>
      <div class="steps">${SHIP_STEPS.map(([k, l], i) => `<span class="st ${p.status === "cancelled" ? "" : i < curIdx || p.status === "confirmed" ? "done" : i === curIdx ? "cur" : ""}">${l}</span>`).join("")}</div>
      ${p.last_error ? `<div class="banner bad"><div class="txt" style="white-space:pre-wrap"><b>Amazon reported a problem:</b>\n${esc(p.last_error)}</div></div>` : ""}
      <div id="stepbox"></div>
      <div class="card flush"><div class="card-h"><h2>Products</h2>${p.status === "draft" && canShip() ? `<button id="paste">Paste more lines</button>` : ""}</div><div id="items"></div></div>`;
    drawSummary();
    const editable = p.status === "draft" && canShip();
    table($("#items"), [
      { k: "sku", l: "Product", f: (i) => prodCell({ ...i, asin: i.asin || i.cur_asin }), cls: "prod" },
      { k: "fnsku", l: "FNSKU", f: (i) => `<span class="mono">${esc(i.fnsku || i.cur_fnsku || "")}</span>` },
      { k: "fulfillable", l: "Sellable in FBA", n: 1, f: (i) => fmtN(i.fulfillable) },
      { k: "box", l: "Usual box", f: (i) => i.units_per_box ? `<span class="small">${i.units_per_box}/box · ${i.length}×${i.width}×${i.height} in · ${i.weight} lb</span>` : `<span class="faint small">—</span>` },
      { k: "qty", l: "Qty", n: 1, f: (i) => editable ? `<input class="w-num" type="number" min="0" data-q="${esc(i.sku)}" value="${i.qty}">` : `<b>${fmtN(i.qty)}</b>` },
      { k: "lab", l: "FNSKU labels", noSort: 1, f: (i) => `<button class="sm" data-lab="${esc(i.sku)}">Print ${fmtN(i.qty)}</button>` },
      { k: "x", l: "", noSort: 1, f: (i) => editable ? `<button class="sm danger" data-rm="${esc(i.sku)}">Remove</button>` : "" },
    ], p.items, {
      sort: "sku", dir: 1, tall: false, after: (t) => {
        $$("[data-lab]", t).forEach((b) => b.onclick = () => window.open(`/api/ship/plans/${id}/unit-labels?sku=${encodeURIComponent(b.dataset.lab)}&type=letter`, "_blank"));
        $$("[data-q]", t).forEach((i) => i.onchange = () => saveItems(p.items.map((x) => ({ sku: x.sku, qty: x.sku === i.dataset.q ? Number(i.value) : x.qty }))));
        $$("[data-rm]", t).forEach((b) => b.onclick = () => saveItems(p.items.filter((x) => x.sku !== b.dataset.rm).map((x) => ({ sku: x.sku, qty: x.qty }))));
      },
    });
    const saveItems = async (items) => { try { p = await api("PUT", `/ship/plans/${id}/items`, { items }); render(); } catch (e) { toast(e.message, true); } };
    if ($("#paste")) $("#paste").onclick = () => pasteBox(async (add) => {
      const m = new Map(p.items.map((x) => [x.sku, x.qty]));
      for (const a of add) m.set(a.sku, (m.get(a.sku) || 0) + a.qty);
      await saveItems([...m].map(([sku, qty]) => ({ sku, qty })));
    }, "Add products", "Add to shipment");
    $("#ul").onclick = () => window.open(`/api/ship/plans/${id}/unit-labels?type=letter`, "_blank");
    $("#pick").onclick = () => {
      const w = window.open("", "_blank");
      w.document.write(`<!doctype html><title>Pick list – ${esc(p.name)}</title><style>body{font:13px Arial;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}td.n{text-align:right;font-weight:bold;font-size:15px}.b{width:24px}</style>
        <h2>${esc(p.name)}</h2><p>${p.items.length} products · ${fmtN(units)} units · printed ${new Date().toLocaleString()}</p>
        <table><tr><th class="b">✓</th><th>SKU</th><th>ASIN</th><th>FNSKU</th><th>Product</th><th>Usual box</th><th>Qty</th></tr>
        ${p.items.map((i) => `<tr><td></td><td>${esc(i.sku)}</td><td>${esc(i.asin || "")}</td><td>${esc(i.fnsku || "")}</td><td>${esc(i.title || "")}</td><td>${i.units_per_box ? `${i.units_per_box}/box` : ""}</td><td class="n">${i.qty}</td></tr>`).join("")}
        </table><script>window.print()<\/script>`);
      w.document.close();
    };
    if ($("#cancel")) $("#cancel").onclick = () => run("cancel", {}, "Cancel this shipment in Amazon?", "The inbound plan and its shipments are cancelled in Seller Central. This can't be undone.", "Cancel shipment");
    if ($("#del")) $("#del").onclick = async () => {
      if (!await confirmBox("Delete this shipment?", "It's removed from this system.", "Delete")) return;
      await api("DELETE", `/ship/plans/${id}`); location.hash = "#/shipping";
    };
    const box = $("#stepbox");
    if (p.status === "draft" || p.status === "creating") drawPlan(box, d);
    else if (p.status === "targeting" || p.status === "found") drawFind(box, d);
    else if (p.status === "boxes") drawBoxes(box, d);
    else if (p.status === "freight") drawFreight(box, d);
    else drawDone(box, d);
  };

  // ---- summary bar (collapsible, like 9Yard) ----
  const drawSummary = () => {
    const d = p.data || {};
    let open = (() => { try { return localStorage.getItem("mm-shipsum") !== "0"; } catch { return true; } })();
    const info = Object.fromEntries(p.items.map((i) => [i.sku, i]));
    const lbs = (i) => i.unit_weight == null ? null : /ounce|oz/i.test(i.weight_unit || "") ? i.unit_weight / 16 : /kilo|kg/i.test(i.weight_unit || "") ? i.unit_weight * 2.20462 : i.unit_weight;
    const cuin = (i) => i.u_long && i.u_med && i.u_short ? i.u_long * i.u_med * i.u_short * (/cent|cm/i.test(i.dim_unit || "") ? 0.0610237 : 1) : null;
    const prepBy = (() => { const o = Object.values(d.itemOwners || {}).map((x) => x.prepOwner); if (!o.length) return "—"; const u = [...new Set(o)]; return u.length > 1 ? "Mixed" : ({ SELLER: "Seller", NONE: "None", AMAZON: "Amazon" }[u[0]] || u[0]); })();
    const shipments = (d.shipments || []).length ? d.shipments : [null];
    const addr = (a) => a ? [esc(a.name || ""), esc([a.addressLine1, a.addressLine2].filter(Boolean).join(" ")), esc([a.city, a.stateOrProvinceCode, a.postalCode].filter(Boolean).join(", ")), esc(a.countryCode || "")].filter(Boolean).join("<br>") : "—";
    const kv = (k, v, edit) => `<div class="sm-k">${k}${edit ? ` <a href="javascript:void 0" class="sm-edit" data-edit="${edit}">EDIT</a>` : ""}</div><div class="sm-v">${v}</div>`;
    const block = (sh) => {
      const items = sh ? (sh.items || []).map((x) => ({ ...info[x.msku], sku: x.msku, qty: x.quantity })) : p.items.map((i) => ({ ...i }));
      const units = items.reduce((a, x) => a + (x.qty || 0), 0);
      const known = (f) => items.every((x) => f(x) != null);
      const skuW = items.reduce((a, x) => a + (lbs(x) || 0) * x.qty, 0);
      const cuft = items.reduce((a, x) => a + (cuin(x) || 0) * x.qty, 0) / 1728;
      const value = items.reduce((a, x) => a + (x.price || 0) * x.qty, 0);
      const boxes = sh ? (d.boxList?.[sh.shipmentId] || []) : [];
      const boxW = boxes.reduce((a, b) => a + (Number(b.weight) || 0), 0);
      const chosen = sh ? (sh.transportOptions || []).find((o) => o.transportationOptionId === sh.selected) : null;
      const shipPrice = d.shippingPrice ?? chosen?.cost ?? null;
      const fee = d.placementFee ?? null;
      return `<div class="sumgrid">
        <div>${kv("Shipment name", esc(sh?.name || p.name), "name")}${kv("Shipment ID", esc(sh?.confirmationId || "—"))}${kv("Amazon reference ID", esc(sh?.amazonReferenceId || "—"))}${kv("Shipping price", fmt$(shipPrice ?? 0), "price")}</div>
        <div>${kv("Ship from", addr(p.address))}${kv("Deduct from", `<span class="faint" title="Comes with the stock system">— (coming with stock system)</span>`)}</div>
        <div>${kv("Ship to", sh ? `<b>${esc(sh.warehouse || "")}</b><br>${addr(sh.destAddress)}` : `<span class="faint">Not assigned yet — Amazon picks the warehouse in step 2</span>`)}</div>
        <div class="sm-tbl">
          <div class="sm-k" style="grid-column:1/-1">Shipment content</div>
          <span>SKUs</span><b>${fmtN(items.length)}</b><span>Units</span><b>${fmtN(units)}</b>
          <span>Boxes</span><b>${fmtN(boxes.length)}</b>
          <span>SKU weight (lbs)</span><b>${known(lbs) ? fmtN(skuW, 2) : skuW ? fmtN(skuW, 2) + "*" : "—"}</b>
          <span>Box weight (lbs)</span><b>${fmtN(boxW, 2)}</b>
          <span>Received qty</span><b>${sh?.receivedTotal != null ? fmtN(sh.receivedTotal) : "0"}</b>
          <span>Cu ft / CBM</span><b>${cuft ? `${fmtN(cuft, 2)} / ${fmtN(cuft * 0.0283168, 2)}` : "—"}</b>
          <span>Total value</span><b>${fmt$(value)}</b>
          <span>Placement fee</span><b>${fee != null ? fmt$(fee) : "—"}</b>
        </div>
        <div class="sm-tbl">
          <span>Storage type</span><b>Standard</b>
          <span>Created on</span><b>${p.created_at ? new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</b>
          <span>Created by</span><b>${esc(p.created_by || "—")}</b>
          <span>Prep by</span><b>${prepBy}</b>
          <span>Box content source</span><b>${boxes.some((b) => b.printed) ? "2D barcode" : "Interactive"}</b>
          <span>Note</span><b>${d.note ? esc(d.note) : ""} <a href="javascript:void 0" class="sm-edit" data-edit="note">EDIT</a></b>
          <span>Attachments</span><b class="faint">No files yet (coming soon)</b>
          <span>Ignore until</span><b><input type="date" disabled title="Coming soon" style="padding:2px 4px"></b>
        </div></div>`;
    };
    $("#sumbar").innerHTML = `<div class="sumbar card ${open ? "" : "closed"}">
      <div class="row between"><b class="small muted" style="letter-spacing:.04em;text-transform:uppercase">Shipment summary${shipments.length > 1 ? ` · ${shipments.length} shipments` : ""}</b>
        <button class="sm" id="sumtog">${open ? "Hide summary ▲" : "Show summary ▼"}</button></div>
      ${open ? shipments.map((sh, i) => `${i ? '<hr class="sep">' : ""}${block(sh)}`).join("") : ""}</div>`;
    $("#sumtog").onclick = () => { try { localStorage.setItem("mm-shipsum", open ? "0" : "1"); } catch {} drawSummary(); };
    $$("#sumbar [data-edit]").forEach((a) => a.onclick = async () => {
      if (!canShip()) return toast("View only.", true);
      const k = a.dataset.edit;
      const cur = k === "name" ? p.name : k === "note" ? (d.note || "") : (d.shippingPrice ?? "");
      const m = modal(`<h2>${k === "name" ? "Shipment name" : k === "note" ? "Note" : "Shipping price ($)"}</h2>
        ${k === "note" ? `<textarea id="sv" rows="5">${esc(cur)}</textarea>` : `<input id="sv" style="width:100%" ${k === "price" ? 'type="number" step="0.01"' : ""} value="${esc(cur)}">`}
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="sok">Save</button></div>`);
      $("#sok", m.el).onclick = async () => {
        const v = $("#sv", m.el).value;
        try {
          await api("PUT", `/ship/plans/${id}`, k === "name" ? { name: v } : k === "note" ? { note: v } : { shippingPrice: v });
          p = await GET(`/ship/plans/${id}`); m.close(); render();
        } catch (e) { toast(e.message, true); }
      };
    });
  };

  // ---- 1. plan ----
  const drawPlan = async (box, d) => {
    if (!canSpend()) { box.innerHTML = `<div class="card small muted">A manager or admin sends this to Amazon.</div>`; return; }
    const a = { countryCode: "US", ...(p.address || defaults.address || {}) };
    const t = { ...(defaults.target || {}), ...(d.target || {}) };
    let wanted = [...(t.warehouses || ["HEA2"])];
    const known = defaults.warehouses || [];
    const recent = defaults.recentAddresses || [];
    let prepDefault = d.prepDefault || defaults.prepDefault || "NONE";
    const overrides = { ...(d.ownerOverrides || {}) };
    const F = [["name", "Name / contact"], ["companyName", "Company"], ["addressLine1", "Street"], ["addressLine2", "Street line 2"], ["city", "City"],
      ["stateOrProvinceCode", "State / province"], ["postalCode", "ZIP / postal code"], ["countryCode", "Country (2 letters)"], ["phoneNumber", "Phone"], ["email", "Email"]];
    const addrLabel = (x) => [x.addressLine1, x.city, x.stateOrProvinceCode, x.postalCode, x.countryCode].filter(Boolean).join(", ");
    box.innerHTML = `<div class="card"><h2>Warehouses you'll accept</h2>
        <div class="row" id="whsel" style="gap:6px"></div>
        <div class="row" style="margin-top:10px;gap:6px"><span class="small muted">Your warehouses (shipments in the last year):</span><span id="whknown" class="row" style="gap:6px"></span></div>
        <div class="filters" style="margin-top:10px">
          <label class="f">Add another code<input id="whadd" placeholder="e.g. ABE8" style="width:120px;text-transform:uppercase"></label><button id="whaddb">Add</button>
          <label class="f">Accept<select id="tm"><option value="all" ${t.match !== "partial" ? "selected" : ""}>Everything to these warehouses</option><option value="partial" ${t.match === "partial" ? "selected" : ""}>At least part to these warehouses</option></select></label>
          <label class="f">Re-check every<select id="th">${[1, 2, 3, 4, 6, 8, 12, 24].map((h) => `<option value="${h}" ${Number(t.everyHours || 2) === h ? "selected" : ""}>${h} hour${h > 1 ? "s" : ""}</option>`).join("")}</select></label>
          <label class="f">Max placement fee ($, optional)<input id="tf" type="number" step="0.01" value="${t.maxFee ?? ""}" style="width:120px"></label></div></div>
      <div class="card"><div class="card-h"><h2>Ship from</h2>${recent.length ? `<label class="row small muted" style="gap:6px">Use a recent address<select id="recent"><option value="">—</option>${recent.map((x, i) => `<option value="${i}">${esc(addrLabel(x))}</option>`).join("")}</select></label>` : ""}</div>
        <div class="form-grid">${F.map(([k, l]) => `<label class="f">${l}<input data-a="${k}" value="${esc(a[k] || "")}"></label>`).join("")}</div>
        <p class="small muted" style="margin-bottom:0">Every field can be changed. Amazon checks the address when the plan is created; if it's rejected, its exact message shows at the top of this page.</p></div>
      <div class="card"><div class="card-h"><h2>Prep & labels</h2>
        <label class="row small" style="gap:6px">When Amazon lets you choose:<select id="pd"><option value="NONE" ${prepDefault === "NONE" ? "selected" : ""}>No prep required</option><option value="SELLER" ${prepDefault === "SELLER" ? "selected" : ""}>Seller does prep</option></select></label></div>
        <p class="small muted" style="margin-top:-4px">Amazon sets a fixed rule for many products (shown with a lock) — those are applied automatically so the plan isn't rejected. You can change the others.</p>
        <div id="preptbl"><div class="loading"><span class="spinner"></span> Asking Amazon for each product's prep rules…</div></div></div>
      <div class="card row between"><span class="small muted">Creates the "Send to Amazon" plan and starts looking for <b id="whsum"></b>. Nothing is charged at this step.</span>
        <button class="primary" id="create">${p.inbound_plan_id ? "Continue in Amazon →" : "Create in Amazon & find warehouse →"}</button></div>`;
    const drawWh = () => {
      $("#whsel").innerHTML = wanted.length ? wanted.map((w) => `<span class="chip" style="font-size:13px">${esc(w)}<button type="button" data-rmw="${esc(w)}" title="Remove">×</button></span>`).join("") : `<span class="small bad">Pick at least one warehouse</span>`;
      $("#whknown").innerHTML = known.map((k) => `<button class="sm ${wanted.includes(k.code) ? "primary" : ""}" data-tgw="${esc(k.code)}">${esc(k.code)} <span class="faint">${k.shipments}</span></button>`).join("") || `<span class="small faint">loading…</span>`;
      $("#whsum").textContent = wanted.join(", ") || "—";
      $$("[data-rmw]").forEach((b) => b.onclick = () => { wanted = wanted.filter((x) => x !== b.dataset.rmw); drawWh(); });
      $$("[data-tgw]").forEach((b) => b.onclick = () => { const c = b.dataset.tgw; wanted = wanted.includes(c) ? wanted.filter((x) => x !== c) : [...wanted, c]; drawWh(); });
    };
    drawWh();
    $("#whaddb").onclick = () => { const c = $("#whadd").value.trim().toUpperCase(); if (c && !wanted.includes(c)) wanted.push(c); $("#whadd").value = ""; drawWh(); };
    if ($("#recent")) $("#recent").onchange = () => {
      const x = recent[Number($("#recent").value)]; if (!x) return;
      $$("[data-a]").forEach((i) => { i.value = x[i.dataset.a] || ""; });
    };
    const OWN = { SELLER: "Seller", NONE: "None", AMAZON: "Amazon" };
    const loadPrep = async () => {
      $("#preptbl").innerHTML = `<div class="loading"><span class="spinner"></span> Asking Amazon for each product's prep rules…</div>`;
      let o;
      try { o = await GET(`/ship/plans/${id}/prep?default=${prepDefault}`); }
      catch (e) { $("#preptbl").innerHTML = `<div class="banner warn"><div class="txt">Couldn't load prep rules: ${esc(e.message)}</div></div>`; return; }
      for (const [sku, ov] of Object.entries(overrides)) if (o[sku]) { if (!o[sku].prepFixed && ov.prepOwner) o[sku].prepOwner = ov.prepOwner; if (!o[sku].labelFixed && ov.labelOwner) o[sku].labelOwner = ov.labelOwner; }
      const sel = (sku, kind, v, fixed) => fixed ? `<span title="Fixed by Amazon">🔒 ${OWN[v] || v}</span>`
        : `<select data-own="${esc(sku)}" data-kind="${kind}">${["NONE", "SELLER", "AMAZON"].map((x) => `<option value="${x}" ${x === v ? "selected" : ""}>${OWN[x]}</option>`).join("")}</select>`;
      $("#preptbl").innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>Prep needed</th><th>Prep by</th><th>Labels by</th><th></th></tr></thead><tbody>
        ${p.items.map((i) => { const x = o[i.sku] || {}; return `<tr><td class="mono small">${esc(i.sku)}</td><td class="small">${x.prepTypes?.length ? x.prepTypes.map((t) => esc(t.replace(/^ITEM_/, "").replace(/_/g, " ").toLowerCase())).join(", ") : '<span class="faint">none</span>'}</td>
          <td>${sel(i.sku, "prepOwner", x.prepOwner, x.prepFixed)}</td><td>${sel(i.sku, "labelOwner", x.labelOwner, x.labelFixed)}</td>
          <td class="small faint">${x.mustMatch ? "prep & label must be the same" : ""}${x.known === false ? "Amazon has no rule on file" : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
      $$("[data-own]").forEach((s) => s.onchange = () => { overrides[s.dataset.own] = { ...(overrides[s.dataset.own] || {}), [s.dataset.kind]: s.value }; });
    };
    $("#pd").onchange = () => { prepDefault = $("#pd").value; loadPrep(); };
    loadPrep();
    $("#create").onclick = () => {
      if (!wanted.length) return toast("Pick at least one warehouse.", true);
      const address = Object.fromEntries($$("[data-a]").map((i) => [i.dataset.a, i.value.trim()]));
      address.countryCode = (address.countryCode || "US").toUpperCase();
      const target = { warehouses: wanted, match: $("#tm").value, everyHours: Number($("#th").value), maxFee: $("#tf").value === "" ? null : Number($("#tf").value) };
      run("create", { address, target, prepDefault, owners: overrides });
    };
  };

  // ---- 2. find warehouse ----
  const drawFind = (box, d) => {
    const t = d.target || {};
    const opts = (d.placementOptions || []).slice().sort((a, b) => (b.matchesTarget ? 1 : 0) - (a.matchesTarget ? 1 : 0) || optFee(a) - optFee(b));
    const found = p.status === "found";
    box.innerHTML = `<div class="card" style="border-color:${found ? "var(--good)" : "var(--line)"}"><div class="row between">
        <div>${found ? `<h2 class="good" style="margin:0">✓ A warehouse you want is available</h2>` : `<h2 style="margin:0">Looking for ${esc((t.warehouses || [t.warehouse]).join(", "))}${d.paused ? " (paused)" : ""}</h2>`}
          <div class="small muted">${t.match === "partial" ? "Accepting options with part of the shipment there" : "Waiting for everything to go there"}${t.maxFee != null ? ` · fee up to ${fmt$(t.maxFee)}` : ""} · checked ${fmtN(d.checks || 0)} time${d.checks === 1 ? "" : "s"}, last ${ago(d.lastCheck)}${!found && d.nextCheck && !d.paused ? ` · next check ${dt(d.nextCheck)}` : ""}</div></div>
        ${canSpend() ? `<div class="row"><button id="chk">Check now</button><button id="edt">Change target</button>${!found ? `<button id="pause">${d.paused ? "Resume" : "Pause"}</button>` : ""}</div>` : ""}</div>
      ${(d.history || []).length ? `<div class="small faint" style="margin-top:8px">Recent offers: ${(d.history || []).slice(-6).reverse().map((h) => `${dt(h.at)} → ${esc(h.offered || "?")}${h.match ? " ✓" : ""}`).join(" · ")}</div>` : ""}</div>
      <div class="card"><h2>Warehouse options from Amazon</h2>
      ${opts.map((o) => `<div class="card" style="padding:12px;margin:8px 0;${o.matchesTarget ? "border-color:var(--good);box-shadow:inset 4px 0 0 var(--good)" : ""}"><div class="row between">
          <div><b>${(o.shipmentIds || []).length} shipment${(o.shipmentIds || []).length === 1 ? "" : "s"}</b> ${o.matchesTarget ? `<span class="badge good">matches your warehouses</span>` : ""}
            <div class="small" style="margin-top:4px">${(o.destinations || []).map((x) => `<span class="badge ${(t.warehouses || [t.warehouse]).includes(String(x.warehouse).toUpperCase()) ? "good" : ""}">${esc(x.warehouse || "?")}</span> ${esc(x.city || "")} ${esc(x.state || "")}${x.units ? ` — ${fmtN(x.units)} units` : ""}`).join(" &nbsp; ")}</div>
            ${o.expiration ? `<div class="small faint">offer expires ${dt(Date.parse(o.expiration))}</div>` : ""}</div>
          <div class="row"><b class="${optFee(o) > 0 ? "warn" : "good"}">Placement fee ${fmt$(optFee(o))}</b>${canSpend() ? `<button class="${o.matchesTarget ? "primary" : ""}" data-conf="${esc(o.placementOptionId)}">Confirm this</button>` : ""}</div></div></div>`).join("") || `<p class="muted">No options yet — press Check now.</p>`}</div>`;
    if (!canSpend()) return;
    $("#chk").onclick = () => run("check");
    if ($("#pause")) $("#pause").onclick = () => run("target", { paused: !d.paused });
    $("#edt").onclick = () => {
      const m = modal(`<h2>Target warehouse</h2><div class="form-grid">
        <label class="f" style="grid-column:1/-1">Warehouse codes (comma separated)<input id="tw" value="${esc((t.warehouses || [t.warehouse]).join(", "))}"></label>
        <label class="f">Accept<select id="tm"><option value="all">Everything to this warehouse</option><option value="partial" ${t.match === "partial" ? "selected" : ""}>At least part</option></select></label>
        <label class="f">Re-check every (hours)<input id="th" type="number" min="1" value="${t.everyHours}"></label>
        <label class="f">Max placement fee ($)<input id="tf" type="number" step="0.01" value="${t.maxFee ?? ""}"></label></div>
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="ok">Save</button></div>`);
      $("#ok", m.el).onclick = () => { m.close(); run("target", { target: { warehouses: $("#tw", m.el).value.toUpperCase().split(/[\s,]+/).filter(Boolean), match: $("#tm", m.el).value, everyHours: Number($("#th", m.el).value) || 2, maxFee: $("#tf", m.el).value === "" ? null : Number($("#tf", m.el).value) } }); };
    };
    $$("[data-conf]").forEach((b) => b.onclick = () => {
      const o = opts.find((x) => x.placementOptionId === b.dataset.conf);
      run("placement_confirm", { placementOptionId: o.placementOptionId }, "Confirm warehouses?",
        `<p>Ship to: <b>${(o.destinations || []).map((x) => esc(x.warehouse)).join(", ")}</b></p><p>Amazon charges a placement fee of <b>${fmt$(optFee(o))}</b>. This creates the FBA shipment${(o.shipmentIds || []).length > 1 ? "s" : ""} and can't be changed afterwards.</p>`, `Confirm — ${fmt$(optFee(o))}`);
    });
  };

  // ---- 3. boxes: products on the left, numbered boxes on the right, 2D labels printed here ----
  const itemInfo = Object.fromEntries(p.items.map((i) => [i.sku, i]));
  const drawBoxes = async (box, d) => {
    let shipments = d.shipments || [];
    // shipments confirmed before this version lack the label data: fetch it once
    if (shipments.some((s) => !s.confirmationId || !s.destAddress)) {
      box.innerHTML = `<div class="card loading"><span class="spinner"></span> Getting shipment details from Amazon…</div>`;
      try { p = await api("POST", `/ship/plans/${id}/step`, { action: "refresh" }); d = p.data; shipments = d.shipments || []; } catch (e) { toast(e.message, true); }
    }
    const boxList = d.boxList || {};
    d.boxList = boxList; // shared with the summary bar
    for (const s of shipments) boxList[s.shipmentId] = boxList[s.shipmentId] || [];
    let cur = 0;                      // shipment tab
    const sel = new Set();            // selected box indexes (current shipment)
    let fmt = (() => { try { const f = localStorage.getItem("mm-labelfmt"); return f === "4x6" ? "4x6" : "6up"; } catch { return "6up"; } })();
    // 6-per-page sheet geometry (inches); defaults: 4" wide × 3.75" tall labels, 2 across × 3 down
    const SHEET0 = { w: 4, h: 3.75, top: 0, left: 0.25, gapX: 0, gapY: 0, start: 1 };
    let sheet = (() => { try { return { ...SHEET0, ...JSON.parse(localStorage.getItem("mm-sheet") || "{}"), start: 1 }; } catch { return { ...SHEET0 }; } })();
    const asinOf = (s, msku) => (s.items || []).find((x) => x.msku === msku)?.asin || itemInfo[msku]?.asin || itemInfo[msku]?.cur_asin || msku;
    const fnskuOf = (s, msku) => (s.items || []).find((x) => x.msku === msku)?.fnsku || itemInfo[msku]?.fnsku || itemInfo[msku]?.cur_fnsku || "";
    const boxedOf = (s, msku) => boxList[s.shipmentId].reduce((a, b) => a + (b.items.find((x) => x.msku === msku)?.qty || 0), 0);
    const save = debounce(async () => { try { await api("PUT", `/ship/plans/${id}`, { boxList }); } catch (e) { toast("Not saved: " + e.message, true); } }, 600);
    const changed = () => { save(); draw(); drawSummary(); };
    const lastDims = () => { const L = boxList[shipments[cur].shipmentId]; const b = [...L].reverse().find((x) => x.length); return b ? { length: b.length, width: b.width, height: b.height, weight: b.weight } : {}; };

    const draw = () => {
      const s = shipments[cur];
      if (!s) { box.innerHTML = `<div class="card">No shipments.</div>`; return; }
      const L = boxList[s.shipmentId];
      const total = (s.items || []).reduce((a, x) => a + x.quantity, 0), boxedAll = (s.items || []).reduce((a, x) => a + boxedOf(s, x.msku), 0);
      const allBoxed = shipments.every((sh) => (sh.items || []).every((x) => boxedOf(sh, x.msku) === x.quantity));
      const emptyBox = shipments.some((sh) => boxList[sh.shipmentId].some((b) => !b.items.length));
      const missingDims = shipments.some((sh) => boxList[sh.shipmentId].some((b) => !(b.length > 0 && b.width > 0 && b.height > 0 && b.weight > 0)));
      box.innerHTML = `
        ${shipments.length > 1 ? `<div class="tabs">${shipments.map((sh, i) => `<button data-tab="${i}" class="${i === cur ? "on" : ""}">${esc(sh.warehouse || sh.shipmentId)} · ${esc(sh.confirmationId || "")}</button>`).join("")}</div>` : ""}
        <div class="card" style="padding:12px 16px"><div class="row between">
          <div><b>${esc(s.confirmationId || s.shipmentId)}</b> → <b>${esc(s.warehouse || "")}</b> <span class="small muted">${esc(s.city || "")} ${esc(s.state || "")}</span></div>
          <div class="row" style="flex:1;max-width:480px;gap:10px"><div class="progress" style="flex:1"><div style="width:${total ? boxedAll / total * 100 : 0}%;background:${boxedAll === total ? "var(--good)" : "var(--brand-2)"}"></div></div>
            <span class="small"><b>${fmtN(boxedAll)}</b> / ${fmtN(total)} units boxed · <b>${L.length}</b> boxes</span></div></div></div>
        <div class="boxing">
          <div class="card flush"><div class="card-h" style="padding:12px 14px 0"><h2>Products (${(s.items || []).length})</h2>
            <div class="row"><button class="sm" id="caseall" title="Fill boxes using each product's usual units per box">Box all with case qty</button><button class="sm" id="boxrest">Box all remaining</button></div></div>
            <div class="bx-items">${(s.items || []).map((it) => {
              const info = itemInfo[it.msku] || {}, boxed = boxedOf(s, it.msku), left = it.quantity - boxed;
              return `<div class="bx-item"><div class="prod-cell">${thumb(info.image, 44)}<div class="meta"><div class="ttl" style="max-width:260px;color:var(--text)">${esc(info.title || it.msku)}</div>
                <div class="small"><span class="badge">${esc(it.msku)}</span> <span class="badge mono">${esc(fnskuOf(s, it.msku))}</span>${info.units_per_box ? ` <span class="badge info">${info.units_per_box}/box</span>` : ""}</div></div></div>
                <div class="row" style="gap:6px;margin-top:6px"><b class="${left === 0 ? "good" : left < 0 ? "bad" : ""}">${fmtN(boxed)} / ${fmtN(it.quantity)}</b>
                  ${left > 0 ? `<button class="sm primary" data-addbox="${esc(it.msku)}">+ Boxes</button><button class="sm" data-addall="${esc(it.msku)}">All ${fmtN(left)} in 1 box</button>` : left < 0 ? `<span class="small bad">${-left} too many</span>` : `<span class="small good">✓ boxed</span>`}
                  <button class="sm" data-fn="${esc(it.msku)}" title="FNSKU unit labels">🏷 ${fmtN(it.quantity)}</button></div></div>`;
            }).join("")}</div></div>
          <div class="card flush"><div class="card-h" style="padding:12px 14px 0"><h2>Boxes (${L.length})</h2>
            <div class="row" style="gap:6px"><label class="chk small"><input type="checkbox" id="selall" ${L.length && sel.size === L.length ? "checked" : ""}> All</label>
              <button class="sm" id="newbox">+ Empty box</button><button class="sm" id="bulk" ${sel.size ? "" : "disabled"}>Bulk edit (${sel.size})</button>
              <button class="sm" id="psel" ${sel.size ? "" : "disabled"}>Print selected</button><button class="sm primary" id="pall" ${L.length ? "" : "disabled"}>Print all</button>
              <select id="fmt" class="sm" title="Label layout"><option value="6up" ${fmt === "6up" ? "selected" : ""}>6 per page (${sheet.w}×${sheet.h} in)</option><option value="4x6" ${fmt === "4x6" ? "selected" : ""}>4×6 thermal</option></select><button class="sm" id="sheetset" title="Label sheet size & position">⚙</button>
              <button class="sm" id="emptysel" ${sel.size ? "" : "disabled"}>Empty</button><button class="sm danger" id="delsel" ${sel.size ? "" : "disabled"}>Delete</button></div></div>
            <div class="bx-boxes">${L.map((b, i) => `<div class="bx-box ${sel.has(i) ? "sel" : ""}">
                <label class="chk"><input type="checkbox" data-sel="${i}" ${sel.has(i) ? "checked" : ""}></label>
                <div style="min-width:0;flex:1"><div class="row" style="gap:6px"><b>Box ${i + 1}</b>${b.reprint ? `<span class="badge warn" title="Number or contents changed since printing">reprint</span>` : b.printed ? `<span class="badge good" title="Printed ${b.printed}×">printed</span>` : ""}${!b.items.length ? `<span class="badge bad">empty</span>` : ""}
                  <span class="small">${b.items.map((x) => `<span class="badge" title="${esc(x.msku)} · FNSKU ${esc(fnskuOf(s, x.msku))}">${esc(asinOf(s, x.msku))} × <b>${x.qty}</b></span>`).join(" ") || '<span class="faint">no contents — add from a product</span>'}</span></div>
                  <div class="row small" style="gap:4px;margin-top:6px">Weight <input class="w-num bxn" data-b="${i}" data-k="weight" value="${b.weight ?? ""}" placeholder="lb">
                    &nbsp;Dims <input class="w-num bxn" data-b="${i}" data-k="length" value="${b.length ?? ""}" placeholder="L">×<input class="w-num bxn" data-b="${i}" data-k="width" value="${b.width ?? ""}" placeholder="W">×<input class="w-num bxn" data-b="${i}" data-k="height" value="${b.height ?? ""}" placeholder="H"> in</div></div>
                <div class="row" style="gap:4px"><button class="sm" data-edit="${i}">Contents</button><button class="sm" data-print="${i}">Print</button><button class="sm" data-empty="${i}" title="Remove the contents but keep box ${i + 1} (no renumbering)">Empty</button><button class="sm danger" data-del="${i}" title="Delete box — boxes after it are renumbered">×</button></div></div>`).join("") || `<div class="empty">No boxes yet — use <b>+ Boxes</b> next to a product.</div>`}</div></div>
        </div>
        <div class="card row between" style="position:sticky;bottom:8px;z-index:5">
          <span class="small muted">${allBoxed ? (emptyBox ? "Some boxes are empty — fill them or delete them before submitting." : missingDims ? "Enter weight and dimensions for every box, then submit." : "All units boxed. Submit when the boxes are packed and labeled.") : "Box every unit (all shipments) before submitting."} Box numbers on the labels match what's submitted to Amazon.</span>
          <button class="primary" id="submit" ${allBoxed && !missingDims && !emptyBox ? "" : "disabled"}>Submit box content to Amazon →</button></div>`;

      // ---- events ----
      $$("[data-tab]").forEach((b) => b.onclick = () => { cur = Number(b.dataset.tab); sel.clear(); draw(); });
      $$("[data-addbox]").forEach((b) => b.onclick = () => addBoxesDialog(s, b.dataset.addbox));
      $$("[data-addall]").forEach((b) => b.onclick = () => { const m = b.dataset.addall; L.push({ items: [{ msku: m, qty: (s.items.find((x) => x.msku === m).quantity) - boxedOf(s, m) }], ...specDims(m) }); changed(); });
      $$("[data-fn]").forEach((b) => b.onclick = () => window.open(`/api/ship/plans/${id}/unit-labels?sku=${encodeURIComponent(b.dataset.fn)}&type=letter`, "_blank"));
      $("#caseall").onclick = () => {
        let n = 0;
        for (const it of s.items || []) {
          const upb = itemInfo[it.msku]?.units_per_box; let left = it.quantity - boxedOf(s, it.msku);
          if (!upb || left <= 0) continue;
          while (left >= upb) { L.push({ items: [{ msku: it.msku, qty: upb }], ...specDims(it.msku) }); left -= upb; n++; }
          if (left > 0) { L.push({ items: [{ msku: it.msku, qty: left }], ...specDims(it.msku) }); n++; }
        }
        toast(n ? `Created ${n} boxes` : "No usual case quantities on file yet — they're remembered after your first submit. Use + Boxes."); changed();
      };
      $("#boxrest").onclick = () => { for (const it of s.items || []) { const left = it.quantity - boxedOf(s, it.msku); if (left > 0) L.push({ items: [{ msku: it.msku, qty: left }], ...specDims(it.msku) }); } changed(); };
      $("#newbox").onclick = () => { L.push({ items: [], ...lastDims() }); editContents(s, L.length - 1); };
      $("#selall").onchange = () => { sel.clear(); if ($("#selall").checked) L.forEach((_, i) => sel.add(i)); draw(); };
      $$("[data-sel]").forEach((c) => c.onchange = () => { const i = Number(c.dataset.sel); c.checked ? sel.add(i) : sel.delete(i); draw(); });
      $$(".bxn").forEach((inp) => inp.onchange = () => { const v = inp.value === "" ? null : Number(inp.value); L[inp.dataset.b][inp.dataset.k] = v; save(); });
      $$("[data-edit]").forEach((b) => b.onclick = () => editContents(s, Number(b.dataset.edit)));
      $$("[data-print]").forEach((b) => b.onclick = () => printLabels(s, [Number(b.dataset.print)]));
      $$("[data-empty]").forEach((b) => b.onclick = () => emptyBoxes(s, [Number(b.dataset.empty)]));
      $$("[data-del]").forEach((b) => b.onclick = () => deleteBoxes(s, [Number(b.dataset.del)]));
      $("#psel").onclick = () => printLabels(s, [...sel].sort((a, b) => a - b));
      $("#pall").onclick = () => printLabels(s, L.map((_, i) => i));
      $("#fmt").onchange = () => { fmt = $("#fmt").value; try { localStorage.setItem("mm-labelfmt", fmt); } catch {} };
      $("#sheetset").onclick = sheetSettings;
      $("#emptysel").onclick = () => emptyBoxes(s, [...sel]);
      $("#delsel").onclick = () => deleteBoxes(s, [...sel]);
      $("#bulk").onclick = () => {
        const m = modal(`<h2>Edit ${sel.size} boxes</h2><p class="small muted">Leave a field empty to keep each box's current value.</p><div class="form-grid">
          ${[["weight", "Weight (lb)"], ["length", "Length (in)"], ["width", "Width (in)"], ["height", "Height (in)"]].map(([k, l]) => `<label class="f">${l}<input type="number" step="0.1" data-bk="${k}"></label>`).join("")}</div>
          <div class="foot"><button data-close>Cancel</button><button class="primary" id="bok">Apply</button></div>`);
        $("#bok", m.el).onclick = () => { $$("[data-bk]", m.el).forEach((i) => { if (i.value !== "") for (const ix of sel) L[ix][i.dataset.bk] = Number(i.value); }); m.close(); changed(); };
      };
      $("#submit").onclick = () => {
        const boxes = Object.fromEntries(shipments.map((sh) => [sh.shipmentId, boxList[sh.shipmentId].map((b) => ({ count: 1, length: b.length, width: b.width, height: b.height, weight: b.weight, items: b.items }))]));
        run("boxes_submit", { boxes }, "Submit box content?", `<p>${shipments.map((sh) => `<b>${esc(sh.warehouse)}</b>: ${boxList[sh.shipmentId].length} boxes`).join("<br>")}</p><p>Make sure the printed labels are on the boxes in the same numbers.</p>`, "Submit to Amazon");
      };
    };

    const specDims = (msku) => { const i = itemInfo[msku] || {}; const ld = lastDims(); return i.length ? { length: i.length, width: i.width, height: i.height, weight: i.weight } : ld; };

    const addBoxesDialog = (s, msku) => {
      const it = s.items.find((x) => x.msku === msku), left = it.quantity - boxedOf(s, msku), sp = specDims(msku);
      const upb0 = itemInfo[msku]?.units_per_box || left;
      const m = modal(`<h2>Add boxes — ${esc(msku)}</h2><p class="small muted">${fmtN(left)} units left to box.</p><div class="form-grid">
        <label class="f">Units per box<input type="number" min="1" id="ab-u" value="${Math.min(upb0, left)}"></label>
        <label class="f">Number of boxes<input type="number" min="1" id="ab-n" value="${Math.max(1, Math.floor(left / Math.min(upb0, left)))}"></label>
        <label class="f">Weight per box (lb)<input type="number" step="0.1" id="ab-w" value="${sp.weight ?? ""}"></label>
        <label class="f">Length (in)<input type="number" step="0.1" id="ab-l" value="${sp.length ?? ""}"></label>
        <label class="f">Width (in)<input type="number" step="0.1" id="ab-wd" value="${sp.width ?? ""}"></label>
        <label class="f">Height (in)<input type="number" step="0.1" id="ab-h" value="${sp.height ?? ""}"></label></div>
        <p class="small" id="ab-sum"></p>
        <div class="foot"><button data-close>Cancel</button><button class="primary" id="ab-ok">Add boxes</button></div>`);
      const sum = () => { const u = +$("#ab-u", m.el).value, n = +$("#ab-n", m.el).value; $("#ab-sum", m.el).innerHTML = `${n} box${n === 1 ? "" : "es"} × ${u} = <b>${fmtN(u * n)}</b> units${u * n > left ? ` <span class="bad">(${fmtN(u * n - left)} more than left)</span>` : ` · ${fmtN(left - u * n)} left after`}`; };
      $("#ab-u", m.el).oninput = sum; $("#ab-n", m.el).oninput = sum; sum();
      $("#ab-ok", m.el).onclick = () => {
        const u = Math.round(+$("#ab-u", m.el).value), n = Math.round(+$("#ab-n", m.el).value);
        if (!(u > 0 && n > 0)) return toast("Enter units per box and number of boxes.", true);
        if (u * n > left) return toast(`That's ${u * n - left} more than the units left.`, true);
        const dims = { weight: num($("#ab-w", m.el).value), length: num($("#ab-l", m.el).value), width: num($("#ab-wd", m.el).value), height: num($("#ab-h", m.el).value) };
        for (let k = 0; k < n; k++) boxList[s.shipmentId].push({ items: [{ msku, qty: u }], ...dims });
        m.close(); changed();
      };
    };
    const num = (v) => (v === "" || v === null ? null : Number(v));

    const editContents = (s, bi) => {
      const b = boxList[s.shipmentId][bi];
      const m = modal(`<h2>Box ${bi + 1} — contents</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>FNSKU</th><th class="n">Left to box</th><th class="n">In this box</th></tr></thead><tbody>
        ${(s.items || []).map((it) => { const inBox = b.items.find((x) => x.msku === it.msku)?.qty || 0; const left = it.quantity - boxedOf(s, it.msku) + inBox;
          return `<tr><td class="small">${esc(it.msku)}</td><td class="mono small">${esc(fnskuOf(s, it.msku))}</td><td class="n">${fmtN(left)}</td><td class="n"><input class="w-num" type="number" min="0" max="${left}" data-c="${esc(it.msku)}" value="${inBox || ""}"></td></tr>`; }).join("")}
        </tbody></table></div><div class="foot"><button data-close>Cancel</button><button class="primary" id="ec-ok">Save</button></div>`, true);
      $("#ec-ok", m.el).onclick = () => {
        const before = JSON.stringify(b.items);
        b.items = $$("[data-c]", m.el).map((i) => ({ msku: i.dataset.c, qty: Math.round(Number(i.value) || 0) })).filter((x) => x.qty > 0);
        if (b.printed && JSON.stringify(b.items) !== before) b.reprint = true;
        m.close(); changed();
      };
    };

    const emptyBoxes = async (s, idxs) => {
      const L = boxList[s.shipmentId];
      if (!idxs.length) return;
      if (!await confirmBox(`Empty ${idxs.length === 1 ? "box " + (idxs[0] + 1) : idxs.length + " boxes"}?`,
        `<p>The contents go back to "left to box". The box number${idxs.length === 1 ? "" : "s"} stay${idxs.length === 1 ? "s" : ""} the same, so no other labels change — refill with <b>Contents</b> and reprint just ${idxs.length === 1 ? "this one" : "these"}.</p>`, "Empty")) return;
      for (const i of idxs) { L[i].items = []; if (L[i].printed) L[i].reprint = true; }
      sel.clear(); changed();
    };
    const deleteBoxes = async (s, idxs) => {
      const L = boxList[s.shipmentId];
      if (!idxs.length) return;
      idxs = [...idxs].sort((a, b) => a - b);
      const first = idxs[0], lastAfter = L.length - 1;
      const shifted = L.slice(first + 1).filter((_, k) => !idxs.includes(first + 1 + k));
      const printedShifted = shifted.filter((b) => b.printed).length;
      const html = shifted.length
        ? `<div class="banner warn"><div class="txt"><b>Renumbering warning.</b> Deleting ${idxs.length === 1 ? `box ${first + 1}` : `boxes ${idxs.map((i) => i + 1).join(", ")}`} moves every box after it up: box ${first + 2} becomes box ${first + 1}, and so on through box ${lastAfter + 1}.
            ${printedShifted ? `<b>${printedShifted} already-printed label${printedShifted === 1 ? "" : "s"} would be wrong</b> and must be reprinted.` : ""}</div></div>
           <p>To avoid reprinting, use <b>Empty</b> instead — it keeps the box number and you can refill it.</p>`
        : `<p>This is the last box, so no other box numbers change.</p>`;
      const choice = await new Promise((res) => {
        const m = modal(`<h2>Delete ${idxs.length === 1 ? "box " + (first + 1) : idxs.length + " boxes"}?</h2>${html}
          <div class="foot"><button data-close>Cancel</button>${shifted.length ? `<button id="d-empty">Empty instead</button>` : ""}<button class="primary danger" id="d-del">Delete${shifted.length ? " & renumber" : ""}</button></div>`);
        $("#d-del", m.el).onclick = () => { m.close(); res("delete"); };
        if ($("#d-empty", m.el)) $("#d-empty", m.el).onclick = () => { m.close(); res("empty"); };
        $$("[data-close]", m.el).forEach((b) => b.addEventListener("click", () => res(null)));
      });
      if (choice === "empty") { for (const i of idxs) { L[i].items = []; if (L[i].printed) L[i].reprint = true; } }
      else if (choice === "delete") {
        const keep = L.filter((_, i) => !idxs.includes(i));
        keep.forEach((b, i) => { if (i >= first && b.printed) b.reprint = true; });
        L.length = 0; L.push(...keep);
      } else return;
      sel.clear(); changed();
    };
    const sheetSettings = () => {
      const F = [["w", "Label width (in)"], ["h", "Label height (in)"], ["top", "Top margin (in)"], ["left", "Left margin (in)"], ["gapX", "Gap between columns (in)"], ["gapY", "Gap between rows (in)"], ["start", "Start at label # (1–6, to reuse a part-used sheet)"]];
      const m = modal(`<h2>6-per-page label sheet</h2><p class="small muted">2 labels across × 3 down on US Letter. Match these to your label sheets. A Letter page is 8.5 × 11 in, so 3 rows × height + gaps + top margin must fit in 11 in${sheet.h * 3 + sheet.gapY * 2 + sheet.top > 11 ? ` — <b class="bad">your current settings need ${(sheet.h * 3 + sheet.gapY * 2 + sheet.top).toFixed(2)} in</b>` : ""}.</p>
        <div class="form-grid">${F.map(([k, l]) => `<label class="f">${l}<input type="number" step="0.01" data-sh="${k}" value="${sheet[k]}"></label>`).join("")}</div>
        <div class="foot"><button id="sh-reset">Reset</button><button data-close>Cancel</button><button class="primary" id="sh-ok">Save</button></div>`);
      $("#sh-reset", m.el).onclick = () => { $$("[data-sh]", m.el).forEach((i) => { i.value = SHEET0[i.dataset.sh]; }); };
      $("#sh-ok", m.el).onclick = () => {
        $$("[data-sh]", m.el).forEach((i) => { sheet[i.dataset.sh] = Number(i.value) || 0; });
        sheet.start = Math.min(6, Math.max(1, Math.round(sheet.start || 1)));
        try { const { start, ...keep } = sheet; localStorage.setItem("mm-sheet", JSON.stringify(keep)); } catch {}
        m.close(); draw();
      };
    };

    const printLabels = async (s, idxs) => {
      const L = boxList[s.shipmentId];
      if (!idxs.length) return;
      if (!s.confirmationId) return toast("This shipment has no Amazon shipment ID yet — press Refresh.", true);
      const empty = idxs.filter((i) => !L[i].items.length);
      if (empty.length) return toast(`Box ${empty.map((i) => i + 1).join(", ")} is empty.`, true);
      const from = p.address || {}, to = s.destAddress || {};
      const labels = idxs.map((i) => {
        const b = L[i], n = i + 1;
        const twoD = `AMZN,PO:${s.confirmationId},` + b.items.map((x) => `FNSKU:${fnskuOf(s, x.msku)},QTY:${x.qty}`).join(",");
        const contents = b.items.length === 1
          ? `${(itemInfo[b.items[0].msku]?.title || b.items[0].msku).slice(0, 60)} - [${fnskuOf(s, b.items[0].msku)}] - ${b.items[0].qty}`
          : `Mixed SKUs (${b.items.length}) - ${b.items.reduce((a, x) => a + x.qty, 0)} units`;
        return { n, of: L.length, twoD, boxId: `${s.confirmationId}U${String(n).padStart(6, "0")}`, contents, mixed: b.items.length > 1 ? b.items.map((x) => `${asinOf(s, x.msku)} [${fnskuOf(s, x.msku)}] × ${x.qty}`) : [] };
      });
      const w = window.open("", "_blank");
      if (!w) return toast("Allow pop-ups for this site to print labels.", true);
      w.document.write("<p style='font:14px Arial;padding:20px'>Preparing labels…</p>");
      let bw;
      try { bw = await loadBarcodes(); } catch (e) { w.close(); return toast("Couldn't load the barcode generator — check your connection.", true); }
      const svg = (opts, style) => { try { return bw.toSVG(opts).replace("<svg ", `<svg style="${style}" preserveAspectRatio="none" `); } catch (e) { return `<p style="color:red">Barcode error: ${esc(e.message || e)}</p>`; } };
      w.document.open();
      const six = fmt !== "4x6";
      const W = six ? sheet.w : 4, H = six ? sheet.h : 6;
      // compact layout for the smaller 6-up label
      const k = six ? Math.min(1, H / 5.2) : 1;
      const page = six
        ? `@page{size:8.5in 11in;margin:0}.sheet{display:grid;grid-template-columns:repeat(2,${W}in);grid-auto-rows:${H}in;column-gap:${sheet.gapX}in;row-gap:${sheet.gapY}in;padding:${sheet.top}in 0 0 ${sheet.left}in;page-break-after:always;box-sizing:border-box;width:8.5in;height:11in;overflow:hidden}.lab{width:${W}in;height:${H}in}`
        : "@page{size:4in 6in;margin:0}.lab{width:4in;height:6in;page-break-after:always}";
      const pdfH = (six ? Math.max(0.6, H * 0.24) : 1.15).toFixed(2), c128H = (six ? Math.max(0.35, H * 0.12) : 0.7).toFixed(2), bcW = (W - 0.5).toFixed(2);
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Box labels ${esc(s.confirmationId)}</title>
        <style>${page}body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:${Math.round(100 * k)}%}.lab{box-sizing:border-box;padding:${six ? 0.1 : 0.15}in;overflow:hidden;display:flex;flex-direction:column}.blank{visibility:hidden}
        .c{text-align:center}.tiny{font:9px 'Courier New',monospace}.bar{background:#000;color:#fff;font-weight:bold;padding:2px 6px;display:flex;justify-content:space-between;font-size:13px}
        .two{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10.5px;margin:4px 0;border-top:2px solid #000;padding-top:3px}.two b.big{font-size:20px}
        .hd{display:flex;justify-content:space-between;align-items:center;border-top:2px solid #000;margin-top:2px}.hd .fba{font:bold 18px 'Courier New',monospace}
        .ct{font:bold 10px 'Courier New',monospace;border-top:2px solid #000;padding-top:3px;margin-top:auto;text-align:right}svg{display:block;margin:0 auto}
        ${six ? ".two{font-size:9px;margin:2px 0}.two b.big{font-size:15px}.bar{font-size:11px;padding:1px 5px}.hd .fba{font-size:14px}.ct{font-size:8.5px}" : ""}
        @media screen{body{background:#eee}.sheet,.lab{background:#fff;margin:12px auto;outline:1px dashed #bbb}.sheet .lab{margin:0;outline:1px dotted #ccc}}</style>
        </head><body>
        ${(() => {
          const one = (l) => `<div class="lab">
          <div class="c">${svg({ bcid: "pdf417", text: l.twoD, columns: 6, scale: 2, padding: 2 }, `width:${bcW}in;height:${pdfH}in`)}</div><div class="tiny c">${esc(l.twoD.length > 70 ? l.twoD.slice(0, 70) + "…" : l.twoD)}</div>
          <div class="c" style="font-size:9px;font-weight:bold;letter-spacing:.5px">PLEASE LEAVE THIS LABEL UNCOVERED</div>
          <div class="hd"><span class="fba">FBA</span><span class="bar" style="flex:1;margin-left:10px;min-height:1.15em"></span></div>
          <div class="two"><div>SHIP FROM:<br><b>${esc(from.name || "")}</b><br>${esc(from.addressLine1 || "")}${from.addressLine2 ? " " + esc(from.addressLine2) : ""}<br>${esc(from.city || "")} ${esc(from.stateOrProvinceCode || "")} ${esc(from.postalCode || "")} ${esc(from.countryCode || "")}</div>
            <div>SHIP TO:<br><b class="big">${esc(s.warehouse || to.name || "")}</b><br>${esc(to.addressLine1 || "")}${to.addressLine2 ? " " + esc(to.addressLine2) : ""}<br>${esc(to.city || "")} ${esc(to.stateOrProvinceCode || "")} ${esc(to.postalCode || "")}</div></div>
          <div class="bar"><span>${esc(s.name || p.name)}</span></div>
          <div class="c" style="font:bold 10px 'Courier New',monospace;margin-top:4px">Purchase Order / Shipment ID</div>
          <div class="c">${svg({ bcid: "code128", text: l.boxId, height: 14, scale: 2 }, `width:${bcW}in;height:${c128H}in`)}</div><div class="c" style="font:bold ${six ? 11 : 13}px Arial">${esc(l.boxId)}</div>
          <div class="ct">${esc(l.contents)}${l.mixed.length ? `<br>${l.mixed.map(esc).join(" · ")}` : ""}</div></div>`;
          if (!six) return labels.map(one).join("");
          const cells = [...Array(sheet.start - 1).fill(null), ...labels];
          let out = "";
          for (let i = 0; i < cells.length; i += 6) out += `<div class="sheet">${cells.slice(i, i + 6).map((l) => l ? one(l) : `<div class="lab blank"></div>`).join("")}</div>`;
          return out;
        })()}
        </body></html>`);
      w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* user can print manually */ } }, 400);
      for (const i of idxs) { L[i].printed = (L[i].printed || 0) + 1; L[i].reprint = false; }
      sheet.start = 1;
      save(); draw();
    };
    draw();
  };

  const labelButtons = (s, freight) => `<span class="small muted">Labels:</span>
    <button class="sm" data-lb="${esc(s.shipmentId)}" data-kind="box2">Box labels (2/page)</button>
    <button class="sm" data-lb="${esc(s.shipmentId)}" data-kind="box6">Box labels (6/page)</button>
    ${freight ? `<button class="sm" data-lb="${esc(s.shipmentId)}" data-kind="pallet">Pallet labels</button>` : ""}`;
  const bindLabels = () => $$("[data-lb]").forEach((b) => b.onclick = () => window.open(labelUrl(b.dataset.lb, b.dataset.kind), "_blank"));

  // ---- 4. freight ----
  const drawFreight = (box, d) => {
    const sh = d.shipments || [];
    const c = d.contact || defaults.contact || {};
    const mode = d.freightMode || "freight";
    const have = sh.some((s) => (s.transportOptions || []).length);
    box.innerHTML = `<div class="card"><div class="card-h"><h2>Freight</h2><div class="row">${sh.map((s) => labelButtons(s, false)).join("")}</div></div>
      <div class="filters">
        <label class="f">Ship by<select id="fm"><option value="freight" ${mode === "freight" ? "selected" : ""}>Amazon Freight — pallets (LTL / FTL)</option><option value="parcel" ${mode === "parcel" ? "selected" : ""}>Small parcel — boxes</option></select></label>
        <label class="f">Freight ready date<input type="date" id="rd" value="${d.readyDate || addDays(todayLA(), 1)}"></label>
        <label class="f">Contact name<input id="cn" value="${esc(c.name || "")}"></label>
        <label class="f">Contact phone<input id="cp" value="${esc(c.phoneNumber || "")}"></label>
        <label class="f">Contact email<input id="ce" value="${esc(c.email || "")}"></label></div>
      ${sh.map((s, si) => { const f = s.freight || {}; return `<div class="card" style="padding:12px;margin-top:12px"><b>→ ${esc(s.warehouse || s.shipmentId)}</b> <span class="small muted">${esc(s.city || "")} ${esc(s.state || "")} · ${fmtN(s.boxCount || 0)} boxes</span>
        <div class="filters pal ${mode === "freight" ? "" : "hidden"}" style="margin-top:8px">
          <label class="f"># pallets<input class="w-num" type="number" min="1" data-f="${si}" data-k="pallets" value="${f.pallets || ""}"></label>
          <label class="f">Length in<input class="w-num" type="number" data-f="${si}" data-k="length" value="${f.length || 48}"></label>
          <label class="f">Width in<input class="w-num" type="number" data-f="${si}" data-k="width" value="${f.width || 40}"></label>
          <label class="f">Height in<input class="w-num" type="number" data-f="${si}" data-k="height" value="${f.height || ""}"></label>
          <label class="f">Weight per pallet lb<input class="w-num" type="number" data-f="${si}" data-k="weight" value="${f.weight || ""}"></label>
          <label class="f">Declared value $<input class="w-num" type="number" data-f="${si}" data-k="declaredValue" value="${f.declaredValue || ""}"></label>
          <label class="chk" style="padding-bottom:8px"><input type="checkbox" data-f="${si}" data-k="stackable" ${f.stackable === false ? "" : "checked"}> Stackable</label></div>
        ${(s.transportOptions || []).map((o, i) => `<label class="chk" style="display:flex;margin:6px 0"><input type="radio" name="t-${esc(s.shipmentId)}" value="${esc(o.transportationOptionId)}" ${i === 0 ? "checked" : ""}>
          <b>${o.solution === "AMAZON_PARTNERED_CARRIER" ? "Amazon Freight / partnered" : "Your own carrier"}</b> · ${esc(o.carrier || "")} · ${esc((o.mode || "").replace("FREIGHT_", "").replace("GROUND_SMALL_PARCEL", "small parcel"))} · <b>${o.cost !== null ? fmt$(o.cost) : "no quote"}</b></label>`).join("")}</div>`; }).join("")}
      <div class="row" style="margin-top:12px">${canSpend() ? `<button ${have ? "" : 'class="primary"'} id="fq">${have ? "Re-quote" : "Get quote →"}</button>${have ? `<button class="primary" id="fc">Confirm freight →</button>` : ""}` : `<span class="small muted">A manager or admin books the freight.</span>`}</div></div>`;
    bindLabels();
    $("#fm").onchange = () => $$(".pal").forEach((x) => x.classList.toggle("hidden", $("#fm").value !== "freight"));
    if (!canSpend()) return;
    const collect = () => {
      const freight = {};
      sh.forEach((s, si) => {
        const f = {};
        $$(`[data-f="${si}"]`).forEach((i) => { f[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; });
        freight[s.shipmentId] = f;
      });
      return { mode: $("#fm").value, readyDate: $("#rd").value, contact: { name: $("#cn").value.trim(), phoneNumber: $("#cp").value.trim(), email: $("#ce").value.trim() }, freight };
    };
    $("#fq").onclick = () => run("freight_quote", collect());
    if ($("#fc")) $("#fc").onclick = () => {
      const selections = {}; let total = 0;
      for (const s of sh) {
        const v = $(`input[name="t-${CSS.escape(s.shipmentId)}"]:checked`)?.value;
        selections[s.shipmentId] = v;
        total += (s.transportOptions || []).find((o) => o.transportationOptionId === v)?.cost || 0;
      }
      run("freight_confirm", { selections }, "Book freight?", `<p>Freight charges of <b>${fmt$(total)}</b> are billed to your seller account. After this the shipment is final.</p>`, `Book — ${fmt$(total)}`);
    };
  };

  // ---- 5. done ----
  const drawDone = (box, d) => {
    const sh = d.shipments || [];
    box.innerHTML = `<div class="card"><div class="card-h"><h2>${p.status === "cancelled" ? "Cancelled" : "Ready to ship"}</h2>${p.inbound_plan_id && canShip() ? `<button id="rf">Refresh from Amazon</button>` : ""}</div>
      ${sh.map((s) => `<div class="card" style="padding:12px"><div class="row between"><div><b>${esc(s.confirmationId || s.shipmentId)}</b> → <b>${esc(s.warehouse || "")}</b> <span class="small muted">${esc(s.city || "")} ${esc(s.state || "")} · ${fmtN(s.boxCount || 0)} boxes ${s.freight?.pallets ? `· ${s.freight.pallets} pallets` : ""} ${s.status ? "· " + esc(s.status) : ""}</span></div>
        ${p.status === "confirmed" ? `<div class="row">${labelButtons(s, d.freightMode === "freight")}</div>` : ""}</div></div>`).join("") || `<p class="muted">No shipments.</p>`}
      ${d.placementFee !== undefined ? `<p class="small muted">Placement fee ${fmt$(d.placementFee)}</p>` : ""}</div>`;
    bindLabels();
    if ($("#rf")) $("#rf").onclick = () => run("refresh");
  };
  await render();
}

// ---------------- images ----------------
PAGES.images = async (el, params) => {
  el.innerHTML = header("Image updates", "Pick a product, swap images, push to Amazon") + `
    <div class="card"><div class="filters"><div class="f" style="flex:1">Product<div id="pk"></div></div></div></div>
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
    <div class="card small muted"><b>Admin</b>: everything, including users and connections. <b>Manager</b>: everything except users/connections (can change prices, rules, images). <b>Warehouse</b>: Inventory and Shipping only — build shipments, enter boxes, print labels (can't confirm anything that costs money). <b>Viewer</b>: read-only dashboards.</div>
    <div class="card flush" id="t"></div>`;
  table($("#t"), [
    { k: "name", l: "Name", f: (r) => `<b>${esc(r.name || "")}</b><div class="small muted">${esc(r.email)}</div>` },
    { k: "role", l: "Role", f: (r) => `<select data-role="${r.id}">${["admin", "manager", "warehouse", "viewer"].map((x) => `<option ${x === r.role ? "selected" : ""}>${x}</option>`).join("")}</select>` },
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
      <label class="f">Role<select id="u-r"><option>viewer</option><option>warehouse</option><option selected>manager</option><option>admin</option></select></label>
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
