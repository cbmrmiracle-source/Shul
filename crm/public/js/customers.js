/* Dashboard, contacts, companies, relationships, email compose, timeline */
"use strict";

// ---------------------------------------------------------------- shared bits
const TL_ICON = { Call: "phone", Email: "mail", Meeting: "calendar", WhatsApp: "chat", Visit: "company", "Sample sent": "box", "Quote sent": "dollar", Order: "check", Note: "note", "Stage change": "pipeline", Campaign: "megaphone" };
const TL_COLOR = { Call: "var(--green-soft);color:var(--green)", Email: "var(--blue-soft);color:var(--blue)", Meeting: "var(--purple-soft);color:var(--purple)", WhatsApp: "var(--green-soft);color:var(--green)", "Stage change": "var(--primary-soft);color:var(--primary)", Order: "var(--green-soft);color:var(--green)", "Sample sent": "var(--amber-soft);color:var(--amber)", "Quote sent": "var(--amber-soft);color:var(--amber)", Campaign: "var(--purple-soft);color:var(--purple)" };
function tlItem(it) {
  let ic = "note", col = "", head = "", sub = "", body = "", extra = "";
  if (it.kind === "interaction") {
    ic = TL_ICON[it.type] || "note"; col = TL_COLOR[it.type] || "";
    head = `<b>${esc(it.type)}${it.subject ? ": " + esc(it.subject) : ""}</b>${it.direction && it.type !== "Stage change" ? `<span class="badge">${esc(it.direction)}</span>` : ""}${it.outcome ? badge(it.outcome) : ""}`;
    sub = `${it.user_name ? esc(it.user_name) + " · " : ""}${fmtDT(it.occurred_at)}${it.duration_min ? ` · ${it.duration_min} min` : ""}${it.contact_name && !it._onContact ? ` · <a href="#/contacts/${it.contact_id}">${esc(it.contact_name)}</a>` : ""}${it.deal_title ? ` · <a href="#/deals/${it.deal_id}">${esc(it.deal_title)}</a>` : ""}`;
    body = it.body || "";
    if (it.email_id) extra = `<button class="btn sm ghost" data-viewemail="${it.email_id}">${icon("eye")} View email</button>`;
  } else if (it.kind === "task") {
    ic = "tasks"; col = it.status === "Done" ? TL_COLOR.Order : "";
    head = `<b>Task: ${esc(it.title)}</b>${badge(it.status)}${it.priority !== "Normal" ? badge(it.priority) : ""}`;
    sub = `${it.assignee_name ? "For " + esc(it.assignee_name) + " · " : ""}${it.due_at ? "Due " + fmtDate(it.due_at) : "No due date"}${it.completed_at ? " · completed " + fmtDT(it.completed_at) : ""}`;
    body = it.description || "";
  } else if (it.kind === "ticket") {
    ic = "ticket"; col = "var(--red-soft);color:var(--red)";
    head = `<b><a href="#/tickets/${it.id}">Ticket #${it.id}: ${esc(it.subject)}</a></b>${badge(it.status)}${badge(it.priority)}`; sub = `${esc(it.category || "")} · opened ${fmtDT(it.created_at)}`;
  } else if (it.kind === "deal") {
    ic = "dollar"; col = TL_COLOR.Order;
    head = `<b><a href="#/deals/${it.id}">Deal: ${esc(it.title)}</a></b>${badge(it.stage)}`; sub = `${money(it.value)} · created ${fmtDT(it.created_at)}${it.owner_name ? " · " + esc(it.owner_name) : ""}`;
  } else if (it.kind === "campaign") {
    ic = "megaphone"; col = TL_COLOR.Campaign;
    head = `<b>Campaign email: ${esc(it.campaign_name)}</b>${badge(it.status)}`; sub = `${fmtDT(it.sent_at)}${it.opened_at ? " · opened " + ago(it.opened_at) : ""}${it.clicked_at ? " · clicked" : ""}`;
  }
  return `<div class="tl-item"><div class="tl-icon" style="background:${col.split(";")[0] || "var(--gray-soft)"};${col.split(";")[1] || ""}">${icon(ic)}</div><div class="tl-body"><div class="h">${head}<span class="small faint" style="margin-left:auto">${ago(it.at)}</span></div>
    <div class="small muted">${sub}</div>${body ? `<div class="txt" data-expand>${esc(body)}</div>` : ""}${extra}</div></div>`;
}
function bindTimeline(root) {
  $$("[data-expand]", root).forEach((t) => (t.onclick = () => t.classList.toggle("open")));
  $$("[data-viewemail]", root).forEach((b) => (b.onclick = () => viewEmail(+b.dataset.viewemail)));
}
async function viewEmail(id) {
  const e = await GET(`/api/emails/${id}`);
  const html = e.body_html || `<pre style="white-space:pre-wrap;font-family:inherit">${esc(e.body_text || "")}</pre>`;
  await modal({ title: e.subject || "(no subject)", size: "wide", submit: e.direction === "in" && e.contact_id && can(1) ? "Reply" : null, cancel: "Close",
    body: `<dl class="props" style="margin-bottom:12px"><dt>From</dt><dd>${esc(e.from_addr)}</dd><dt>To</dt><dd>${esc(e.to_addr)}</dd><dt>Date</dt><dd>${fmtDT(e.created_at)}</dd><dt>Status</dt><dd>${badge(e.status)}${e.opened_at ? ` <span class="small muted">opened ${e.open_count}× · first ${fmtDT(e.opened_at)}</span>` : ""}${e.error ? ` <span class="small" style="color:var(--red)">${esc(e.error)}</span>` : ""}</dd></dl>
      <iframe class="preview" sandbox="" style="height:400px"></iframe>`,
    onOpen: (f) => { $("iframe", f).srcdoc = `<base target="_blank"><div style="font-family:Arial,sans-serif;font-size:14px;padding:8px">${html}</div>`; },
    onSubmit: () => { setTimeout(() => composeEmail({ contact_id: e.contact_id, subject: /^re:/i.test(e.subject) ? e.subject : "Re: " + e.subject, ticket_id: e.ticket_id }), 50); },
  });
}

// ---------------------------------------------------------------- email compose
async function composeEmail({ contact_id, to, subject = "", body = "", deal_id, ticket_id, company_id } = {}) {
  if (!S.settings.email_ready) {
    const go2 = await modal({ title: "Email isn't set up yet", size: "narrow", submit: can(3) ? "Open email settings" : null, cancel: "Close",
      body: `<p style="margin-top:0">To send email from the CRM, an administrator needs to connect a sending service and set the “From” address under <b>Settings → Email</b>.</p>` });
    if (go2) go("settings");
    return;
  }
  const contacts = company_id ? S.lk.contacts.filter((c) => c.company_id === +company_id) : S.lk.contacts;
  const res = await modal({ title: "New email", size: "wide", submit: "Send email",
    body: `<div class="form-grid">
      <label class="f"><span>To (contact)</span><select name="contact_id">${optList(contacts.filter((c) => c.email).map((c) => [c.id, `${c.name} <${c.email}>`]), contact_id, "Choose a contact or type below…")}</select></label>
      <label class="f"><span>…or email address</span><input type="email" name="to" value="${esc(to || "")}" placeholder="name@company.com"></label>
      <label class="f"><span>CC</span><input type="text" name="cc" placeholder="optional, comma separated"></label>
      <label class="f"><span>Use template</span><select name="tpl">${optList(S.lk.templates.map((t) => [t.id, t.name]), "", "— none —")}</select></label>
      <label class="f full"><span>Subject</span><input type="text" name="subject" value="${esc(subject)}" required></label>
      <div class="full">${richEditor("body", body || "<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>")}</div>
      <div class="full hint">Fields like {{first_name}} and {{company}} are filled in for the recipient. The email is logged on the contact's timeline and opens are tracked.</div></div>`,
    onOpen: (f) => { bindEditor(f); $("[name=tpl]", f).onchange = (e) => { const t = S.lk.templates.find((x) => x.id === +e.target.value); if (t) { f.subject.value = t.subject || ""; setEditor(f, "body", t.body_html || ""); } }; },
    onSubmit: async (f) => {
      if (!f.contact_id.value && !f.to.value) throw new Error("Choose a contact or enter an email address");
      await POST("/api/emails/send", { contact_id: f.contact_id.value || null, to: f.to.value || null, cc: f.cc.value, subject: f.subject.value, body_html: editorValue(f, "body"), deal_id, ticket_id });
    } });
  if (res) { toast("Email sent"); rerender(); }
}

// ---------------------------------------------------------------- dashboard
ROUTES.dashboard = async () => {
  const d = await GET("/api/dashboard"), k = d.kpis;
  const hr = new Date().getHours(), greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const delta = k.won_last_month ? (k.won_this_month - k.won_last_month) / k.won_last_month : null;
  after(() => {
    bindTimeline($("#page"));
    $$("[data-task-done]").forEach((b) => (b.onclick = safe(async () => { await PATCH(`/api/tasks/${b.dataset.taskDone}`, { status: "Done" }); toast("Task completed"); rerender(); updateCounts(); })));
  });
  return `${pageHead(`${greet}, ${S.me.name.split(" ")[0]}`, `Here's what's happening at ${esc(S.settings.company_name)} today, ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.`,
    can(1) ? `<button class="btn" onclick="editRecord('interaction').then(r=>r&&rerender())">${icon("activity")} Log activity</button><button class="btn" onclick="editRecord('contact').then(r=>r&&go('contacts/'+r.id))">${icon("plus")} Add lead</button>` : "")}
  <div class="kpis">
    <div class="kpi"><div class="l">Open pipeline</div><div class="v">${money(k.open_pipeline, 1)}</div><div class="d">${num(k.open_deals)} open deals</div></div>
    <div class="kpi"><div class="l">Weighted forecast</div><div class="v">${money(k.weighted_pipeline, 1)}</div><div class="d">by stage probability</div></div>
    <div class="kpi"><div class="l">Won this month</div><div class="v">${money(k.won_this_month, 1)}</div><div class="d">${delta === null ? "" : `<span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta * 100))}%</span> vs last month · `}${k.monthly_target ? `${pct(k.won_this_month / k.monthly_target)} of target` : ""}</div></div>
    <div class="kpi"><div class="l">New leads (30 days)</div><div class="v">${num(k.new_leads_30d)}</div><div class="d">${num(k.contacts)} contacts · ${num(k.customers)} customers</div></div>
    <div class="kpi"><div class="l">My tasks</div><div class="v">${num(k.my_tasks_today)} <span class="small muted" style="font-weight:500">today</span></div><div class="d">${k.my_overdue_tasks ? `<span class="down">${k.my_overdue_tasks} overdue</span>` : "Nothing overdue"}</div></div>
    <div class="kpi"><div class="l">Open tickets</div><div class="v">${num(k.open_tickets)}</div><div class="d">${k.overdue_tickets ? `<span class="down">${k.overdue_tickets} past SLA</span>` : "All within SLA"}</div></div>
  </div>
  <div class="grid g-main" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Revenue won — last 6 months</h3><div class="actions"><a class="btn sm ghost" href="#/forecast">Forecast →</a></div></div><div class="card-b">${barChart(d.months.map((m) => monthLabel(m.month)), [{ name: "Won", data: d.months.map((m) => m.won) }], { line: k.monthly_target || null, lineLabel: "Monthly target" })}</div></div>
    <div class="card"><div class="card-h"><h3>Pipeline by stage</h3><div class="actions"><a class="btn sm ghost" href="#/pipeline">Open board →</a></div></div><div class="card-b">${hbars(d.pipeline.map((p) => ({ label: `${p.stage} (${p.count})`, value: p.value })), { fmt: (v) => money(v, 1) })}</div></div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>My open tasks</h3><div class="actions"><a class="btn sm ghost" href="#/tasks">All →</a></div></div>
      ${d.my_tasks.length ? `<ul class="list-plain">${d.my_tasks.map((t) => { const od = t.due_at && t.due_at.slice(0, 10) < today(); return `<li><span class="check" data-task-done="${t.id}" title="Mark done"></span><div style="flex:1;min-width:0"><div style="font-weight:550">${esc(t.title)}</div><div class="small muted">${t.contact_name ? esc(t.contact_name) + " · " : ""}<span class="${od ? "down" : ""}">${t.due_at ? fmtDate(t.due_at) : "No date"}</span></div></div>${t.priority === "High" || t.priority === "Urgent" ? badge(t.priority) : ""}</li>`; }).join("")}</ul>` : `<div class="empty">${icon("tasks")}You're all caught up</div>`}</div>
    <div class="card"><div class="card-h"><h3>Needs follow-up</h3><span class="small muted">Leads not contacted in 14+ days</span></div>
      ${d.follow_up.length ? `<ul class="list-plain">${d.follow_up.map((c) => `<li>${avatar(c.name, "sm")}<div style="flex:1;min-width:0"><a href="#/contacts/${c.id}" style="font-weight:550">${esc(c.name)}</a><div class="small muted">${esc(c.company_name || c.type)} · ${c.last_contacted ? "last " + ago(c.last_contacted) : "never contacted"}</div></div>${badge(c.rating)}</li>`).join("")}</ul>` : `<div class="empty">Every lead has been contacted recently</div>`}</div>
    <div class="card"><div class="card-h"><h3>Closing soon</h3></div>
      ${d.closing_soon.length ? `<ul class="list-plain">${d.closing_soon.map((x) => `<li><div style="flex:1;min-width:0"><a href="#/deals/${x.id}" style="font-weight:550">${esc(x.title)}</a><div class="small muted">${esc(x.company_name || x.contact_name || "")} · <span class="${x.expected_close < today() ? "down" : ""}">${fmtDate(x.expected_close)}</span></div></div><div class="right"><b>${money(x.value, 1)}</b><div>${badge(x.stage)}</div></div></li>`).join("")}</ul>` : `<div class="empty">No open deals with close dates</div>`}</div>
  </div>
  <div class="grid g-main">
    <div class="card"><div class="card-h"><h3>Recent activity</h3><div class="actions"><a class="btn sm ghost" href="#/activities">Activity log →</a></div></div>
      ${d.recent.length ? `<div class="timeline">${d.recent.map((r) => tlItem({ ...r, kind: "interaction", at: r.occurred_at })).join("")}</div>` : `<div class="empty">${icon("activity")}No activity logged yet. Calls, emails and meetings show up here.</div>`}</div>
    <div class="card"><div class="card-h"><h3>Where leads come from</h3></div><div class="card-b">${donut(d.sources)}</div></div>
  </div>`;
};

// ---------------------------------------------------------------- contacts list
const CT_STATE = { q: "", type: "", rating: "", owner_id: "", tag: "", product: "", lead_source: "", sort: "created_at", dir: "DESC", offset: 0, selected: new Set() };
ROUTES.contacts = async (id, Q) => {
  if (id) return contactDetail(+id);
  const st = CT_STATE; if (Q.type !== undefined) st.type = Q.type;
  const params = { q: st.q, type: st.type, rating: st.rating, owner_id: st.owner_id, tag: st.tag, product: st.product, lead_source: st.lead_source, sort: st.sort, dir: st.dir, offset: st.offset, limit: 50 };
  const data = await GET("/api/contacts" + qs(params));
  const cols = [
    { l: "Name", sort: "first_name", f: (r) => `<div class="name-cell">${avatar(r.first_name + " " + (r.last_name || ""), "sm")}<div><b>${esc(r.first_name)} ${esc(r.last_name || "")}</b><span class="small muted">${esc(r.title || "")}</span></div></div>` },
    { l: "Company", sort: "company_name", f: (r) => (r.company_id ? `<a href="#/companies/${r.company_id}">${esc(r.company_name)}</a>` : "") },
    { l: "Email / phone", f: (r) => `<div class="small">${esc(r.email || "")}</div><div class="small muted">${esc(r.phone || r.mobile || "")}</div>` },
    { l: "Type", sort: "type", f: (r) => badge(r.type) + (r.unsubscribed ? ' <span class="badge" title="Unsubscribed">unsub</span>' : "") },
    { l: "Rating", sort: "rating", f: (r) => badge(r.rating) },
    { l: "Interests", f: (r) => tags(r.products_interest), cls: "hide-sm" },
    { l: "Owner", sort: "owner_name", f: (r) => esc(r.owner_name || ""), cls: "hide-sm" },
    { l: "Last contact", sort: "last_contacted", f: (r) => `<span class="small ${!r.last_contacted ? "faint" : ""}">${r.last_contacted ? ago(r.last_contacted) : "never"}</span>` },
  ];
  after(() => {
    const p = $("#page");
    const reload = () => { st.offset = 0; rerender(); };
    $("#cq").oninput = debounce((e) => { st.q = e.target.value; reload(); }, 300);
    $$("[data-flt]").forEach((s) => (s.onchange = () => { st[s.dataset.flt] = s.value; reload(); }));
    bindTable(p, data.rows, { click: (r) => go(`contacts/${r.id}`), onSort: (s) => { st.dir = st.sort === s && st.dir === "ASC" ? "DESC" : "ASC"; st.sort = s; rerender(); } });
    $$("[data-pg]").forEach((b) => (b.onclick = () => { st.offset += +b.dataset.pg * 50; rerender(); }));
    $$("[data-sel]").forEach((c) => (c.onchange = () => { c.checked ? st.selected.add(+c.dataset.sel) : st.selected.delete(+c.dataset.sel); bulkbar(); }));
    const sa = $("[data-selall]"); if (sa) sa.onchange = () => { $$("[data-sel]").forEach((c) => { c.checked = sa.checked; sa.checked ? st.selected.add(+c.dataset.sel) : st.selected.delete(+c.dataset.sel); }); bulkbar(); };
    $("#ctNew") && ($("#ctNew").onclick = () => editRecord("contact").then((r) => r && go(`contacts/${r.id}`)));
    $("#ctImport") && ($("#ctImport").onclick = importContacts);
    $("#ctExport").onclick = safe(async () => { const all = await GET("/api/contacts" + qs({ ...params, offset: 0, limit: 5000 })); downloadCSV(`contacts-${today()}.csv`, CSV_COLS, all.rows); });
    bulkbar();
  });
  return `${pageHead("Contacts", `${num(data.total)} people — leads, prospects and customers`, `<button class="btn" id="ctExport">${icon("download")} Export</button>${can(1) ? `<button class="btn" id="ctImport">${icon("upload")} Import CSV</button><button class="btn primary" id="ctNew">${icon("plus")} New contact</button>` : ""}`)}
  <div class="toolbar"><input type="search" id="cq" placeholder="Search name, email, phone, company…" value="${esc(st.q)}">
    <select data-flt="type">${optList(O.contactType, st.type, "All types")}</select><select data-flt="rating">${optList(O.rating, st.rating, "Any rating")}</select>
    <select data-flt="product">${optList(O.products, st.product, "Any product")}</select><select data-flt="lead_source">${optList([...new Set([...O.source, ...S.lk.sources])], st.lead_source, "Any source")}</select>
    <select data-flt="tag">${optList(S.lk.tags, st.tag, "Any tag")}</select><select data-flt="owner_id">${optList(S.lk.users.map((u) => [u.id, u.name]), st.owner_id, "Any owner")}</select></div>
  <div class="card"><div id="bulk"></div>${table(cols, data.rows, { click: 1, sort: st.sort, dir: st.dir, selectable: can(1), selected: st.selected, empty: st.q || st.type ? "No contacts match these filters" : "No contacts yet — add your first lead or import a CSV" })}${pager(data.total, st.offset, 50)}</div>`;
};
const CSV_COLS = [{ l: "First name", k: "first_name" }, { l: "Last name", k: "last_name" }, { l: "Company", k: "company_name" }, { l: "Title", k: "title" }, { l: "Email", k: "email" }, { l: "Phone", k: "phone" }, { l: "Mobile", k: "mobile" }, { l: "WhatsApp", k: "whatsapp" }, { l: "Type", k: "type" }, { l: "Rating", k: "rating" }, { l: "Status", k: "status" }, { l: "Lead source", k: "lead_source" }, { l: "Products of interest", k: "products_interest" }, { l: "Tags", k: "tags" }, { l: "Address", k: "address" }, { l: "City", k: "city" }, { l: "State", k: "state" }, { l: "Postal code", k: "zip" }, { l: "Country", k: "country" }, { l: "Owner", k: "owner_name" }, { l: "Last contacted", k: "last_contacted" }, { l: "Unsubscribed", k: "unsubscribed" }, { l: "Notes", k: "notes" }, { l: "Created", k: "created_at" }];
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function bulkbar() {
  const st = CT_STATE, box = $("#bulk"); if (!box) return;
  if (!st.selected.size) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="bulkbar"><b>${st.selected.size} selected</b>
    <select data-bk="type" style="width:auto">${optList(O.contactType, "", "Set type…")}</select><select data-bk="rating" style="width:auto">${optList(O.rating, "", "Set rating…")}</select>
    <select data-bk="owner_id" style="width:auto">${optList(S.lk.users.map((u) => [u.id, u.name]), "", "Set owner…")}</select>
    <button class="btn sm" data-bka="tag">Add tag</button><button class="btn sm" data-bka="email">${icon("megaphone")} Email them</button>${can(2) ? `<button class="btn sm danger" data-bka="delete">Delete</button>` : ""}<button class="btn sm ghost" data-bka="clear">Clear</button></div>`;
  const run = safe(async (action, value) => { await POST("/api/contacts/bulk", { ids: [...st.selected], action, value }); toast(`Updated ${st.selected.size} contacts`); st.selected.clear(); rerender(); loadLookups(); });
  $$("[data-bk]", box).forEach((s) => (s.onchange = () => s.value && run(s.dataset.bk, s.value)));
  $$("[data-bka]", box).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.bka;
    if (a === "clear") { st.selected.clear(); rerender(); }
    if (a === "tag") { const t = prompt("Tag to add"); if (t) run("add_tag", t); }
    if (a === "delete" && (await confirmBox(`Delete ${st.selected.size} contacts? Their activity history stays but is unlinked.`))) run("delete");
    if (a === "email") { const c = await POST("/api/campaigns", { name: `Email to ${st.selected.size} selected contacts`, segment: { contact_ids: [...st.selected] }, subject: "", body_html: "<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>" }); st.selected.clear(); go(`campaigns/${c.id}`); }
  }));
}
async function importContacts() {
  let parsed = null;
  const FIELDS = [["", "— skip —"], ["first_name", "First name"], ["last_name", "Last name"], ["name", "Full name"], ["email", "Email"], ["phone", "Phone"], ["mobile", "Mobile"], ["whatsapp", "WhatsApp"], ["company", "Company name"], ["title", "Job title"], ["type", "Type"], ["rating", "Rating"], ["lead_source", "Lead source"], ["products_interest", "Products of interest"], ["tags", "Tags"], ["address", "Address"], ["city", "City"], ["state", "State"], ["zip", "Postal code"], ["country", "Country"], ["notes", "Notes"], ["linkedin", "Website / LinkedIn"]];
  const guess = (h) => { h = h.toLowerCase().replace(/[^a-z]/g, ""); const m = { firstname: "first_name", first: "first_name", lastname: "last_name", last: "last_name", surname: "last_name", name: "name", fullname: "name", contactname: "name", email: "email", emailaddress: "email", mail: "email", phone: "phone", phonenumber: "phone", telephone: "phone", tel: "phone", mobile: "mobile", cell: "mobile", whatsapp: "whatsapp", company: "company", companyname: "company", organization: "company", business: "company", businessname: "company", title: "title", jobtitle: "title", position: "title", type: "type", rating: "rating", source: "lead_source", leadsource: "lead_source", tags: "tags", address: "address", street: "address", city: "city", state: "state", province: "state", zip: "zip", zipcode: "zip", postalcode: "zip", postcode: "zip", country: "country", notes: "notes", note: "notes", website: "linkedin", products: "products_interest" }; return m[h] || ""; };
  const res = await modal({ title: "Import contacts from CSV", size: "wide", submit: "Import",
    body: `<p class="muted" style="margin-top:0">Upload a .csv file (export from Excel, Google Sheets, Gmail, Outlook, a trade-show list…). Companies are created automatically from a “Company” column.</p>
      <input type="file" accept=".csv,text/csv" id="csvf"><div id="map" style="margin-top:14px"></div>
      <div class="form-grid" style="margin-top:14px"><label class="f"><span>Set type for new contacts</span><select name="default_type">${optList(O.contactType, "Lead", null)}</select></label>
      <label class="f"><span>Lead source</span><select name="default_source">${optList(O.source, "Import", null)}</select></label>
      <label class="f"><span>Add tag to all</span><input type="text" name="default_tags" placeholder="e.g. trade-show-2026"></label>
      <label class="f"><span>If email already exists</span><select name="on_duplicate"><option value="skip">Skip it</option><option value="update">Update the existing contact</option></select></label></div>`,
    onOpen: (f) => { $("#csvf", f).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const rows = parseCSV(await file.text()); if (rows.length < 2) { toast("That file has no data rows", true); return; }
      parsed = rows;
      $("#map", f).innerHTML = `<div class="info-box" style="margin-bottom:10px">${rows.length - 1} rows found. Match each column to a CRM field:</div><div class="form-grid">${rows[0].map((h, i) => `<label class="f"><span>${esc(h || "Column " + (i + 1))} <span class="faint">e.g. “${esc((rows[1][i] || "").slice(0, 30))}”</span></span><select data-col="${i}">${optList(FIELDS, guess(h), null)}</select></label>`).join("")}</div>`;
    }; },
    onSubmit: async (f) => {
      if (!parsed) throw new Error("Choose a CSV file first");
      const map = $$("[data-col]", f).map((s) => s.value);
      if (!map.some((m) => ["first_name", "name", "email"].includes(m))) throw new Error("Map at least a name or email column");
      const rows = parsed.slice(1).map((r) => { const o = {}; map.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim()) o[k] = String(r[i]).trim(); }); return o; });
      let tot = { created: 0, updated: 0, skipped: 0, companiesCreated: 0, errors: [] };
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await POST("/api/contacts/import", { rows: rows.slice(i, i + 1000), default_type: f.default_type.value, default_source: f.default_source.value, default_tags: f.default_tags.value, on_duplicate: f.on_duplicate.value });
        for (const k of ["created", "updated", "skipped", "companiesCreated"]) tot[k] += r[k]; tot.errors.push(...r.errors);
      }
      return tot;
    } });
  if (res) { await modal({ title: "Import complete", size: "narrow", submit: null, cancel: "Done", body: `<div class="ok-box">${res.created} contacts created, ${res.updated} updated, ${res.skipped} skipped, ${res.companiesCreated} companies created.</div>${res.errors.length ? `<div class="err-box" style="margin-top:10px">${res.errors.map(esc).join("<br>")}</div>` : ""}` }); loadLookups(); rerender(); }
}

// ---------------------------------------------------------------- contact detail
async function contactDetail(id) {
  const [c, tl, rels, deals, tasks, tickets, emails] = await Promise.all([
    GET(`/api/contacts/${id}`), GET(`/api/timeline?contact_id=${id}`), GET(`/api/relationships?entity_type=contact&entity_id=${id}&limit=200`),
    GET(`/api/deals?contact_id=${id}&limit=200`), GET(`/api/tasks?contact_id=${id}&limit=200&sort=due_at&dir=ASC`), GET(`/api/tickets?contact_id=${id}&limit=200`), GET(`/api/emails?contact_id=${id}&limit=200`)]);
  const name = `${c.first_name} ${c.last_name || ""}`.trim();
  const tel = (v, l) => (v ? `<dt>${l}</dt><dd><a href="tel:${esc(v)}">${esc(v)}</a></dd>` : "");
  const wa = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, "")}` : null;
  const addr = [c.address, c.city, c.state, c.zip, c.country].filter(Boolean).join(", ");
  const openVal = deals.rows.filter((d) => !["Won", "Lost"].includes(d.stage)).reduce((s, d) => s + d.value, 0), wonVal = deals.rows.filter((d) => d.stage === "Won").reduce((s, d) => s + d.value, 0);
  after(() => {
    const p = $("#page");
    bindTimeline(p);
    $$("[data-tab]").forEach((b) => (b.onclick = () => { $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); $$("[data-pane]").forEach((x) => x.classList.toggle("hidden", x.dataset.pane !== b.dataset.tab)); }));
    const preset = { contact_id: id, company_id: c.company_id };
    const A = {
      edit: () => editRecord("contact", c).then((r) => r && rerender()),
      del: () => deleteRecord("contact", c, name).then((r) => r && go("contacts")),
      email: () => composeEmail({ contact_id: id }),
      call: () => editRecord("interaction", null, { ...preset, type: "Call" }).then((r) => r && rerender()),
      log: () => editRecord("interaction", null, { ...preset, type: "Meeting" }).then((r) => r && rerender()),
      note: () => editRecord("interaction", null, { ...preset, type: "Note", direction: "" }).then((r) => r && rerender()),
      task: () => editRecord("task", null, { ...preset, title: `Follow up with ${c.first_name}` }).then((r) => r && rerender()),
      deal: () => editRecord("deal", null, { ...preset, title: `${c.company_name || name} — ` }).then((r) => r && go(`deals/${r.id}`)),
      ticket: () => editRecord("ticket", null, preset).then((r) => r && go(`tickets/${r.id}`)),
      rel: () => addRelationship(`contact:${id}`).then((r) => r && rerender()),
    };
    $$("[data-a]").forEach((b) => (b.onclick = () => A[b.dataset.a]()));
    $$("[data-delrel]").forEach((b) => (b.onclick = safe(async () => { if (await confirmBox("Remove this relationship?", { ok: "Remove" })) { await DEL(`/api/relationships/${b.dataset.delrel}`); rerender(); } })));
    $$("[data-task-done]").forEach((b) => (b.onclick = safe(async () => { await PATCH(`/api/tasks/${b.dataset.taskDone}`, { status: b.classList.contains("on") ? "Open" : "Done" }); rerender(); })));
    $$("[data-viewem]").forEach((tr) => (tr.onclick = () => viewEmail(+tr.dataset.viewem)));
    $("#tlFilter").onchange = (e) => $$(".timeline [data-kind]").forEach((el) => el.classList.toggle("hidden", !!e.target.value && el.dataset.kind !== e.target.value));
  });
  const relHtml = rels.rows.length ? rels.rows.map((r) => { const out = r.from_type === "contact" && r.from_id === id; const [t, oid, on] = out ? [r.to_type, r.to_id, r.to_name] : [r.from_type, r.from_id, r.from_name];
    return `<li><span class="small muted" style="width:110px;flex:none">${esc(out ? r.kind : "↩ " + r.kind)}</span><a href="#/${t === "company" ? "companies" : "contacts"}/${oid}" style="flex:1">${esc(on || "?")}</a>${badge(r.strength === "Strong" ? "Hot" : "")}${can(1) ? `<button class="icon-btn" data-delrel="${r.id}">${icon("x")}</button>` : ""}</li>`; }).join("") : "";
  const w = can(1);
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/contacts">Contacts</a> / ${esc(name)}</div>
  <div class="grid g-side">
    <div class="grid" style="align-content:start">
      <div class="card"><div class="profile-head">${avatar(name, "lg")}<div class="info"><h1>${esc(name)}</h1><div class="muted">${esc(c.title || "")}${c.title && c.company_name ? " at " : ""}${c.company_id ? `<a href="#/companies/${c.company_id}">${esc(c.company_name)}</a>` : ""}</div>
        <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap">${badge(c.type)}${badge(c.rating)}${c.status !== "Active" ? badge(c.status) : ""}${c.unsubscribed ? '<span class="badge b-red">Unsubscribed</span>' : ""}</div></div>
        ${w ? `<button class="icon-btn" data-a="edit" title="Edit">${icon("edit")}</button>` : ""}</div>
        ${w ? `<div class="quick"><button class="btn sm" data-a="email">${icon("mail")} Email</button><button class="btn sm" data-a="call">${icon("phone")} Log call</button><button class="btn sm" data-a="log">${icon("calendar")} Log meeting</button><button class="btn sm" data-a="note">${icon("note")} Note</button><button class="btn sm" data-a="task">${icon("tasks")} Task</button><button class="btn sm" data-a="deal">${icon("dollar")} Deal</button><button class="btn sm" data-a="ticket">${icon("ticket")} Ticket</button></div>` : ""}</div>
      <div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="props">
        ${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}${tel(c.phone, "Phone")}${tel(c.mobile, "Mobile")}
        ${wa ? `<dt>WhatsApp</dt><dd><a href="${wa}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a></dd>` : ""}
        ${addr ? `<dt>Address</dt><dd>${esc(addr)}</dd>` : ""}${c.department ? `<dt>Department</dt><dd>${esc(c.department)}</dd>` : ""}
        ${c.linkedin ? `<dt>Web</dt><dd><a href="${esc(c.linkedin)}" target="_blank" rel="noopener">${esc(c.linkedin.replace(/^https?:\/\//, ""))}</a></dd>` : ""}
        <dt>Interested in</dt><dd>${tags(c.products_interest) || '<span class="faint">—</span>'}</dd>
        ${c.monthly_volume ? `<dt>Volume</dt><dd>${esc(c.monthly_volume)}</dd>` : ""}${c.preferred_channel ? `<dt>Prefers</dt><dd>${esc(c.preferred_channel)}</dd>` : ""}
        <dt>Lead source</dt><dd>${esc(c.lead_source || "—")}</dd>${c.lead_score ? `<dt>Lead score</dt><dd><div class="progress" style="margin-top:6px"><div style="width:${Math.min(100, c.lead_score)}%"></div></div><span class="small">${c.lead_score}/100</span></dd>` : ""}
        <dt>Owner</dt><dd>${esc(c.owner_name || "Unassigned")}</dd><dt>Last contacted</dt><dd>${c.last_contacted ? fmtDT(c.last_contacted) : "Never"}</dd>
        ${c.birthday ? `<dt>Birthday</dt><dd>${fmtDate(c.birthday)}</dd>` : ""}<dt>Tags</dt><dd>${tags(c.tags) || '<span class="faint">—</span>'}</dd><dt>Added</dt><dd>${fmtDate(c.created_at)}</dd>
      </dl>${c.notes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);white-space:pre-wrap">${esc(c.notes)}</div>` : ""}</div></div>
      <div class="card"><div class="card-h"><h3>Relationships</h3>${w ? `<div class="actions"><button class="btn sm" data-a="rel">${icon("plus")} Add</button></div>` : ""}</div>
        ${c.company_id ? `<ul class="list-plain"><li><span class="small muted" style="width:110px;flex:none">Works at</span><a href="#/companies/${c.company_id}" style="flex:1">${esc(c.company_name)}</a></li>${relHtml}</ul>` : relHtml ? `<ul class="list-plain">${relHtml}</ul>` : `<div class="empty small">Map who they report to, who referred them, and who decides.</div>`}
        <div style="padding:8px 16px 12px"><a class="small" href="#/relationships?focus=contact:${id}">View on relationship map →</a></div></div>
      ${w && can(2) ? `<button class="btn danger sm" data-a="del" style="justify-self:start">${icon("trash")} Delete contact</button>` : ""}
    </div>
    <div class="grid" style="align-content:start">
      <div class="kpis" style="margin:0"><div class="kpi"><div class="l">Open deals</div><div class="v">${money(openVal, 1)}</div></div><div class="kpi"><div class="l">Lifetime won</div><div class="v">${money(wonVal, 1)}</div></div>
        <div class="kpi"><div class="l">Interactions</div><div class="v">${tl.items.filter((i) => i.kind === "interaction").length}</div></div><div class="kpi"><div class="l">Open tickets</div><div class="v">${tickets.rows.filter((t) => !["Resolved", "Closed"].includes(t.status)).length}</div></div></div>
      <div class="card"><div class="tabs"><button class="on" data-tab="tl">Timeline<span class="n">${tl.items.length}</span></button><button data-tab="deals">Deals<span class="n">${deals.total}</span></button><button data-tab="tasks">Tasks<span class="n">${tasks.total}</span></button><button data-tab="tickets">Tickets<span class="n">${tickets.total}</span></button><button data-tab="emails">Emails<span class="n">${emails.total}</span></button></div>
        <div data-pane="tl"><div style="padding:12px 16px 0;display:flex;gap:8px"><select id="tlFilter" style="width:auto"><option value="">All activity</option><option value="interaction">Interactions</option><option value="deal">Deals</option><option value="task">Tasks</option><option value="ticket">Tickets</option><option value="campaign">Campaigns</option></select></div>
          ${tl.items.length ? `<div class="timeline">${tl.items.map((i) => `<div data-kind="${i.kind}">${tlItem({ ...i, _onContact: 1 })}</div>`).join("")}</div>` : `<div class="empty">${icon("activity")}No history yet. Log a call or send an email to start the timeline.</div>`}</div>
        <div data-pane="deals" class="hidden">${dealsMini(deals.rows)}</div>
        <div data-pane="tasks" class="hidden">${tasksMini(tasks.rows)}</div>
        <div data-pane="tickets" class="hidden">${table([{ l: "#", f: (t) => `<a href="#/tickets/${t.id}">#${t.id}</a>` }, { l: "Subject", f: (t) => `<a href="#/tickets/${t.id}">${esc(t.subject)}</a>` }, { l: "Status", f: (t) => badge(t.status) }, { l: "Priority", f: (t) => badge(t.priority) }, { l: "Opened", f: (t) => fmtDate(t.created_at) }], tickets.rows, { empty: "No support tickets" })}</div>
        <div data-pane="emails" class="hidden">${emails.rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Subject</th><th>Status</th><th>Date</th></tr></thead><tbody>${emails.rows.map((e) => `<tr class="click" data-viewem="${e.id}"><td>${e.direction === "in" ? '<span class="badge b-blue">In</span>' : '<span class="badge">Out</span>'}</td><td>${esc(e.subject)}</td><td>${badge(e.status)}${e.opened_at ? ' <span class="badge b-green">Opened</span>' : ""}</td><td class="small nowrap">${fmtDT(e.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No emails yet</div>`}</div>
      </div>
    </div>
  </div>`;
}
const dealsMini = (rows) => table([{ l: "Deal", f: (d) => `<a href="#/deals/${d.id}">${esc(d.title)}</a>` }, { l: "Stage", f: (d) => badge(d.stage) }, { l: "Value", num: 1, f: (d) => money(d.value) }, { l: "Close", f: (d) => fmtDate(d.expected_close || d.closed_at) }, { l: "Owner", f: (d) => esc(d.owner_name || "") }], rows, { empty: "No deals yet" });
const tasksMini = (rows) => rows.length ? `<ul class="list-plain">${rows.map((t) => `<li><span class="check ${t.status === "Done" ? "on" : ""}" data-task-done="${t.id}">${t.status === "Done" ? icon("check") : ""}</span><div style="flex:1"><div style="${t.status === "Done" ? "text-decoration:line-through;color:var(--muted)" : "font-weight:550"}">${esc(t.title)}</div><div class="small muted">${esc(t.type)} · ${t.due_at ? fmtDate(t.due_at) : "no date"} · ${esc(t.assignee_name || "")}</div></div>${badge(t.priority !== "Normal" ? t.priority : "")}</li>`).join("")}</ul>` : `<div class="empty">No tasks</div>`;

// ---------------------------------------------------------------- companies
const CO_STATE = { q: "", type: "", industry: "", owner_id: "", sort: "name", dir: "ASC", offset: 0 };
ROUTES.companies = async (id) => {
  if (id) return companyDetail(+id);
  const st = CO_STATE;
  const data = await GET("/api/companies" + qs({ ...st, limit: 50 }));
  const cols = [
    { l: "Company", sort: "name", f: (r) => `<div class="name-cell"><span class="avatar sm" style="border-radius:6px;background:var(--c2)">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><span class="small muted">${esc(r.website ? r.website.replace(/^https?:\/\//, "") : "")}</span></div></div>` },
    { l: "Type", sort: "type", f: (r) => badge(r.type) }, { l: "Industry", sort: "industry", f: (r) => esc(r.industry || "") },
    { l: "Location", f: (r) => esc([r.city, r.state || r.country].filter(Boolean).join(", ")), cls: "hide-sm" },
    { l: "Contacts", sort: "contact_count", num: 1, f: (r) => num(r.contact_count) }, { l: "Open pipeline", sort: "open_value", num: 1, f: (r) => money(r.open_value, 1) }, { l: "Won", sort: "won_value", num: 1, f: (r) => money(r.won_value, 1) },
    { l: "Owner", sort: "owner_name", f: (r) => esc(r.owner_name || ""), cls: "hide-sm" },
  ];
  after(() => {
    $("#coq").oninput = debounce((e) => { st.q = e.target.value; st.offset = 0; rerender(); }, 300);
    $$("[data-flt]").forEach((s) => (s.onchange = () => { st[s.dataset.flt] = s.value; st.offset = 0; rerender(); }));
    bindTable($("#page"), data.rows, { click: (r) => go(`companies/${r.id}`), onSort: (s) => { st.dir = st.sort === s && st.dir === "ASC" ? "DESC" : "ASC"; st.sort = s; rerender(); } });
    $$("[data-pg]").forEach((b) => (b.onclick = () => { st.offset += +b.dataset.pg * 50; rerender(); }));
    $("#coNew") && ($("#coNew").onclick = () => editRecord("company").then((r) => r && go(`companies/${r.id}`)));
    $("#coExport").onclick = safe(async () => { const all = await GET("/api/companies" + qs({ ...st, offset: 0, limit: 5000 })); downloadCSV(`companies-${today()}.csv`, [{ l: "Name", k: "name" }, { l: "Type", k: "type" }, { l: "Industry", k: "industry" }, { l: "Website", k: "website" }, { l: "Email", k: "email" }, { l: "Phone", k: "phone" }, { l: "Address", k: "address" }, { l: "City", k: "city" }, { l: "State", k: "state" }, { l: "Country", k: "country" }, { l: "Payment terms", k: "payment_terms" }, { l: "Contacts", k: "contact_count" }, { l: "Won value", k: "won_value" }, { l: "Owner", k: "owner_name" }, { l: "Tags", k: "tags" }], all.rows); });
  });
  return `${pageHead("Companies", `${num(data.total)} accounts`, `<button class="btn" id="coExport">${icon("download")} Export</button>${can(1) ? `<button class="btn primary" id="coNew">${icon("plus")} New company</button>` : ""}`)}
  <div class="toolbar"><input type="search" id="coq" placeholder="Search companies…" value="${esc(st.q)}"><select data-flt="type">${optList(O.companyType, st.type, "All types")}</select>
    <select data-flt="industry">${optList(O.industry, st.industry, "All industries")}</select><select data-flt="owner_id">${optList(S.lk.users.map((u) => [u.id, u.name]), st.owner_id, "Any owner")}</select></div>
  <div class="card">${table(cols, data.rows, { click: 1, sort: st.sort, dir: st.dir, empty: "No companies yet" })}${pager(data.total, st.offset, 50)}</div>`;
};
async function companyDetail(id) {
  const [c, contacts, deals, tl, rels, tickets, subs] = await Promise.all([GET(`/api/companies/${id}`), GET(`/api/contacts?company_id=${id}&limit=500&sort=first_name&dir=ASC`), GET(`/api/deals?company_id=${id}&limit=200`), GET(`/api/timeline?company_id=${id}`), GET(`/api/relationships?entity_type=company&entity_id=${id}&limit=200`), GET(`/api/tickets?company_id=${id}&limit=100`), GET(`/api/companies?parent_id=${id}&limit=100`)]);
  const addr = [c.address, c.city, c.state, c.zip, c.country].filter(Boolean).join(", ");
  after(() => {
    bindTimeline($("#page"));
    $$("[data-tab]").forEach((b) => (b.onclick = () => { $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); $$("[data-pane]").forEach((x) => x.classList.toggle("hidden", x.dataset.pane !== b.dataset.tab)); }));
    const pre = { company_id: id };
    const A = {
      edit: () => editRecord("company", c).then((r) => r && rerender()), del: () => deleteRecord("company", c, c.name).then((r) => r && go("companies")),
      contact: () => editRecord("contact", null, pre).then((r) => r && rerender()), deal: () => editRecord("deal", null, { ...pre, title: `${c.name} — ` }).then((r) => r && go(`deals/${r.id}`)),
      log: () => editRecord("interaction", null, pre).then((r) => r && rerender()), task: () => editRecord("task", null, pre).then((r) => r && rerender()),
      email: () => composeEmail({ company_id: id }), rel: () => addRelationship(`company:${id}`).then((r) => r && rerender()), ticket: () => editRecord("ticket", null, pre).then((r) => r && go(`tickets/${r.id}`)),
    };
    $$("[data-a]").forEach((b) => (b.onclick = () => A[b.dataset.a]()));
    $$("[data-delrel]").forEach((b) => (b.onclick = safe(async () => { if (await confirmBox("Remove this relationship?", { ok: "Remove" })) { await DEL(`/api/relationships/${b.dataset.delrel}`); rerender(); } })));
    bindTable($("[data-pane=people]"), contacts.rows, { click: (r) => go(`contacts/${r.id}`) });
  });
  const w = can(1);
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/companies">Companies</a> / ${esc(c.name)}</div>
  <div class="grid g-side"><div class="grid" style="align-content:start">
    <div class="card"><div class="profile-head"><span class="avatar lg" style="border-radius:12px;background:var(--c2)">${esc(initials(c.name))}</span><div class="info"><h1>${esc(c.name)}</h1><div class="muted">${esc(c.industry || "")}${c.city ? " · " + esc(c.city) : ""}</div><div style="margin-top:8px;display:flex;gap:5px">${badge(c.type)}${badge(c.rating)}</div></div>${w ? `<button class="icon-btn" data-a="edit">${icon("edit")}</button>` : ""}</div>
      ${w ? `<div class="quick"><button class="btn sm" data-a="contact">${icon("plus")} Contact</button><button class="btn sm" data-a="deal">${icon("dollar")} Deal</button><button class="btn sm" data-a="email">${icon("mail")} Email</button><button class="btn sm" data-a="log">${icon("activity")} Log</button><button class="btn sm" data-a="task">${icon("tasks")} Task</button><button class="btn sm" data-a="ticket">${icon("ticket")} Ticket</button></div>` : ""}</div>
    <div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><dl class="props">
      ${c.website ? `<dt>Website</dt><dd><a href="${esc(/^https?:/.test(c.website) ? c.website : "https://" + c.website)}" target="_blank" rel="noopener">${esc(c.website)}</a></dd>` : ""}${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}${c.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd>` : ""}
      ${addr ? `<dt>Address</dt><dd>${esc(addr)}</dd>` : ""}<dt>Payment terms</dt><dd>${esc(c.payment_terms || "—")}</dd>${c.credit_limit ? `<dt>Credit limit</dt><dd>${money(c.credit_limit)}</dd>` : ""}
      ${c.annual_volume ? `<dt>Volume</dt><dd>${esc(c.annual_volume)}</dd>` : ""}${c.employees ? `<dt>Size</dt><dd>${esc(c.employees)}</dd>` : ""}${c.tax_id ? `<dt>Tax ID</dt><dd>${esc(c.tax_id)}</dd>` : ""}
      ${c.parent_id ? `<dt>Parent</dt><dd><a href="#/companies/${c.parent_id}">${esc(c.parent_name)}</a></dd>` : ""}${subs.rows.length ? `<dt>Subsidiaries</dt><dd>${subs.rows.map((s) => `<a href="#/companies/${s.id}">${esc(s.name)}</a>`).join(", ")}</dd>` : ""}
      <dt>Owner</dt><dd>${esc(c.owner_name || "Unassigned")}</dd><dt>Tags</dt><dd>${tags(c.tags) || "—"}</dd></dl>${c.notes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);white-space:pre-wrap">${esc(c.notes)}</div>` : ""}</div></div>
    <div class="card"><div class="card-h"><h3>Relationships</h3>${w ? `<div class="actions"><button class="btn sm" data-a="rel">${icon("plus")} Add</button></div>` : ""}</div>
      ${rels.rows.length ? `<ul class="list-plain">${rels.rows.map((r) => { const out = r.from_type === "company" && r.from_id === id; const [t, oid, on] = out ? [r.to_type, r.to_id, r.to_name] : [r.from_type, r.from_id, r.from_name]; return `<li><span class="small muted" style="width:120px;flex:none">${esc(out ? r.kind : "↩ " + r.kind)}</span><a href="#/${t === "company" ? "companies" : "contacts"}/${oid}" style="flex:1">${esc(on || "?")}</a>${w ? `<button class="icon-btn" data-delrel="${r.id}">${icon("x")}</button>` : ""}</li>`; }).join("")}</ul>` : `<div class="empty small">Link distributors, parent companies, referrals…</div>`}
      <div style="padding:8px 16px 12px"><a class="small" href="#/relationships?focus=company:${id}">View on relationship map →</a></div></div>
    ${can(2) ? `<button class="btn danger sm" data-a="del" style="justify-self:start">${icon("trash")} Delete company</button>` : ""}
  </div><div class="grid" style="align-content:start">
    <div class="kpis" style="margin:0"><div class="kpi"><div class="l">Lifetime won</div><div class="v">${money(c.won_value, 1)}</div></div><div class="kpi"><div class="l">Open pipeline</div><div class="v">${money(c.open_value, 1)}</div></div><div class="kpi"><div class="l">Contacts</div><div class="v">${c.contact_count}</div></div><div class="kpi"><div class="l">Tickets</div><div class="v">${tickets.total}</div></div></div>
    <div class="card"><div class="tabs"><button class="on" data-tab="people">People<span class="n">${contacts.total}</span></button><button data-tab="deals">Deals<span class="n">${deals.total}</span></button><button data-tab="tl">Timeline<span class="n">${tl.items.length}</span></button><button data-tab="tickets">Tickets<span class="n">${tickets.total}</span></button></div>
      <div data-pane="people">${table([{ l: "Name", f: (r) => `<div class="name-cell">${avatar(r.first_name + " " + (r.last_name || ""), "sm")}<b>${esc(r.first_name)} ${esc(r.last_name || "")}</b></div>` }, { l: "Title", k: "title" }, { l: "Email", k: "email" }, { l: "Phone", f: (r) => esc(r.phone || r.mobile || "") }, { l: "Type", f: (r) => badge(r.type) }], contacts.rows, { click: 1, empty: "No people at this company yet" })}</div>
      <div data-pane="deals" class="hidden">${dealsMini(deals.rows)}</div>
      <div data-pane="tl" class="hidden">${tl.items.length ? `<div class="timeline">${tl.items.map(tlItem).join("")}</div>` : `<div class="empty">No activity yet</div>`}</div>
      <div data-pane="tickets" class="hidden">${table([{ l: "#", f: (t) => `<a href="#/tickets/${t.id}">#${t.id}</a>` }, { l: "Subject", f: (t) => `<a href="#/tickets/${t.id}">${esc(t.subject)}</a>` }, { l: "Contact", k: "contact_name" }, { l: "Status", f: (t) => badge(t.status) }, { l: "Opened", f: (t) => fmtDate(t.created_at) }], tickets.rows, { empty: "No tickets" })}</div>
    </div></div></div>`;
}

// ---------------------------------------------------------------- relationships
async function addRelationship(from) {
  const fields = F.relationship();
  return modal({ title: "Add relationship", body: formHtml(fields, { from }) + `<div class="hint" style="margin-top:10px">Read it as a sentence: <i>From</i> → <i>relationship</i> → <i>To</i>. e.g. “Priya → Reports to → Raj”, “Asha → Referred → Gift Mart”.</div>`,
    onOpen: (f) => bindForm(f),
    onSubmit: async (f) => {
      const d = readForm(f, fields);
      if (!d.from_id || !d.to_id) throw new Error("Choose both sides of the relationship");
      if (d.from_type === d.to_type && d.from_id === d.to_id) throw new Error("A record can't be related to itself");
      return POST("/api/relationships", { from_type: d.from_type, from_id: +d.from_id, to_type: d.to_type, to_id: +d.to_id, kind: d.kind, strength: d.strength, notes: d.notes });
    } });
}
ROUTES.relationships = async (_, Q) => {
  const focus = Q.focus || "", all = Q.all === "1";
  const g = await GET("/api/graph" + qs({ focus, connected_only: all ? "0" : "1", depth: Q.depth || 2 }));
  const list = await GET("/api/relationships" + qs(focus ? { entity_type: focus.split(":")[0], entity_id: focus.split(":")[1], limit: 500 } : { limit: 500 }));
  after(() => {
    $("#gfocus").onchange = (e) => go(`relationships${e.target.value ? "?focus=" + e.target.value : ""}`);
    $("#gall") && ($("#gall").onchange = (e) => go(`relationships${e.target.checked ? "?all=1" : ""}`));
    $("#gAdd") && ($("#gAdd").onclick = () => addRelationship(focus).then((r) => r && rerender()));
    drawGraph($("#graph"), g, focus);
    $$("[data-delrel]").forEach((b) => (b.onclick = safe(async () => { if (await confirmBox("Remove this relationship?", { ok: "Remove" })) { await DEL(`/api/relationships/${b.dataset.delrel}`); rerender(); } })));
  });
  const lnk = (t, id, n) => `<a href="#/${t === "company" ? "companies" : "contacts"}/${id}">${t === "company" ? "🏢" : "👤"} ${esc(n || "?")}</a>`;
  const opts = [...S.lk.companies.map((c) => [`company:${c.id}`, "🏢 " + c.name]), ...S.lk.contacts.map((c) => [`contact:${c.id}`, "👤 " + c.name])];
  return `${pageHead("Relationship map", "See how people and companies connect — who works where, who reports to whom, who referred whom.", can(1) ? `<button class="btn primary" id="gAdd">${icon("link")} Add relationship</button>` : "")}
  <div class="card"><div class="card-h" style="flex-wrap:wrap"><select id="gfocus" style="max-width:320px">${optList(opts, focus, "Show the whole network")}</select>${!focus ? `<label class="switch small"><input type="checkbox" id="gall" ${all ? "checked" : ""}> Include unconnected records</label>` : `<a class="btn sm" href="#/${focus.startsWith("company") ? "companies" : "contacts"}/${focus.split(":")[1]}">Open profile →</a>`}
    <div class="legend" style="margin:0 0 0 auto"><span><i style="background:var(--c2);border-radius:50%"></i>Company</span><span><i style="background:var(--c1);border-radius:50%"></i>Person</span><span><i style="background:var(--c1);height:3px"></i>Relationship</span><span><i style="background:var(--border2);height:2px"></i>Works at</span></div></div>
    <div class="graph-wrap" id="graph">${g.nodes.length ? "" : `<div class="empty" style="padding-top:120px">${icon("network")}No relationships yet. Add contacts to companies, or link people with “Add relationship”.</div>`}</div></div>
  <div class="small muted" style="margin-top:8px">Drag to pan, scroll to zoom, drag a circle to move it, click a circle to open the profile. ${num(g.nodes.length)} records · ${num(g.edges.length)} links.</div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>All relationships</h3><span class="badge">${list.total}</span></div>${table([{ l: "From", f: (r) => lnk(r.from_type, r.from_id, r.from_name) }, { l: "Relationship", f: (r) => `<b>${esc(r.kind)}</b>` }, { l: "To", f: (r) => lnk(r.to_type, r.to_id, r.to_name) }, { l: "Strength", f: (r) => esc(r.strength || "") }, { l: "Notes", f: (r) => `<span class="small muted">${esc(r.notes || "")}</span>` }, { l: "", f: (r) => (can(1) ? `<button class="icon-btn" data-delrel="${r.id}">${icon("x")}</button>` : "") }], list.rows, { empty: "No explicit relationships yet" })}</div>`;
};
function drawGraph(box, g, focus) {
  if (!g.nodes.length) return;
  const W = box.clientWidth, H = box.clientHeight, idx = new Map(g.nodes.map((n, i) => [n.id, i]));
  const N = g.nodes.map((n, i) => ({ ...n, x: W / 2 + Math.cos(i * 2.4) * (40 + i * 3), y: H / 2 + Math.sin(i * 2.4) * (40 + i * 3), vx: 0, vy: 0, deg: 0 }));
  const E = g.edges.map((e) => ({ ...e, s: idx.get(e.from), t: idx.get(e.to) })).filter((e) => e.s != null && e.t != null);
  E.forEach((e) => { N[e.s].deg++; N[e.t].deg++; });
  const fi = idx.get(focus); if (fi != null) { N[fi].x = W / 2; N[fi].y = H / 2; N[fi].fixed = true; }
  for (let it = 0; it < 320; it++) {
    const a = 1 - it / 320;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      let dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d2 = dx * dx + dy * dy + 0.01; if (d2 > 250000) continue;
      const f = (7000 / d2) * a, d = Math.sqrt(d2); dx /= d; dy /= d; N[i].vx += dx * f; N[i].vy += dy * f; N[j].vx -= dx * f; N[j].vy -= dy * f;
    }
    for (const e of E) { const s = N[e.s], t = N[e.t]; const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - (e.implicit ? 90 : 150)) * 0.03 * a; s.vx += (dx / d) * f; s.vy += (dy / d) * f; t.vx -= (dx / d) * f; t.vy -= (dy / d) * f; }
    for (const n of N) { n.vx += (W / 2 - n.x) * 0.002 * a; n.vy += (H / 2 - n.y) * 0.002 * a; if (!n.fixed) { n.x += Math.max(-20, Math.min(20, n.vx)); n.y += Math.max(-20, Math.min(20, n.vy)); } n.vx *= 0.55; n.vy *= 0.55; }
  }
  const xs = N.map((n) => n.x), ys = N.map((n) => n.y), pad = 70;
  const bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const k0 = Math.min(1.6, W / bw, H / bh);
  let view = { k: k0, x: W / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k0, y: H / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k0 };
  box.innerHTML = `<svg><g id="vp"></g></svg>`;
  const svg = $("svg", box), vp = $("#vp", box);
  const radius = (n) => (n.kind === "company" ? 13 : 8) + Math.min(n.deg, 10) * 0.9;
  const render = () => {
    vp.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
    vp.innerHTML = E.map((e) => { const s = N[e.s], t = N[e.t]; return `<line class="edge ${e.implicit ? "" : "explicit"}" x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" ${e.strength === "Weak" ? 'stroke-dasharray="4 3"' : ""}><title>${esc(s.label)} — ${esc(e.kind)} — ${esc(t.label)}</title></line>${e.implicit ? "" : `<text class="elabel" x="${(s.x + t.x) / 2}" y="${(s.y + t.y) / 2 - 3}" text-anchor="middle">${esc(e.kind)}</text>`}`; }).join("")
      + N.map((n, i) => `<g class="node" data-n="${i}" transform="translate(${n.x},${n.y})"><circle r="${radius(n)}" fill="${n.kind === "company" ? "var(--c2)" : "var(--c1)"}" stroke="${n.id === focus ? "var(--red)" : "var(--surface)"}" stroke-width="${n.id === focus ? 3 : 2}"/><text y="${radius(n) + 12}" text-anchor="middle">${esc(n.label)}</text><title>${esc(n.label)}${n.sub ? " — " + esc(n.sub) : ""} (${esc(n.type || n.kind)})</title></g>`).join("");
  };
  render();
  let drag = null, moved = false;
  svg.addEventListener("pointerdown", (e) => { const nd = e.target.closest(".node"); moved = false; drag = nd ? { node: N[+nd.dataset.n], sx: e.clientX, sy: e.clientY } : { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; if (drag.pan) { view.x = drag.vx + dx; view.y = drag.vy + dy; } else { drag.node.x += dx / view.k; drag.node.y += dy / view.k; drag.sx = e.clientX; drag.sy = e.clientY; } render(); });
  svg.addEventListener("pointerup", (e) => { if (drag && drag.node && !moved) go(`${drag.node.kind === "company" ? "companies" : "contacts"}/${drag.node.ref}`); drag = null; });
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = Math.max(0.2, Math.min(4, view.k * (e.deltaY < 0 ? 1.12 : 0.89))); view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2; render(); }, { passive: false });
}
