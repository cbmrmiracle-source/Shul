/* Marketing (campaigns, templates, inbox), service (tickets), analytics, admin */
"use strict";

// ---------------------------------------------------------------- campaigns
ROUTES.campaigns = async (id) => {
  if (id) return campaignPage(+id);
  const data = await GET("/api/campaigns?limit=200");
  after(() => {
    bindTable($("#page"), data.rows, { click: (r) => go(`campaigns/${r.id}`) });
    $("#cmNew") && ($("#cmNew").onclick = safe(async () => {
      const r = await modal({ title: "New email campaign", size: "narrow", submit: "Create", body: `<label class="f"><span>Campaign name</span><input type="text" name="name" required placeholder="e.g. Spring burlap price list"></label>`, onSubmit: (f) => { if (!f.name.value.trim()) throw new Error("Name required"); return POST("/api/campaigns", { name: f.name.value, segment: { types: ["Lead", "Prospect"] }, body_html: "<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>" }); } });
      if (r) go(`campaigns/${r.id}`);
    }));
  });
  return `${pageHead("Email campaigns", "Send personalized outreach and newsletters to segments of your contacts, with open & click tracking", can(1) ? `<button class="btn primary" id="cmNew">${icon("plus")} New campaign</button>` : "")}
  ${!S.settings.email_ready ? `<div class="warn-box" style="margin-bottom:12px">Email sending isn't configured yet. ${can(3) ? `<a href="#/settings">Set it up in Settings → Email</a>.` : "Ask your administrator to set it up."}</div>` : ""}
  <div class="card">${table([
    { l: "Campaign", f: (c) => `<b>${esc(c.name)}</b><div class="small muted">${esc(c.subject || "No subject yet")}</div>` }, { l: "Status", f: (c) => badge(c.status) },
    { l: "Recipients", num: 1, f: (c) => num(c.recipients) }, { l: "Sent", num: 1, f: (c) => num(c.sent) },
    { l: "Opened", num: 1, f: (c) => (c.sent ? `${num(c.opened)} <span class="small muted">(${pct(c.opened / c.sent)})</span>` : "—") },
    { l: "Clicked", num: 1, f: (c) => (c.sent ? `${num(c.clicked)} <span class="small muted">(${pct(c.clicked / c.sent)})</span>` : "—") },
    { l: "Date", f: (c) => fmtDate(c.sent_at || c.created_at) }, { l: "By", k: "creator_name" },
  ], data.rows, { click: 1, empty: "No campaigns yet — create one to reach out to your leads" })}</div>`;
};
async function campaignPage(id) {
  const c = await GET(`/api/campaigns/${id}`);
  if (c.status !== "Draft") return campaignStats(c);
  const seg = JSON.parse(c.segment || "{}");
  const chips = (key, opts, sel = []) => `<div class="checks">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label><input type="checkbox" data-seg="${key}" value="${esc(v)}" ${sel.map(String).includes(String(v)) ? "checked" : ""}>${esc(l)}</label>`; }).join("")}</div>`;
  after(() => {
    const p = $("#page"); bindEditor(p);
    const readSeg = () => { const s = {}; $$("[data-seg]:checked", p).forEach((x) => (s[x.dataset.seg] = [...(s[x.dataset.seg] || []), x.value])); const nd = +$("#segNC").value; if (nd) s.not_contacted_days = nd; if (seg.contact_ids) s.contact_ids = seg.contact_ids; return s; };
    const refresh = debounce(safe(async () => {
      const r = await POST("/api/campaigns/segment-preview", { segment: readSeg() });
      $("#segCount").innerHTML = `<b style="font-size:20px">${num(r.count)}</b> recipients`;
      $("#segSample").innerHTML = r.sample.length ? r.sample.slice(0, 8).map((x) => `${esc(x.first_name)} ${esc(x.last_name || "")} <span class="faint">${esc(x.company_name || x.email)}</span>`).join("<br>") + (r.count > 8 ? `<br><span class="faint">…and ${r.count - 8} more</span>` : "") : `<span class="faint">No contacts match. Only contacts with an email who haven't unsubscribed are included.</span>`;
    }), 250);
    p.addEventListener("change", (e) => { if (e.target.matches("[data-seg],#segNC")) refresh(); });
    refresh();
    const collect = () => ({ name: $("#cmName").value, subject: $("#cmSubj").value, preheader: $("#cmPre").value, body_html: editorValue(p, "body"), segment: readSeg() });
    const save = async (quiet) => { await PATCH(`/api/campaigns/${id}`, collect()); if (!quiet) toast("Draft saved"); };
    $("#cmTpl").onchange = (e) => { const t = S.lk.templates.find((x) => x.id === +e.target.value); if (t) { $("#cmSubj").value = t.subject || ""; setEditor(p, "body", t.body_html || ""); } e.target.value = ""; };
    $("#cmSave").onclick = safe(() => save());
    $("#cmPreview").onclick = safe(async () => { await save(true); await modal({ title: "Preview", size: "wide", submit: null, cancel: "Close", body: `<div class="small muted" style="margin-bottom:8px">Merge fields are shown filled in for a sample recipient when sent. Subject: <b>${esc($("#cmSubj").value)}</b></div><iframe class="preview" sandbox=""></iframe>`, onOpen: (f) => ($("iframe", f).srcdoc = `<div style="background:#f6f3ee;padding:20px;font-family:Arial"><div style="max-width:600px;margin:auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8e1d6"><div style="background:#7a5a2f;color:#fff;padding:18px 28px;font-weight:bold">${esc(S.settings.company_name)}</div><div style="padding:28px;font-size:15px;line-height:1.6">${editorValue(p, "body")}</div><div style="padding:16px 28px;background:#faf7f2;color:#8a8073;font-size:12px">${esc(S.settings.company_name)} · Unsubscribe</div></div></div>`) }); });
    $("#cmTest").onclick = safe(async () => { await save(true); const to = prompt("Send a test email to:", S.me.email); if (!to) return; await POST(`/api/campaigns/${id}/test`, { to }); toast("Test email sent to " + to); });
    $("#cmDel") && ($("#cmDel").onclick = safe(async () => { if (await confirmBox("Delete this draft campaign?")) { await DEL(`/api/campaigns/${id}`); go("campaigns"); } }));
    $("#cmSend") && ($("#cmSend").onclick = safe(async () => {
      await save(true);
      const prev = await POST("/api/campaigns/segment-preview", { segment: readSeg() });
      if (!$("#cmSubj").value.trim()) throw new Error("Add a subject line first");
      if (!(await confirmBox(`Send <b>${esc($("#cmSubj").value)}</b> to <b>${num(prev.count)}</b> contacts now? This can't be undone.`, { title: "Send campaign", ok: "Send now", danger: false }))) return;
      const ov = document.createElement("div"); ov.className = "overlay"; ov.innerHTML = `<div class="modal narrow"><div class="modal-b center"><span class="spinner"></span><p id="sendProg">Sending…</p></div></div>`; document.body.appendChild(ov);
      try { let r, sent = 0, failed = 0; do { r = await POST(`/api/campaigns/${id}/send`); sent += r.sent; failed += r.failed; $("#sendProg").textContent = `Sent ${sent}${failed ? `, ${failed} failed` : ""} — ${r.remaining} remaining…`; } while (r.remaining > 0 && (r.sent || r.failed)); toast(`Campaign sent to ${sent} contacts${failed ? `, ${failed} failed` : ""}`); }
      finally { ov.remove(); rerender(); }
    }));
  });
  const users = S.lk.users.map((u) => [u.id, u.name]);
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/campaigns">Campaigns</a> / ${esc(c.name)}</div>
  ${pageHead("Edit campaign", "Draft — choose who receives it, write the email, send a test, then send.", `<button class="btn" id="cmSave">Save draft</button><button class="btn" id="cmPreview">${icon("eye")} Preview</button><button class="btn" id="cmTest">${icon("send")} Send test</button>${can(2) ? `<button class="btn primary" id="cmSend">${icon("megaphone")} Send campaign</button>` : ""}`)}
  ${!can(2) ? `<div class="info-box" style="margin-bottom:12px">You can prepare this campaign; a manager or admin sends it.</div>` : ""}
  <div class="grid g-main"><div class="card"><div class="card-b"><div class="form-grid">
    <label class="f full"><span>Campaign name (internal)</span><input type="text" id="cmName" value="${esc(c.name)}"></label>
    <label class="f full"><span>Subject line</span><input type="text" id="cmSubj" value="${esc(c.subject || "")}" placeholder="e.g. {{first_name}}, new burlap rolls just landed"></label>
    <label class="f"><span>Preview text (shown after subject in inbox)</span><input type="text" id="cmPre" value="${esc(c.preheader || "")}"></label>
    <label class="f"><span>Start from template</span><select id="cmTpl">${optList(S.lk.templates.map((t) => [t.id, t.name]), "", "— choose —")}</select></label>
    <div class="full">${richEditor("body", c.body_html || "", { height: 320 })}</div>
    <div class="full hint">Links are click-tracked. An unsubscribe link and your business address are added automatically to the footer.</div></div></div></div>
  <div class="grid" style="align-content:start"><div class="card"><div class="card-h"><h3>Audience</h3><span id="segCount" style="margin-left:auto"></span></div><div class="card-b" style="display:flex;flex-direction:column;gap:12px">
    ${seg.contact_ids ? `<div class="info-box">Limited to the ${seg.contact_ids.length} contacts you selected.</div>` : ""}
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Contact type</div>${chips("types", O.contactType, seg.types)}</div>
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Rating</div>${chips("ratings", O.rating, seg.ratings)}</div>
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Interested in</div>${chips("products", O.products, seg.products)}</div>
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Company industry</div>${chips("industries", O.industry, seg.industries)}</div>
    ${S.lk.tags.length ? `<div><div class="small muted" style="margin-bottom:5px;font-weight:600">Tags (any)</div>${chips("tags", S.lk.tags, seg.tags)}</div>` : ""}
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Lead source</div>${chips("sources", [...new Set([...O.source, ...S.lk.sources])], seg.sources)}</div>
    ${S.lk.countries.length ? `<div><div class="small muted" style="margin-bottom:5px;font-weight:600">Country</div>${chips("countries", S.lk.countries, seg.countries)}</div>` : ""}
    <div><div class="small muted" style="margin-bottom:5px;font-weight:600">Owner</div>${chips("owners", users, seg.owners)}</div>
    <label class="f"><span>Not contacted in the last</span><select id="segNC">${optList([[7, "7 days"], [14, "14 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]], seg.not_contacted_days, "— any time —")}</select></label>
    <div class="small muted">Leave a group empty to include everyone. Unsubscribed, “Do not contact” and email-less contacts are always excluded.</div>
    <div id="segSample" class="small" style="border-top:1px solid var(--border);padding-top:10px"></div></div></div>
    ${can(2) ? `<button class="btn danger sm" id="cmDel" style="justify-self:start">${icon("trash")} Delete draft</button>` : ""}</div></div>`;
}
async function campaignStats(c) {
  const r = await GET(`/api/campaigns/${c.id}/recipients`);
  after(() => {
    $("#cmDup") && ($("#cmDup").onclick = safe(async () => { const n = await POST(`/api/campaigns/${c.id}/duplicate`); go(`campaigns/${n.id}`); }));
    $("#cmResume") && ($("#cmResume").onclick = safe(async () => { let x; do { x = await POST(`/api/campaigns/${c.id}/send`); } while (x.remaining > 0 && (x.sent || x.failed)); rerender(); }));
    $("#cmFollow") && ($("#cmFollow").onclick = safe(async () => {
      const ids = r.rows.filter((x) => x.contact_id && !x.opened_at && x.status !== "Failed").map((x) => x.contact_id);
      if (!ids.length) return toast("Everyone opened it!");
      const n = await POST("/api/campaigns", { name: `${c.name} — follow-up to non-openers`, subject: c.subject, preheader: c.preheader, body_html: c.body_html, segment: { contact_ids: ids } }); go(`campaigns/${n.id}`);
    }));
    bindTable($("#page"), r.rows, { click: (x) => x.contact_id && go(`contacts/${x.contact_id}`) });
  });
  const sent = c.sent || 0;
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/campaigns">Campaigns</a> / ${esc(c.name)}</div>
  ${pageHead(c.name, `${badge(c.status)} Sent ${fmtDT(c.sent_at)} · Subject: <b>${esc(c.subject)}</b>`, `${c.status === "Sending" && can(2) ? `<button class="btn primary" id="cmResume">Resume sending</button>` : ""}${can(1) ? `<button class="btn" id="cmFollow">${icon("send")} Follow up non-openers</button><button class="btn" id="cmDup">${icon("copy")} Duplicate</button>` : ""}`)}
  <div class="kpis"><div class="kpi"><div class="l">Recipients</div><div class="v">${num(c.recipients)}</div></div><div class="kpi"><div class="l">Delivered to provider</div><div class="v">${num(sent)}</div><div class="d">${c.failed ? `<span class="down">${c.failed} failed</span>` : "no failures"}</div></div>
    <div class="kpi"><div class="l">Open rate</div><div class="v">${sent ? pct(c.opened / sent) : "—"}</div><div class="d">${num(c.opened)} opened</div></div><div class="kpi"><div class="l">Click rate</div><div class="v">${sent ? pct(c.clicked / sent) : "—"}</div><div class="d">${num(c.clicked)} clicked</div></div></div>
  <div class="card">${table([{ l: "Contact", f: (x) => `<b>${esc(x.contact_name || "")}</b><div class="small muted">${esc(x.company_name || "")}</div>` }, { l: "Email", k: "email" }, { l: "Status", f: (x) => badge(x.status) + (x.error ? `<div class="small down">${esc(x.error)}</div>` : "") }, { l: "Opened", f: (x) => (x.opened_at ? `${fmtDT(x.opened_at)} <span class="small muted">×${x.open_count}</span>` : "") }, { l: "Clicked", f: (x) => (x.clicked_at ? `${fmtDT(x.clicked_at)} <span class="small muted">×${x.click_count}</span>` : "") }], r.rows, { click: 1 })}</div>
  <div class="small muted" style="margin-top:8px">Open tracking relies on images loading, so real open rates are usually higher than shown.</div>`;
}

// ---------------------------------------------------------------- templates
ROUTES.templates = async () => {
  const data = await GET("/api/templates?limit=500");
  const edit = async (t) => {
    const r = await modal({ title: t ? "Edit template" : "New template", size: "wide",
      body: `<div class="form-grid"><label class="f"><span>Name</span><input type="text" name="name" value="${esc(t?.name || "")}" required></label><label class="f"><span>Category</span><input type="text" name="category" value="${esc(t?.category || "")}" list="tplcats"></label>
        <label class="f full"><span>Subject</span><input type="text" name="subject" value="${esc(t?.subject || "")}"></label><div class="full">${richEditor("body", t?.body_html || "<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>")}</div></div>
        <datalist id="tplcats"><option value="Outreach"><option value="Sales"><option value="Customer care"><option value="Newsletter"><option value="Support"></datalist>`,
      onOpen: (f) => bindEditor(f),
      onSubmit: (f) => { const b = { name: f.name.value, category: f.category.value, subject: f.subject.value, body_html: editorValue(f, "body") }; if (!b.name) throw new Error("Name required"); return t ? PATCH(`/api/templates/${t.id}`, b) : POST("/api/templates", b); } });
    if (r) { toast("Template saved"); loadLookups(); rerender(); }
  };
  after(() => {
    $("#tpNew") && ($("#tpNew").onclick = () => edit());
    bindTable($("#page"), data.rows, { click: (t) => can(1) && edit(t) });
    $$("[data-delt]").forEach((b) => (b.onclick = safe(async () => { if (await confirmBox("Delete this template?")) { await DEL(`/api/templates/${b.dataset.delt}`); loadLookups(); rerender(); } })));
  });
  return `${pageHead("Email templates", "Reusable emails for outreach, follow-ups and customer care. Use {{first_name}}, {{company}}, {{signature}} and more.", can(1) ? `<button class="btn primary" id="tpNew">${icon("plus")} New template</button>` : "")}
  <div class="card">${table([{ l: "Template", f: (t) => `<b>${esc(t.name)}</b>` }, { l: "Category", f: (t) => (t.category ? `<span class="tag">${esc(t.category)}</span>` : "") }, { l: "Subject", f: (t) => `<span class="small">${esc(t.subject || "")}</span>` }, { l: "Updated", f: (t) => fmtDate(t.updated_at) }, { l: "", f: (t) => (can(1) ? `<button class="icon-btn" data-delt="${t.id}">${icon("trash")}</button>` : "") }], data.rows, { click: 1, empty: "No templates" })}</div>`;
};

// ---------------------------------------------------------------- email inbox
const EM = { direction: "", q: "", offset: 0 };
ROUTES.emails = async () => {
  const data = await GET("/api/emails" + qs({ ...EM, limit: 50 }));
  after(() => {
    $$("[data-dir]").forEach((b) => (b.onclick = () => { EM.direction = b.dataset.dir; EM.offset = 0; rerender(); }));
    $("#emq").oninput = debounce((e) => { EM.q = e.target.value; EM.offset = 0; rerender(); }, 300);
    $$("[data-pg]").forEach((b) => (b.onclick = () => { EM.offset += +b.dataset.pg * 50; rerender(); }));
    bindTable($("#page"), data.rows, { click: (e) => viewEmail(e.id) });
    $("#emNew") && ($("#emNew").onclick = () => composeEmail({}));
  });
  return `${pageHead("Email inbox", "Every email sent from the CRM and every reply received (when inbound email is connected)", can(1) ? `<button class="btn primary" id="emNew">${icon("mail")} Compose</button>` : "")}
  <div class="toolbar"><div class="seg"><button data-dir="" class="${!EM.direction ? "on" : ""}">All</button><button data-dir="in" class="${EM.direction === "in" ? "on" : ""}">Received</button><button data-dir="out" class="${EM.direction === "out" ? "on" : ""}">Sent</button></div><input type="search" id="emq" placeholder="Search subject, address, contact…" value="${esc(EM.q)}"></div>
  <div class="card">${table([{ l: "", f: (e) => (e.direction === "in" ? '<span class="badge b-blue">In</span>' : '<span class="badge">Out</span>') }, { l: "Contact", f: (e) => (e.contact_id ? `<a href="#/contacts/${e.contact_id}">${esc(e.contact_name)}</a>` : `<span class="muted">${esc(e.direction === "in" ? e.from_addr : e.to_addr)}</span>`) },
    { l: "Subject", f: (e) => `<b>${esc(e.subject || "(no subject)")}</b>` }, { l: "Status", f: (e) => badge(e.status) + (e.opened_at ? ' <span class="badge b-green">Opened</span>' : "") }, { l: "By", k: "user_name" }, { l: "Date", f: (e) => `<span class="nowrap small">${fmtDT(e.created_at)}</span>` }],
    data.rows, { click: 1, empty: "No emails yet" })}${pager(data.total, EM.offset, 50)}</div>`;
};

// ---------------------------------------------------------------- tickets
const TKT = { status: "", open: "1", priority: "", category: "", mine: "", q: "", offset: 0 };
ROUTES.tickets = async (id) => {
  if (id) return ticketPage(+id);
  const data = await GET("/api/tickets" + qs({ ...TKT, limit: 50, sort: "id", dir: "DESC" }));
  const now = new Date().toISOString();
  after(() => {
    $$("[data-flt]").forEach((s) => (s.onchange = () => { TKT[s.dataset.flt] = s.value; TKT.offset = 0; rerender(); }));
    $("#tkq").oninput = debounce((e) => { TKT.q = e.target.value; TKT.offset = 0; rerender(); }, 300);
    $$("[data-pg]").forEach((b) => (b.onclick = () => { TKT.offset += +b.dataset.pg * 50; rerender(); }));
    bindTable($("#page"), data.rows, { click: (t) => go(`tickets/${t.id}`) });
    $("#tNew") && ($("#tNew").onclick = () => editRecord("ticket").then((r) => r && go(`tickets/${r.id}`)));
  });
  return `${pageHead("Support tickets", "Order issues, shipping, quality, invoices and product questions", can(1) ? `<button class="btn primary" id="tNew">${icon("plus")} New ticket</button>` : "")}
  <div class="toolbar"><input type="search" id="tkq" placeholder="Search # or subject…" value="${esc(TKT.q)}"><select data-flt="open"><option value="1" ${TKT.open === "1" ? "selected" : ""}>Open tickets</option><option value="" ${TKT.open === "" ? "selected" : ""}>All tickets</option></select>
    <select data-flt="status">${optList(O.tkstatus, TKT.status, "Any status")}</select><select data-flt="priority">${optList(O.priority, TKT.priority, "Any priority")}</select><select data-flt="category">${optList(O.tkcat, TKT.category, "Any category")}</select>
    <select data-flt="mine"><option value="">Anyone</option><option value="1" ${TKT.mine === "1" ? "selected" : ""}>Assigned to me</option></select></div>
  <div class="card">${table([{ l: "#", f: (t) => `<span class="mono">#${t.id}</span>` }, { l: "Subject", f: (t) => `<b>${esc(t.subject)}</b><div class="small muted">${esc(t.category || "")} · ${esc(t.channel || "")}</div>` },
    { l: "Customer", f: (t) => esc(t.contact_name || t.company_name || "") }, { l: "Status", f: (t) => badge(t.status) }, { l: "Priority", f: (t) => badge(t.priority) },
    { l: "SLA", f: (t) => (["Resolved", "Closed"].includes(t.status) ? `<span class="small up">✓ ${fmtDate(t.resolved_at)}</span>` : t.due_at ? `<span class="small ${t.due_at < now ? "down" : "muted"}">${t.due_at < now ? "Overdue " : "Due "}${ago(t.due_at)}</span>` : "") },
    { l: "Assigned", f: (t) => esc(t.assignee_name || "—") }, { l: "Updated", f: (t) => `<span class="small muted">${ago(t.updated_at)}</span>` }],
    data.rows, { click: 1, empty: TKT.open ? "No open tickets — customers are happy 🎉" : "No tickets yet" })}${pager(data.total, TKT.offset, 50)}</div>`;
};
async function ticketPage(id) {
  const [t, cm] = await Promise.all([GET(`/api/tickets/${id}`), GET(`/api/tickets/${id}/comments`)]);
  const now = new Date().toISOString(), w = can(1);
  after(() => {
    $$("[data-set]").forEach((s) => (s.onchange = safe(async () => { await PATCH(`/api/tickets/${id}`, { [s.dataset.set]: s.value }); toast("Updated"); rerender(); updateCounts(); })));
    $("#rplForm") && ($("#rplForm").onsubmit = safe(async (e) => {
      e.preventDefault(); const f = e.target; if (!f.body.value.trim()) return;
      $("button[type=submit]", f).disabled = true;
      try { await POST(`/api/tickets/${id}/comments`, { body: f.body.value, internal: f.mode.value === "internal", email_customer: f.mode.value === "email", status: f.status.value || undefined }); toast(f.mode.value === "email" ? "Reply emailed to customer" : "Note added"); rerender(); updateCounts(); }
      finally { $("button[type=submit]", f).disabled = false; }
    }));
    $("#tEdit") && ($("#tEdit").onclick = () => editRecord("ticket", t).then((r) => r && rerender()));
    $("#tDel") && ($("#tDel").onclick = () => deleteRecord("ticket", t, `#${t.id}`).then((r) => r && go("tickets")));
    $("#tTask") && ($("#tTask").onclick = () => editRecord("task", null, { title: `Ticket #${id}: `, contact_id: t.contact_id, company_id: t.company_id }).then((r) => r && toast("Task created")));
    $$("[data-csat]").forEach((b) => (b.onclick = safe(async () => { await PATCH(`/api/tickets/${id}`, { satisfaction: +b.dataset.csat }); rerender(); })));
  });
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/tickets">Tickets</a> / #${id}</div>
  ${pageHead(`#${id} · ${t.subject}`, `${badge(t.status)} ${badge(t.priority)} ${esc(t.category || "")} · opened ${fmtDT(t.created_at)} via ${esc(t.channel || "")}`, w ? `<button class="btn" id="tTask">${icon("tasks")} Task</button><button class="btn" id="tEdit">${icon("edit")} Edit</button>${can(2) ? `<button class="btn danger" id="tDel">${icon("trash")}</button>` : ""}` : "")}
  <div class="grid g-main"><div class="card"><div class="card-h"><h3>Conversation</h3><span class="small muted">${cm.rows.length} messages</span></div>
    <div class="thread">${cm.rows.map((c) => { const cust = !c.user_id; return `<div class="msg ${cust ? "cust" : c.internal ? "internal" : ""}">${avatar(c.user_name || c.author || "?", "sm")}<div class="bubble"><div class="meta"><b>${esc(c.user_name || c.author || "Customer")}</b><span>${fmtDT(c.created_at)}</span>${c.internal ? '<span class="badge b-amber">Internal note</span>' : ""}${c.emailed ? '<span class="badge b-green">Emailed to customer</span>' : ""}${cust ? '<span class="badge b-blue">Customer</span>' : ""}</div><div class="text">${esc(c.body)}</div></div></div>`; }).join("") || `<div class="empty">No messages yet</div>`}</div>
    ${w ? `<form id="rplForm" style="border-top:1px solid var(--border);padding:14px 16px;display:flex;flex-direction:column;gap:10px"><textarea name="body" placeholder="Write a reply or internal note…" style="min-height:110px"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select name="mode" style="width:auto">${t.contact_email && S.settings.email_ready ? `<option value="email">Email reply to ${esc(t.contact_email)}</option>` : ""}<option value="public">Log reply (not emailed)</option><option value="internal">Internal note</option></select>
      <select name="status" style="width:auto">${optList(O.tkstatus, "", "Keep status")}</select><button class="btn primary" type="submit" style="margin-left:auto">${icon("send")} Send</button></div></form>` : ""}</div>
  <div class="grid" style="align-content:start"><div class="card"><div class="card-h"><h3>Ticket</h3></div><div class="card-b"><div class="form-grid" style="grid-template-columns:1fr">
    <label class="f"><span>Status</span><select data-set="status" ${w ? "" : "disabled"}>${optList(O.tkstatus, t.status, null)}</select></label>
    <label class="f"><span>Priority</span><select data-set="priority" ${w ? "" : "disabled"}>${optList(O.priority, t.priority, null)}</select></label>
    <label class="f"><span>Assigned to</span><select data-set="assigned_to" ${w ? "" : "disabled"}>${optList(S.lk.users.map((u) => [u.id, u.name]), t.assigned_to, "Unassigned")}</select></label>
    <label class="f"><span>Category</span><select data-set="category" ${w ? "" : "disabled"}>${optList(O.tkcat, t.category, null)}</select></label></div>
    <dl class="props" style="margin-top:14px"><dt>SLA due</dt><dd class="${!t.resolved_at && t.due_at < now ? "down" : ""}">${fmtDT(t.due_at)}${!t.resolved_at && t.due_at < now ? " (overdue)" : ""}</dd>${t.resolved_at ? `<dt>Resolved</dt><dd>${fmtDT(t.resolved_at)}</dd>` : ""}</dl></div></div>
    <div class="card"><div class="card-h"><h3>Customer</h3></div><div class="card-b">${t.contact_id ? `<div class="name-cell">${avatar(t.contact_name)}<div><a href="#/contacts/${t.contact_id}"><b>${esc(t.contact_name)}</b></a><div class="small muted">${esc(t.contact_email || "")}</div></div></div>` : '<span class="muted">No contact linked</span>'}${t.company_id ? `<div style="margin-top:10px"><a href="#/companies/${t.company_id}">${esc(t.company_name)}</a></div>` : ""}</div></div>
    <div class="card"><div class="card-h"><h3>Customer satisfaction</h3></div><div class="card-b"><div style="display:flex;gap:6px">${[1, 2, 3, 4, 5].map((n) => `<button class="btn sm ${t.satisfaction === n ? "primary" : ""}" data-csat="${n}" ${w ? "" : "disabled"}>${"★".repeat(n)}</button>`).join("")}</div><div class="hint">Record how satisfied the customer was once resolved.</div></div></div>
  </div></div>`;
}

// ---------------------------------------------------------------- analytics
const AN = { days: 90 };
ROUTES.analytics = async () => {
  const a = await GET("/api/analytics" + qs(AN)), s = a.summary, tk = a.tickets;
  after(() => { $$("[data-days]").forEach((b) => (b.onclick = () => { AN.days = +b.dataset.days; rerender(); })); });
  return `${pageHead("Analytics", `Sales, marketing and service performance — last ${a.days} days`, `<div class="seg">${[[30, "30d"], [90, "90d"], [180, "6mo"], [365, "1yr"], [3650, "All"]].map(([d, l]) => `<button data-days="${d}" class="${AN.days === d ? "on" : ""}">${l}</button>`).join("")}</div>`)}
  <div class="kpis">
    <div class="kpi"><div class="l">Revenue won</div><div class="v">${money(s.won_value, 1)}</div><div class="d">${s.won_count} deals</div></div>
    <div class="kpi"><div class="l">Win rate</div><div class="v">${pct(s.win_rate)}</div><div class="d">${s.won_count} won / ${s.lost_count} lost</div></div>
    <div class="kpi"><div class="l">Avg deal size</div><div class="v">${money(s.avg_deal, 1)}</div></div>
    <div class="kpi"><div class="l">Avg sales cycle</div><div class="v">${num(s.avg_cycle_days)} <span class="small muted">days</span></div></div>
    <div class="kpi"><div class="l">New contacts</div><div class="v">${num(s.new_contacts)}</div><div class="d">${pct(s.lead_conversion)} became customers</div></div>
    <div class="kpi"><div class="l">Activities logged</div><div class="v">${num(s.interactions)}</div><div class="d">${num(s.emails_sent)} emails sent · ${num(s.emails_received)} received</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Sales funnel</h3><span class="small muted">deals created in period, furthest stage reached</span></div><div class="card-b">${a.funnel[0]?.count ? funnel(a.funnel) : `<div class="empty">No deals in this period</div>`}</div></div>
    <div class="card"><div class="card-h"><h3>Activity & lead trend</h3></div><div class="card-b">${lineChart(a.trend.map((t) => t.label), [{ name: "Activities", data: a.trend.map((t) => t.interactions) }, { name: "New leads", data: a.trend.map((t) => t.leads) }], { fmt: (v) => num(v, 1) })}</div></div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Lead sources</h3></div><div class="card-b">${hbars(a.sources.map((x) => ({ label: `${x.label}${x.customers ? ` (${x.customers} cust.)` : ""}`, value: x.value })))}</div></div>
    <div class="card"><div class="card-h"><h3>Activity mix</h3></div><div class="card-b">${donut(a.interaction_types)}</div></div>
    <div class="card"><div class="card-h"><h3>Why deals are lost</h3></div><div class="card-b">${hbars(a.lost_reasons, { color: "var(--c5)" })}</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Team leaderboard</h3></div>${table([{ l: "Person", f: (r) => `<div class="name-cell">${avatar(r.name, "sm")}${esc(r.name)}</div>` }, { l: "Won", num: 1, f: (r) => money(r.won_value, 1) }, { l: "Deals", num: 1, k: "won" }, { l: "Activities", num: 1, k: "interactions" }, { l: "Tasks done", num: 1, k: "tasks_done" }, { l: "Contacts added", num: 1, k: "contacts_added" }], a.leaderboard)}</div>
    <div class="card"><div class="card-h"><h3>Top customers (all time)</h3></div>${table([{ l: "Company", f: (r) => `<a href="#/companies/${r.id}">${esc(r.name)}</a>` }, { l: "Deals won", num: 1, k: "deals" }, { l: "Revenue", num: 1, f: (r) => money(r.value) }], a.top_customers, { empty: "No won deals yet" })}</div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Best-selling products</h3></div><div class="card-b">${hbars(a.products.map((p) => ({ label: p.label, value: p.value })), { fmt: (v) => money(v, 1) })}</div></div>
    <div class="card"><div class="card-h"><h3>Contacts by type</h3></div><div class="card-b">${donut(a.contact_types)}</div></div>
    <div class="card"><div class="card-h"><h3>Companies by industry</h3></div><div class="card-b">${hbars(a.industries)}</div></div>
  </div>
  <h2 style="margin:24px 0 12px">Customer service</h2>
  <div class="kpis"><div class="kpi"><div class="l">Tickets opened</div><div class="v">${num(tk.total)}</div><div class="d">${tk.open} still open</div></div><div class="kpi"><div class="l">Avg resolution time</div><div class="v">${tk.avg_resolution_hours >= 48 ? num(tk.avg_resolution_hours / 24, 1) + " days" : num(tk.avg_resolution_hours, 1) + " h"}</div></div>
    <div class="kpi"><div class="l">Resolved within SLA</div><div class="v">${pct(tk.sla_met)}</div></div><div class="kpi"><div class="l">Satisfaction</div><div class="v">${tk.csat ? num(tk.csat, 1) + " / 5" : "—"}</div></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="card-h"><h3>Tickets by category</h3></div><div class="card-b">${hbars(tk.by_category)}</div></div><div class="card"><div class="card-h"><h3>Tickets by status</h3></div><div class="card-b">${donut(tk.by_status)}</div></div></div>
  <h2 style="margin:24px 0 12px">Marketing</h2>
  <div class="card">${table([{ l: "Campaign", f: (c) => `<a href="#/campaigns/${c.id}">${esc(c.name)}</a>` }, { l: "Sent", f: (c) => fmtDate(c.sent_at) }, { l: "Recipients", num: 1, k: "sent" }, { l: "Open rate", num: 1, f: (c) => (c.sent ? pct(c.opened / c.sent) : "—") }, { l: "Click rate", num: 1, f: (c) => (c.sent ? pct(c.clicked / c.sent) : "—") }], a.campaigns, { empty: "No campaigns sent yet" })}</div>`;
};

// ---------------------------------------------------------------- team (admin)
ROUTES.team = async () => {
  if (!can(3)) return `<div class="err-box">Only administrators can manage users.</div>`;
  const data = await GET("/api/users");
  const genPw = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; return [...crypto.getRandomValues(new Uint8Array(14))].map((b) => c[b % c.length]).join(""); };
  const roleOpts = Object.entries(O.roles).map(([r, d]) => [r, `${r[0].toUpperCase() + r.slice(1)} — ${d}`]);
  const userForm = (u = {}) => `<div class="form-grid"><label class="f"><span>Full name <i>*</i></span><input type="text" name="name" value="${esc(u.name || "")}" required></label><label class="f"><span>Email (login) <i>*</i></span><input type="email" name="email" value="${esc(u.email || "")}" required></label>
    <label class="f full"><span>Role</span><select name="role">${optList(roleOpts, u.role || "sales", null)}</select></label><label class="f"><span>Job title</span><input type="text" name="title" value="${esc(u.title || "")}"></label><label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(u.phone || "")}"></label></div>`;
  const showPw = (email, pw) => modal({ title: "Share these sign-in details", size: "narrow", submit: null, cancel: "Done", body: `<p style="margin-top:0">Send these to the user privately. They'll be asked to choose their own password at first sign-in.</p><div class="info-box"><div>Address: <b>${esc(location.origin)}</b></div><div>Email: <b>${esc(email)}</b></div><div>Temporary password: <b class="mono" style="font-size:14px">${esc(pw)}</b></div></div><button type="button" class="btn sm" style="margin-top:10px" data-copy>${icon("copy")} Copy</button>`,
    onOpen: (f) => ($("[data-copy]", f).onclick = () => navigator.clipboard.writeText(`Sign in at ${location.origin}\nEmail: ${email}\nTemporary password: ${pw}`).then(() => toast("Copied"))) });
  after(() => {
    $("#uNew").onclick = safe(async () => {
      const pw = genPw();
      const r = await modal({ title: "Add a user", body: userForm() + `<div class="form-grid" style="margin-top:12px"><label class="f full"><span>Temporary password (min 10 characters)</span><input type="text" name="password" value="${pw}" class="mono" required></label><label class="switch full small"><input type="checkbox" name="must" checked> Require them to change it at first sign-in</label></div>`,
        submit: "Create user", onSubmit: async (f) => { await POST("/api/users", { name: f.name.value, email: f.email.value, role: f.role.value, title: f.title.value, phone: f.phone.value, password: f.password.value, must_change_password: f.must.checked }); return { email: f.email.value, pw: f.password.value }; } });
      if (r) { loadLookups(); await showPw(r.email, r.pw); rerender(); }
    });
    $$("[data-u]").forEach((b) => (b.onclick = (e) => {
      const u = data.rows.find((x) => x.id === +b.dataset.u);
      popMenu(e.currentTarget, [
        { label: "Edit details & role", icon: "edit", run: async () => { if (await modal({ title: `Edit ${u.name}`, body: userForm(u), onSubmit: (f) => PATCH(`/api/users/${u.id}`, { name: f.name.value, email: f.email.value, role: f.role.value, title: f.title.value, phone: f.phone.value }) })) { toast("Saved"); loadLookups(); rerender(); } } },
        { label: "Reset password", icon: "shield", run: async () => { const pw = genPw(); const r = await modal({ title: `Reset password for ${u.name}`, size: "narrow", submit: "Reset", body: `<label class="f"><span>New temporary password</span><input type="text" name="password" value="${pw}" class="mono"></label><div class="hint">They'll be signed out everywhere and asked to choose a new password.</div>`, onSubmit: async (f) => { await POST(`/api/users/${u.id}/password`, { password: f.password.value }); return f.password.value; } }); if (r) showPw(u.email, r); } },
        u.active ? { label: "Deactivate (block sign-in)", icon: "x", run: safe(async () => { if (await confirmBox(`Deactivate ${esc(u.name)}? They'll be signed out and can't sign in. Their records stay.`, { ok: "Deactivate" })) { await PATCH(`/api/users/${u.id}`, { active: false }); loadLookups(); rerender(); } }) }
          : { label: "Reactivate", icon: "check", run: safe(async () => { await PATCH(`/api/users/${u.id}`, { active: true }); loadLookups(); rerender(); }) },
      ]);
    }));
  });
  return `${pageHead("Team & logins", "Create a profile and password for each person who uses the CRM. You control what each role can do.", `<button class="btn primary" id="uNew">${icon("plus")} Add user</button>`)}
  <div class="card" style="margin-bottom:16px">${table([{ l: "Name", f: (u) => `<div class="name-cell">${avatar(u.name)}<div><b>${esc(u.name)}</b><span class="small muted">${esc(u.title || "")}</span></div></div>` }, { l: "Email (login)", k: "email" }, { l: "Role", f: (u) => badge(u.role) }, { l: "Status", f: (u) => (u.active ? (u.must_change_password ? '<span class="badge b-amber">Invited</span>' : badge("Active")) : '<span class="badge b-red">Deactivated</span>') }, { l: "Last sign-in", f: (u) => (u.last_login ? ago(u.last_login) : '<span class="faint">never</span>') }, { l: "", f: (u) => (u.id === S.me.id ? '<span class="small muted">you</span>' : `<button class="icon-btn" data-u="${u.id}">${icon("more")}</button>`) }], data.rows)}</div>
  <div class="card"><div class="card-h"><h3>What each role can do</h3></div><div class="card-b"><dl class="props">${Object.entries(O.roles).map(([r, d]) => `<dt>${badge(r)}</dt><dd>${esc(d)}</dd>`).join("")}</dl></div></div>`;
};

// ---------------------------------------------------------------- settings (admin)
ROUTES.settings = async () => {
  if (!can(3)) return `<div class="err-box">Only administrators can change settings.</div>`;
  await loadSettings(); const s = S.settings;
  after(() => {
    bindEditor($("#page"));
    $("#setForm").onsubmit = safe(async (e) => {
      e.preventDefault(); const f = e.target, b = {};
      for (const el of $$("[name]", f)) b[el.name] = el.value;
      b.email_signature = editorValue(f, "sig");
      await PUT("/api/settings", b); await loadSettings(); toast("Settings saved"); rerender();
    });
    $("#clearKey") && ($("#clearKey").onclick = safe(async () => { if (await confirmBox("Remove the saved Resend API key?", { ok: "Remove" })) { await PUT("/api/settings", { clear_resend_key: true }); await loadSettings(); rerender(); } }));
    $("#testMail").onclick = safe(async () => { await POST("/api/emails/send", { to: S.me.email, subject: "Test email from your CRM", body_html: "<p>Hi {{my_name}},</p><p>Email sending from the CRM is working.</p><p>{{signature}}</p>" }); toast("Test email sent to " + S.me.email); });
  });
  const inp = (k, l, t = "text", ph = "", hint = "") => `<label class="f"><span>${l}</span><input type="${t}" name="${k}" value="${esc(s[k] ?? "")}" placeholder="${esc(ph)}">${hint ? `<div class="hint">${hint}</div>` : ""}</label>`;
  return `${pageHead("Settings", "Business details, sales targets and email delivery")}
  <form id="setForm" class="grid" style="max-width:980px">
    <div class="card"><div class="card-h"><h3>Business</h3></div><div class="card-b"><div class="form-grid">${inp("company_name", "Business name")}${inp("company_tagline", "Tagline")}${inp("company_phone", "Phone")}${inp("company_website", "Website")}
      <label class="f full"><span>Business mailing address</span><input type="text" name="company_address" value="${esc(s.company_address)}"><div class="hint">Shown in the footer of marketing emails — required by anti-spam laws (CAN-SPAM).</div></label></div></div></div>
    <div class="card"><div class="card-h"><h3>Sales</h3></div><div class="card-b"><div class="form-grid">${inp("monthly_target", "Monthly revenue target", "number", "", "Used on the dashboard and forecast.")}
      <label class="f"><span>Currency</span><select name="currency">${optList(["USD", "INR", "CAD", "GBP", "EUR", "AUD", "AED"], s.currency, null)}</select></label></div></div></div>
    <div class="card"><div class="card-h"><h3>Email sending</h3>${s.email_ready ? '<span class="badge b-green" style="margin-left:auto">Connected</span>' : '<span class="badge b-amber" style="margin-left:auto">Not set up</span>'}</div><div class="card-b">
      <div class="info-box" style="margin-bottom:14px"><b>How to connect your business email (one-time, ~10 minutes):</b><ol class="steps"><li>Create a free account at <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> (3,000 emails/month free).</li><li>In Resend → Domains, add your business domain (e.g. indiancraftsupply.com) and add the DNS records it shows. If your domain is on Cloudflare this takes a couple of clicks.</li><li>In Resend → API Keys, create a key with “Sending access” and paste it below.</li><li>Set the “From” address below to an address on that domain, e.g. sales@yourdomain.com, then click <b>Send test email</b>.</li></ol></div>
      <div class="form-grid">${inp("email_from_name", "From name", "text", "Indian Craft Supply")}${inp("email_from_address", "From address", "email", "sales@yourdomain.com")}
      ${inp("email_reply_to", "Reply-to address", "email", "", "Where replies go. Leave blank to use each sender's own login email. To log replies in the CRM automatically, use the inbound address below.")}
      <label class="f"><span>Resend API key</span><input type="password" name="resend_api_key" placeholder="${s.resend_key_source ? "•••••• (" + esc(s.resend_key_source) + ") — leave blank to keep" : "re_…"}" autocomplete="off"><div class="hint">Stored securely on Cloudflare and never shown again.${s.resend_key_source === "saved in settings" ? ` <a href="javascript:void 0" id="clearKey">Remove key</a>` : ""}</div></label>
      <div class="full"><span class="small muted" style="font-weight:600;display:block;margin-bottom:4px">Default email signature — used for {{signature}}</span>${richEditor("sig", s.email_signature || `<p>{{my_name}}<br>{{my_title}}<br>${esc(s.company_name)}<br>{{my_phone}}</p>`, { height: 100 })}</div></div>
      <div style="margin-top:12px"><button type="button" class="btn" id="testMail" ${s.email_ready ? "" : "disabled"}>${icon("send")} Send test email to me</button></div></div></div>
    <div class="card"><div class="card-h"><h3>Receiving email (optional)</h3></div><div class="card-b">
      <p class="muted" style="margin-top:0">Log customer replies automatically: with Cloudflare Email Routing, emails sent to an address on your domain are delivered to this CRM, matched to the contact (or create a new lead), and added to their timeline. Replies containing “[Ticket #123]” are added to that ticket.</p>
      <ol class="steps small"><li>Cloudflare dashboard → your domain → Email → Email Routing → enable it.</li><li>Routing rules → Create address (e.g. <b>crm@yourdomain.com</b>) → Action: <b>Send to a Worker</b> → choose <b>ics-crm</b>.</li><li>Put that address in “Reply-to” above, so customer replies flow into the CRM.</li></ol>
      <div class="form-grid">${inp("inbound_address", "CRM inbound address", "email", "crm@yourdomain.com")}${inp("support_address", "Support address (creates tickets)", "email", "support@yourdomain.com", "New emails to this address open a support ticket automatically.")}</div></div></div>
    <div><button class="btn primary" type="submit">Save settings</button></div>
  </form>`;
};

// ---------------------------------------------------------------- audit / profile
ROUTES.audit = async () => {
  if (!can(3)) return `<div class="err-box">Admins only.</div>`;
  const data = await GET("/api/audit?limit=500");
  return `${pageHead("Audit log", "Sign-ins and every change made in the CRM (latest 500)")}<div class="card">${table([{ l: "When", f: (a) => `<span class="nowrap small">${fmtDT(a.at)}</span>` }, { l: "User", f: (a) => esc(a.user_name || "system") }, { l: "Action", f: (a) => badge(a.action) }, { l: "Record", f: (a) => `${esc(a.entity || "")}${a.entity_id ? " #" + a.entity_id : ""}` }, { l: "Details", f: (a) => `<span class="small muted">${esc((a.details || "").slice(0, 160))}</span>` }], data.rows)}</div>`;
};
ROUTES.profile = async () => {
  after(() => {
    $("#pf").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target; S.me = await PATCH("/api/me", { name: f.name.value, title: f.title.value, phone: f.phone.value }); toast("Profile saved"); loadLookups(); });
    $("#pw").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target; if (f.password.value !== f.password2.value) throw new Error("Passwords don't match"); await POST("/api/me/password", { current: f.current.value, password: f.password.value }); f.reset(); toast("Password changed. Other sessions were signed out."); });
  });
  return `${pageHead("My profile", `${esc(S.me.email)} · ${badge(S.me.role)}`)}<div class="grid g2" style="max-width:900px">
    <form class="card" id="pf"><div class="card-h"><h3>Details</h3></div><div class="card-b form-grid" style="grid-template-columns:1fr"><label class="f"><span>Name</span><input type="text" name="name" value="${esc(S.me.name)}"></label><label class="f"><span>Job title (used in {{my_title}})</span><input type="text" name="title" value="${esc(S.me.title || "")}"></label><label class="f"><span>Phone (used in {{my_phone}})</span><input type="tel" name="phone" value="${esc(S.me.phone || "")}"></label><div><button class="btn primary">Save</button></div></div></form>
    <form class="card" id="pw"><div class="card-h"><h3>Change password</h3></div><div class="card-b form-grid" style="grid-template-columns:1fr"><label class="f"><span>Current password</span><input type="password" name="current" required autocomplete="current-password"></label><label class="f"><span>New password (min 10)</span><input type="password" name="password" required autocomplete="new-password"></label><label class="f"><span>Confirm</span><input type="password" name="password2" required autocomplete="new-password"></label><div><button class="btn primary">Change password</button></div></div></form></div>`;
};

boot();
