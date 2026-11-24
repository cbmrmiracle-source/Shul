/* Email (inbox, tracking), marketing (campaigns, templates), service (tickets), analytics, admin */
"use strict";

// ---------------------------------------------------------------- campaigns
ROUTES.campaigns = async (id) => {
  if (id) return campaignPage(+id);
  const data = await GET("/api/campaigns?limit=200");
  after(() => {
    bindTable($("#page"), data.rows, { click: (r) => go(`campaigns/${r.id}`) });
    $("#cmNew") && ($("#cmNew").onclick = safe(async () => {
      const r = await modal({ title: "New email campaign", size: "narrow", submit: "Create", body: `<label class="f"><span>Campaign name</span><input type="text" name="name" required placeholder="e.g. Spring burlap price list"></label>`, onSubmit: (f) => { if (!f.name.value.trim()) throw new Error("Name required"); return POST("/api/campaigns", { name: f.name.value, segment: { types: ["Lead", "Prospect"] }, layout: "branded", mailbox_id: String(defaultSender() || ""), body_html: "<p>Hi {{first_name}},</p><p></p>{{signature}}" }); } });
      if (r) go(`campaigns/${r.id}`);
    }));
  });
  const rate = (n, d) => (d ? `${num(n)} <span class="small muted">(${pct(n / d)})</span>` : "—");
  return `${pageHead("Email campaigns", "Send personalized outreach and newsletters to groups of contacts — with open, click and reply tracking", can(1) ? `<button class="btn primary" id="cmNew">${icon("plus")} New campaign</button>` : "")}
  ${!senderOpts().length ? `<div class="warn-box" style="margin-bottom:12px">No email account connected yet. <a href="#/inbox">Connect your Gmail</a> to send campaigns.</div>` : ""}
  <div class="card">${table([
    { l: "Campaign", f: (c) => `<b>${esc(c.name)}</b><div class="small muted">${esc(c.subject || "No subject yet")}</div>` }, { l: "Status", f: (c) => badge(c.status) },
    { l: "Sent", num: 1, f: (c) => num(c.sent) }, { l: "Opened", num: 1, f: (c) => rate(c.opened, c.sent) }, { l: "Clicked", num: 1, f: (c) => rate(c.clicked, c.sent) },
    { l: "Replied", num: 1, f: (c) => rate(c.replied, c.sent) }, { l: "Bounced", num: 1, f: (c) => (c.bounced ? `<span class="down">${num(c.bounced)}</span>` : c.sent ? "0" : "—") },
    { l: "Date", f: (c) => fmtDate(c.sent_at || c.created_at) }, { l: "By", k: "creator_name" },
  ], data.rows, { click: 1, empty: "No campaigns yet — create one to reach out to your leads" })}</div>`;
};
async function campaignPage(id) {
  const c = await GET(`/api/campaigns/${id}`);
  if (c.status !== "Draft") return campaignStats(c);
  const seg = JSON.parse(c.segment || "{}");
  const senders = senderOpts();
  const chips = (key, opts, sel = []) => `<div class="checks">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label><input type="checkbox" data-seg="${key}" value="${esc(v)}" ${sel.map(String).includes(String(v)) ? "checked" : ""}>${esc(l)}</label>`; }).join("")}</div>`;
  after(() => {
    const p = $("#page"); bindEditor(p);
    const readSeg = () => { const s = {}; $$("[data-seg]:checked", p).forEach((x) => (s[x.dataset.seg] = [...(s[x.dataset.seg] || []), x.value])); const nd = +$("#segNC").value; if (nd) s.not_contacted_days = nd; if (seg.contact_ids) s.contact_ids = seg.contact_ids; return s; };
    const refresh = debounce(safe(async () => {
      const r = await POST("/api/campaigns/segment-preview", { segment: readSeg() });
      const gm = $("#cmFrom").value && $("#cmFrom").value !== "resend";
      $("#segCount").innerHTML = `<b style="font-size:20px">${num(r.count)}</b> recipients`;
      $("#segSample").innerHTML = (gm && r.count > 450 ? `<div class="warn-box" style="margin-bottom:8px">Gmail sends about 500 emails a day (2,000 with Google Workspace). Narrow the audience or split it into several campaigns.</div>` : "") + (r.sample.length ? r.sample.slice(0, 8).map((x) => `${esc(x.first_name)} ${esc(x.last_name || "")} <span class="faint">${esc(x.company_name || x.email)}</span>`).join("<br>") + (r.count > 8 ? `<br><span class="faint">…and ${r.count - 8} more</span>` : "") : `<span class="faint">No contacts match. Only contacts with an email who haven't unsubscribed are included.</span>`);
    }), 250);
    p.addEventListener("change", (e) => { if (e.target.matches("[data-seg],#segNC,#cmFrom")) refresh(); });
    refresh();
    const collect = () => ({ name: $("#cmName").value, subject: $("#cmSubj").value, preheader: $("#cmPre").value, body_html: editorValue(p, "body"), segment: readSeg(), mailbox_id: $("#cmFrom").value, layout: $("#cmLayout").value });
    const save = async (quiet) => { await PATCH(`/api/campaigns/${id}`, collect()); if (!quiet) toast("Draft saved"); };
    const applyTpl = (t) => { if (!t) return; $("#cmSubj").value = t.subject || ""; setEditor(p, "body", brandize(t.body_html || "")); $("#cmLayout").value = t.layout === "plain" ? "plain" : t.layout || "branded"; };
    $("#cmTpl").onchange = (e) => { applyTpl(S.lk.templates.find((x) => x.id === +e.target.value)); e.target.value = ""; };
    $("#cmDesigns").onclick = async () => applyTpl(await pickDesign());
    $("#cmSave").onclick = safe(() => save());
    $("#cmPreview").onclick = safe(async () => { await save(true); const x = collect(); await previewEmail({ layout: x.layout, subject: x.subject, body_html: x.body_html, preheader: x.preheader, mailbox_id: x.mailbox_id, campaign: true }); });
    $("#cmTest").onclick = safe(async () => { await save(true); const to = prompt("Send a test email to:", S.me.email); if (!to) return; const r = await POST(`/api/campaigns/${id}/test`, { to }); toast(`Test sent to ${to} from ${r.from}`); });
    $("#cmDel") && ($("#cmDel").onclick = safe(async () => { if (await confirmBox("Delete this draft campaign?")) { await DEL(`/api/campaigns/${id}`); go("campaigns"); } }));
    $("#cmSend") && ($("#cmSend").onclick = safe(async () => {
      await save(true);
      const prev = await POST("/api/campaigns/segment-preview", { segment: readSeg() });
      if (!$("#cmSubj").value.trim()) throw new Error("Add a subject line first");
      const fromLabel = $("#cmFrom").selectedOptions[0]?.textContent || "";
      if (!(await confirmBox(`Send <b>${esc($("#cmSubj").value)}</b> to <b>${num(prev.count)}</b> contacts from <b>${esc(fromLabel)}</b> now? This can't be undone.`, { title: "Send campaign", ok: "Send now", danger: false }))) return;
      const ov = document.createElement("div"); ov.className = "overlay"; ov.innerHTML = `<div class="modal narrow"><div class="modal-b center"><span class="spinner"></span><p id="sendProg">Sending…</p><p class="small muted">Keep this page open until it finishes.</p></div></div>`; document.body.appendChild(ov);
      try { let r, sent = 0, failed = 0; do { r = await POST(`/api/campaigns/${id}/send`); sent += r.sent; failed += r.failed; $("#sendProg").textContent = `Sent ${sent}${failed ? `, ${failed} failed` : ""} — ${r.remaining} remaining…`; } while (r.remaining > 0 && (r.sent || r.failed)); toast(`Campaign sent to ${sent} contacts${failed ? `, ${failed} failed` : ""}`); }
      finally { ov.remove(); rerender(); }
    }));
  });
  const users = S.lk.users.map((u) => [u.id, u.name]);
  const fromVal = c.mailbox_id && senders.some((s) => String(s[0]) === String(c.mailbox_id)) ? c.mailbox_id : defaultSender();
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/campaigns">Campaigns</a> / ${esc(c.name)}</div>
  ${pageHead("Edit campaign", "Draft — choose who receives it, design the email, send yourself a test, then send.", `<button class="btn" id="cmSave">Save draft</button><button class="btn" id="cmPreview">${icon("eye")} Preview</button><button class="btn" id="cmTest">${icon("send")} Send test</button>${can(2) ? `<button class="btn primary" id="cmSend">${icon("megaphone")} Send campaign</button>` : ""}`)}
  ${!can(2) ? `<div class="info-box" style="margin-bottom:12px">You can prepare this campaign; a manager or admin sends it.</div>` : ""}
  ${!senders.length ? `<div class="warn-box" style="margin-bottom:12px">No email account to send from. <a href="#/inbox">Connect your Gmail</a> first.</div>` : ""}
  <div class="grid g-main"><div class="card"><div class="card-b"><div class="form-grid">
    <label class="f"><span>Campaign name (internal)</span><input type="text" id="cmName" value="${esc(c.name)}"></label>
    <label class="f"><span>Send from</span><select id="cmFrom">${optList(senders, fromVal, senders.length ? null : "No account connected")}</select></label>
    <label class="f full"><span>Subject line</span><input type="text" id="cmSubj" value="${esc(c.subject || "")}" placeholder="e.g. {{first_name}}, new burlap rolls just landed"></label>
    <label class="f"><span>Preview text (shown after the subject in the inbox)</span><input type="text" id="cmPre" value="${esc(c.preheader || "")}"></label>
    <label class="f"><span>Style</span><select id="cmLayout">${optList(LAYOUTS, c.layout || "branded", null)}</select></label>
    <div class="full" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn" id="cmDesigns">✨ Choose a design</button><select id="cmTpl" style="width:auto">${optList(S.lk.templates.filter((t) => t.layout !== "design").map((t) => [t.id, t.name]), "", "…or start from a template")}</select></div>
    <div class="full">${richEditor("body", brandize(c.body_html || ""), { height: 380 })}</div>
    <div class="full hint">Links are click-tracked and replies are detected in the sending Gmail account. An unsubscribe link and your business address are added to the footer automatically.</div></div></div></div>
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
  const RF = { f: "" };
  after(() => {
    $("#cmDup") && ($("#cmDup").onclick = safe(async () => { const n = await POST(`/api/campaigns/${c.id}/duplicate`); go(`campaigns/${n.id}`); }));
    $("#cmResume") && ($("#cmResume").onclick = safe(async () => { let x; do { x = await POST(`/api/campaigns/${c.id}/send`); } while (x.remaining > 0 && (x.sent || x.failed)); rerender(); }));
    $("#cmFollow") && ($("#cmFollow").onclick = safe(async () => {
      const ids = r.rows.filter((x) => x.contact_id && !x.opened_at && x.sent_at && !x.bounced_at).map((x) => x.contact_id);
      if (!ids.length) return toast("Everyone opened it!");
      const n = await POST("/api/campaigns", { name: `${c.name} — follow-up to non-openers`, subject: c.subject, preheader: c.preheader, body_html: c.body_html, layout: c.layout, mailbox_id: c.mailbox_id, segment: { contact_ids: ids } }); go(`campaigns/${n.id}`);
    }));
    $$("[data-rf]").forEach((b) => (b.onclick = () => { $$("[data-rf]").forEach((x) => x.classList.toggle("on", x === b)); const f = b.dataset.rf; $$("#rcpt tbody tr").forEach((tr) => { const x = r.rows[+tr.dataset.i]; tr.classList.toggle("hidden", !!f && !(f === "opened" ? x.opened_at : f === "clicked" ? x.clicked_at : f === "replied" ? x.replied_at : f === "unopened" ? x.sent_at && !x.opened_at && !x.bounced_at : f === "problem" ? x.bounced_at || x.status === "Failed" : true)); }); }));
    bindTable($("#rcpt"), r.rows, { click: (x) => x.contact_id && go(`contacts/${x.contact_id}`) });
  });
  const sent = c.sent || 0;
  const cnt = (f) => r.rows.filter(f).length;
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/campaigns">Campaigns</a> / ${esc(c.name)}</div>
  ${pageHead(c.name, `${badge(c.status)} Sent ${fmtDT(c.sent_at)} · Subject: <b>${esc(c.subject)}</b>`, `${c.status === "Sending" && can(2) ? `<button class="btn primary" id="cmResume">Resume sending</button>` : ""}${can(1) ? `<button class="btn" id="cmFollow">${icon("send")} Follow up non-openers</button><button class="btn" id="cmDup">${icon("copy")} Duplicate</button>` : ""}`)}
  <div class="kpis"><div class="kpi"><div class="l">Sent</div><div class="v">${num(sent)}</div><div class="d">${c.failed ? `<span class="down">${c.failed} failed</span>` : `of ${num(c.recipients)} recipients`}</div></div>
    <div class="kpi"><div class="l">Open rate</div><div class="v">${sent ? pct(c.opened / sent) : "—"}</div><div class="d">${num(c.opened)} opened</div></div>
    <div class="kpi"><div class="l">Click rate</div><div class="v">${sent ? pct(c.clicked / sent) : "—"}</div><div class="d">${num(c.clicked)} clicked a link</div></div>
    <div class="kpi"><div class="l">Reply rate</div><div class="v">${sent ? pct(c.replied / sent) : "—"}</div><div class="d">${num(c.replied)} replied</div></div>
    <div class="kpi"><div class="l">Bounced</div><div class="v ${c.bounced ? "down" : ""}">${num(c.bounced)}</div><div class="d">address not found</div></div></div>
  <div class="card" id="rcpt"><div class="card-h"><div class="seg"><button class="on" data-rf="">All ${r.rows.length}</button><button data-rf="opened">Opened ${cnt((x) => x.opened_at)}</button><button data-rf="clicked">Clicked ${cnt((x) => x.clicked_at)}</button><button data-rf="replied">Replied ${cnt((x) => x.replied_at)}</button><button data-rf="unopened">Not opened ${cnt((x) => x.sent_at && !x.opened_at && !x.bounced_at)}</button><button data-rf="problem">Problems ${cnt((x) => x.bounced_at || x.status === "Failed")}</button></div></div>
    ${table([{ l: "Contact", f: (x) => `<b>${esc(x.contact_name || "")}</b><div class="small muted">${esc(x.company_name || "")}</div>` }, { l: "Email", k: "email" },
      { l: "Status", f: (x) => (x.sent_at ? trackBadges({ ...x, status: x.status === "Failed" ? "Failed" : "" }) : badge(x.status)) + (x.error ? `<div class="small down">${esc(x.error)}</div>` : "") },
      { l: "Opened", f: (x) => (x.opened_at ? `<span class="small">${fmtDT(x.opened_at)}</span>` : "") }, { l: "Clicked", f: (x) => (x.clicked_at ? `<span class="small">${fmtDT(x.clicked_at)}</span>` : "") }, { l: "Replied", f: (x) => (x.replied_at ? `<span class="small">${fmtDT(x.replied_at)}</span>` : "") }], r.rows, { click: 1 })}</div>
  <div class="small muted" style="margin-top:8px">Opens are counted when the email's images load, so real open rates are usually a bit higher than shown. Clicks and replies are exact.</div>`;
}

// ---------------------------------------------------------------- templates
ROUTES.templates = async () => {
  const data = await GET("/api/templates?limit=500");
  const edit = async (t, preset) => {
    const v = t || preset || {};
    const r = await modal({ title: t ? "Edit template" : "New template", size: "wide",
      extraFoot: `<button type="button" class="btn left" data-preview>${icon("eye")} Preview</button>`,
      body: `<div class="form-grid"><label class="f"><span>Name</span><input type="text" name="name" value="${esc(v.name || "")}" required></label><label class="f"><span>Category</span><input type="text" name="category" value="${esc(v.category || "")}" list="tplcats"></label>
        <label class="f"><span>Subject</span><input type="text" name="subject" value="${esc(v.subject || "")}"></label><label class="f"><span>Style</span><select name="layout">${optList(LAYOUTS, v.layout || "plain", null)}</select></label>
        <div class="full">${richEditor("body", brandize(v.body_html || "<p>Hi {{first_name}},</p><p></p>{{signature}}"), { height: 340 })}</div>
        <div class="full hint">Tip: “✨ Designs” in any email gives you ready-made layouts. Paste your own HTML with the &lt;/&gt; HTML button.</div></div>
        <datalist id="tplcats"><option value="Outreach"><option value="Sales"><option value="Customer care"><option value="Newsletter"><option value="Designs"></datalist>`,
      onOpen: (f) => { bindEditor(f); $("[data-preview]", f).onclick = safe(() => previewEmail({ layout: f.layout.value, subject: f.subject.value, body_html: editorValue(f, "body") })); },
      onSubmit: (f) => { const b = { name: f.name.value, category: f.category.value, subject: f.subject.value, layout: f.layout.value, body_html: editorValue(f, "body") }; if (!b.name) throw new Error("Name required"); return t ? PATCH(`/api/templates/${t.id}`, b) : POST("/api/templates", b); } });
    if (r) { toast("Template saved"); await loadLookups(); rerender(); }
  };
  after(() => {
    $("#tpNew") && ($("#tpNew").onclick = () => edit());
    $("#tpDesign") && ($("#tpDesign").onclick = async () => { const d = await pickDesign(); if (d) edit(null, { ...d, name: d.name.replace(/^Design · /, "") + " (my version)", category: "Designs", body_html: brandize(d.body_html) }); });
    bindTable($("#page"), data.rows, { click: (t) => can(1) && edit(t) });
    $$("[data-delt]").forEach((b) => (b.onclick = safe(async () => { if (await confirmBox("Delete this template?")) { await DEL(`/api/templates/${b.dataset.delt}`); loadLookups(); rerender(); } })));
  });
  const LBL = { plain: "Personal letter", branded: "Branded", design: "Designed" };
  return `${pageHead("Email templates", "Reusable emails for outreach, follow-ups and newsletters. Use {{first_name}}, {{company}}, {{signature}} and more.", can(1) ? `<button class="btn" id="tpDesign">✨ New from a design</button><button class="btn primary" id="tpNew">${icon("plus")} New template</button>` : "")}
  <div class="card">${table([{ l: "Template", f: (t) => `<b>${esc(t.name)}</b>` }, { l: "Style", f: (t) => `<span class="badge ${t.layout === "design" ? "b-purple" : t.layout === "branded" ? "b-brown" : ""}">${LBL[t.layout] || "Personal letter"}</span>` }, { l: "Category", f: (t) => (t.category ? `<span class="tag">${esc(t.category)}</span>` : "") }, { l: "Subject", f: (t) => `<span class="small">${esc(t.subject || "")}</span>` }, { l: "Updated", f: (t) => fmtDate(t.updated_at) }, { l: "", f: (t) => (can(1) ? `<button class="icon-btn" data-delt="${t.id}">${icon("trash")}</button>` : "") }], data.rows, { click: 1, empty: "No templates" })}</div>`;
};

// ---------------------------------------------------------------- inbox (each user's own Gmail)
const IB = { box: null, folder: "in", q: "", offset: 0 };
ROUTES.emails = async () => { go("inbox"); };
ROUTES.inbox = async (_, Q) => {
  if (Q.connected || Q.gmail_error) {
    history.replaceState(null, "", "#/inbox");
    if (Q.connected) { toast(`Connected ${Q.connected}`); await loadLookups(); }
  }
  const mb = await GET("/api/mailboxes");
  const boxes = mb.rows, mine = boxes.filter((b) => b.mine);
  const err = Q.gmail_error ? `<div class="err-box" style="margin-bottom:14px">Couldn't connect Gmail: ${esc(Q.gmail_error)}</div>` : "";
  const connect = safe(async () => { const r = await POST("/api/mailboxes/connect", {}); location.href = r.url; });
  if (!boxes.length) {
    after(() => { $("#gConnect") && ($("#gConnect").onclick = connect); });
    return `${pageHead("Inbox", "Your own Gmail, inside the CRM")}${err}
    <div class="card" style="max-width:760px"><div class="card-b" style="padding:28px">
      <div style="display:flex;gap:16px;align-items:flex-start"><div class="tl-icon" style="width:48px;height:48px;background:var(--primary-soft);color:var(--primary)">${icon("mail")}</div>
      <div><h2>Connect your Gmail</h2><p class="muted" style="margin:6px 0 14px">Sign in with Google once, and the CRM can:</p>
      <ul class="steps" style="margin-bottom:16px"><li>Send emails and campaigns <b>from your own Gmail address</b> — they appear in your Gmail “Sent” folder too</li><li>Show your inbox here, and automatically log emails with customers on their timeline</li><li>Tell you when customers <b>open, click or reply</b></li></ul>
      <p class="small muted">Your personal inbox is private to you. Only emails with people saved as contacts are logged to the CRM, where your team can see them. You can disconnect at any time.</p>
      ${mb.google_ready ? `<button class="btn primary" id="gConnect" style="margin-top:8px">${icon("mail")} Connect Gmail</button>`
        : `<div class="warn-box" style="margin-top:8px">${can(3) ? `One-time setup needed first: <a href="#/settings">Settings → Email → Gmail</a> (about 10 minutes).` : "Your administrator needs to finish the one-time Gmail setup in Settings before you can connect."}</div>`}</div></div></div></div>`;
  }
  if (!IB.box || !boxes.some((b) => b.id === IB.box)) IB.box = (mine[0] || boxes[0]).id;
  const box = boxes.find((b) => b.id === IB.box);
  const data = await GET("/api/emails" + qs({ mailbox_id: IB.box, direction: IB.folder, q: IB.q, offset: IB.offset, limit: 50, sort: "created_at", dir: "DESC" }));
  const stale = !box.last_sync || Date.now() - new Date(box.last_sync) > 120000;
  after(() => {
    $$("[data-box]").forEach((b) => (b.onclick = () => { IB.box = +b.dataset.box; IB.offset = 0; rerender(); }));
    $$("[data-fold]").forEach((b) => (b.onclick = () => { IB.folder = b.dataset.fold; IB.offset = 0; rerender(); }));
    $("#ibq").oninput = debounce((e) => { IB.q = e.target.value; IB.offset = 0; rerender(); }, 300);
    $$("[data-pg]").forEach((b) => (b.onclick = () => { IB.offset += +b.dataset.pg * 50; rerender(); }));
    $("#gConnect") && ($("#gConnect").onclick = connect);
    $("#ibNew") && ($("#ibNew").onclick = () => composeEmail({ mailbox_id: box.status !== "Disconnected" ? box.id : undefined }));
    const doSync = async (quiet) => { $("#ibSync").disabled = true; $("#ibSync").innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Syncing`; try { const r = await POST(`/api/mailboxes/${box.id}/sync`, {}); if (!quiet || r.fetched) { if (!quiet) toast(r.fetched ? `${r.fetched} new message${r.fetched > 1 ? "s" : ""}` : "Up to date"); await loadLookups(); updateCounts(); rerender(); } } catch (e) { if (!quiet) toast(e.message, true); } finally { const b = $("#ibSync"); if (b) { b.disabled = false; b.innerHTML = `${icon("download")} Sync`; } } };
    $("#ibSync").onclick = () => doSync(false);
    $("#ibSettings") && ($("#ibSettings").onclick = () => mailboxSettings(box));
    $("#ibReconnect") && ($("#ibReconnect").onclick = connect);
    $$("#mailList [data-i]").forEach((tr) => (tr.onclick = () => viewEmail(data.rows[+tr.dataset.i].id, { onChange: async () => { await loadLookups(); updateCounts(); rerender(); } })));
    if (stale && box.status !== "Disconnected") doSync(true);
  });
  const who = (e) => { const p = parseAddr(e.direction === "in" ? e.from_addr : e.to_addr); return (e.direction === "out" ? "To: " : "") + (e.contact_name?.trim() || p.name || p.addr); };
  return `${pageHead("Inbox", `${esc(box.email)}${box.mine ? "" : ` · shared by ${esc(box.owner_name)}`} · ${box.last_sync ? "synced " + ago(box.last_sync) : "not synced yet"} · checks for new mail every 10 minutes`,
    `${box.status !== "Disconnected" ? `<button class="btn" id="ibSync">${icon("download")} Sync</button>` : ""}${can(1) ? `<button class="btn primary" id="ibNew">${icon("mail")} Compose</button>` : ""}`)}${err}
  ${box.status === "Disconnected" ? `<div class="err-box" style="margin-bottom:14px">${esc(box.error || "This account was disconnected.")} ${box.mine ? `<button class="btn sm" id="ibReconnect">Reconnect</button>` : ""}</div>` : box.error ? `<div class="warn-box" style="margin-bottom:14px">Last sync problem: ${esc(box.error)}</div>` : ""}
  <div class="inbox">
    <div class="card inbox-side"><div class="card-h"><h3>Accounts</h3></div><ul class="list-plain">${boxes.map((b) => `<li class="${b.id === IB.box ? "on" : ""}" data-box="${b.id}">${avatar(b.email, "sm")}<div style="flex:1;min-width:0"><div class="trunc" style="font-weight:550">${esc(b.email)}</div><div class="small muted">${b.mine ? (b.shared ? "Yours · shared with team" : "Yours · private") : "Shared by " + esc(b.owner_name)}${b.status === "Disconnected" ? ' · <span class="down">reconnect</span>' : ""}</div></div>${b.unread ? `<span class="badge b-blue">${b.unread}</span>` : ""}</li>`).join("")}</ul>
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border)">${box.mine ? `<button class="btn sm" id="ibSettings">${icon("settings")} Account settings</button>` : ""}${mb.google_ready && can(1) ? `<button class="btn sm" id="gConnect">${icon("plus")} Connect another Gmail</button>` : ""}</div></div>
    <div><div class="toolbar"><div class="seg"><button data-fold="in" class="${IB.folder === "in" ? "on" : ""}">Inbox</button><button data-fold="out" class="${IB.folder === "out" ? "on" : ""}">Sent</button><button data-fold="" class="${!IB.folder ? "on" : ""}">All</button></div><input type="search" id="ibq" placeholder="Search mail…" value="${esc(IB.q)}"></div>
      <div class="card" id="mailList">${data.rows.length ? `<div class="mail-list">${data.rows.map((e, i) => `<div class="mail-row ${e.direction === "in" && !e.is_read ? "unread" : ""}" data-i="${i}">
        <div class="mr-who">${esc(who(e))}${e.contact_id ? ` <span class="tag" title="Saved contact">contact</span>` : ""}</div>
        <div class="mr-sub"><span class="mr-s">${esc(e.subject || "(no subject)")}</span> <span class="muted">— ${esc(e.snippet || "")}</span></div>
        <div class="mr-meta">${e.attachments ? "📎 " : ""}${e.direction === "out" && e.tracked ? trackBadges(e) : ""}<span class="small muted nowrap">${fmtDT(e.created_at)}</span></div></div>`).join("")}</div>`
        : `<div class="empty">${icon("inbox")}${IB.q ? "No messages match your search" : IB.folder === "out" ? "No sent messages synced yet" : "No messages yet. New mail from the last 7 days appears after the first sync."}</div>`}
      ${pager(data.total, IB.offset, 50)}</div></div></div>`;
};
async function mailboxSettings(box) {
  const r = await modal({ title: `Account settings — ${box.email}`, size: "wide", extraFoot: `<button type="button" class="btn danger left" data-disc>${icon("x")} Disconnect</button>`,
    body: `<div class="form-grid"><label class="f"><span>Your name as recipients see it</span><input type="text" name="name" value="${esc(box.name || S.me.name)}"></label>
      <label class="f"><span>Sync new mail automatically</span><select name="sync"><option value="1" ${box.sync_enabled ? "selected" : ""}>On — every 10 minutes</option><option value="0" ${!box.sync_enabled ? "selected" : ""}>Off — only when I click Sync</option></select></label>
      <label class="switch full"><input type="checkbox" name="shared" ${box.shared ? "checked" : ""}> Share this account with the team <span class="small muted">— teammates can read this inbox and send from it (good for a sales@ or info@ address; leave off for a personal inbox)</span></label>
      <div class="full"><span class="small muted" style="font-weight:600;display:block;margin-bottom:4px">Signature for this account (used for {{signature}}). Leave empty to use the company default.</span>${richEditor("sig", box.signature || "", { height: 90 })}</div></div>`,
    onOpen: (f, close) => { bindEditor(f); $("[data-disc]", f).onclick = safe(async () => { if (await confirmBox(`Disconnect ${esc(box.email)}? The CRM stops syncing and sending from it. Emails already logged on contacts are kept.`, { ok: "Disconnect" })) { await DEL(`/api/mailboxes/${box.id}`); close(null); toast("Disconnected"); IB.box = null; await loadLookups(); rerender(); } }); },
    onSubmit: (f) => PATCH(`/api/mailboxes/${box.id}`, { name: f.name.value, sync_enabled: f.sync.value === "1", shared: f.shared.checked, signature: editorValue(f, "sig").replace(/^(<br>|<p><\/p>)$/, "") || null }) });
  if (r) { toast("Saved"); await loadLookups(); rerender(); }
}

// ---------------------------------------------------------------- email tracking
const TR = { days: 30, mailbox_id: "", user_id: "", f: "" };
ROUTES.tracking = async () => {
  const a = await GET("/api/email-activity" + qs({ days: TR.days, mailbox_id: TR.mailbox_id, user_id: TR.user_id }));
  const s = a.summary, cs = a.campaigns;
  const rows = a.sent.filter((e) => !TR.f || (TR.f === "opened" ? e.opened_at : TR.f === "clicked" ? e.clicked_at : TR.f === "replied" ? e.replied_at : TR.f === "unopened" ? !e.opened_at && !e.bounced_at && e.status !== "Failed" : e.bounced_at || e.status === "Failed"));
  after(() => {
    $$("[data-days]").forEach((b) => (b.onclick = () => { TR.days = +b.dataset.days; rerender(); }));
    $$("[data-tf]").forEach((b) => (b.onclick = () => { TR.f = b.dataset.tf; rerender(); }));
    $$("[data-flt]").forEach((x) => (x.onchange = () => { TR[x.dataset.flt] = x.value; rerender(); }));
    $("#trRefresh").onclick = () => rerender();
    bindTable($("#trSent"), rows, { click: (e) => viewEmail(e.id) });
  });
  const kpi = (l, n, d, sub) => `<div class="kpi"><div class="l">${l}</div><div class="v">${d ? pct(n / d) : "—"}</div><div class="d">${sub}</div></div>`;
  return `${pageHead("Email tracking", "See which emails were delivered, opened, clicked and answered",
    `<select data-flt="mailbox_id" style="width:auto">${optList((S.lk.mailboxes || []).map((m) => [m.id, m.email]), TR.mailbox_id, "All accounts")}</select><select data-flt="user_id" style="width:auto">${optList(S.lk.users.map((u) => [u.id, u.name]), TR.user_id, "Everyone")}</select>
     <div class="seg">${[[7, "7d"], [30, "30d"], [90, "90d"], [365, "1yr"]].map(([d, l]) => `<button data-days="${d}" class="${TR.days === d ? "on" : ""}">${l}</button>`).join("")}</div><button class="btn" id="trRefresh">${icon("download")} Refresh</button>`)}
  <div class="kpis"><div class="kpi"><div class="l">Emails sent</div><div class="v">${num(s.sent)}</div><div class="d">${s.failed ? `<span class="down">${s.failed} failed to send</span>` : "one-to-one emails"}</div></div>
    ${kpi("Open rate", s.opened, s.sent, `${num(s.opened)} opened`)}${kpi("Click rate", s.clicked, s.sent, `${num(s.clicked)} clicked a link`)}${kpi("Reply rate", s.replied, s.sent, `${num(s.replied)} replied`)}
    <div class="kpi"><div class="l">Bounced</div><div class="v ${s.bounced ? "down" : ""}">${num(s.bounced)}</div><div class="d">address didn't exist</div></div></div>
  ${cs.sent ? `<div class="info-box" style="margin-bottom:16px">Campaigns in this period: <b>${num(cs.sent)}</b> sent · <b>${pct(cs.opened / cs.sent)}</b> opened · <b>${pct(cs.clicked / cs.sent)}</b> clicked · <b>${pct(cs.replied / cs.sent)}</b> replied${cs.bounced ? ` · <b>${num(cs.bounced)}</b> bounced` : ""}. <a href="#/campaigns">See each campaign →</a></div>` : ""}
  <div class="grid g-main" style="margin-bottom:16px">
    <div class="card" id="trSent"><div class="card-h" style="flex-wrap:wrap"><h3>Sent emails</h3><div class="seg" style="margin-left:auto">${[["", "All"], ["opened", "Opened"], ["clicked", "Clicked"], ["replied", "Replied"], ["unopened", "Not opened"], ["problem", "Bounced / failed"]].map(([v, l]) => `<button data-tf="${v}" class="${TR.f === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${table([{ l: "To", f: (e) => `<b>${esc(e.contact_name?.trim() || parseAddr(e.to_addr).addr)}</b><div class="small muted">${esc(e.contact_name?.trim() ? parseAddr(e.to_addr).addr : "")}</div>` }, { l: "Subject", f: (e) => `<span class="small">${esc(e.subject)}</span>` },
        { l: "Status", f: (e) => trackBadges(e) }, { l: "From", f: (e) => `<span class="small muted">${esc(e.sent_from)}</span>`, cls: "hide-sm" }, { l: "Sent", f: (e) => `<span class="small nowrap">${fmtDT(e.created_at)}</span>` }], rows, { click: 1, empty: "No emails sent in this period" })}</div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-h"><h3>Live activity</h3><span class="small muted">latest first</span></div>${a.events.length ? `<ul class="list-plain feed">${a.events.slice(0, 40).map(evItem).join("")}</ul>` : `<div class="empty small">Nothing yet — opens, clicks and replies appear here as they happen.</div>`}</div>
      <div class="card"><div class="card-h"><h3>Most engaged contacts</h3></div>${a.engaged.length ? `<ul class="list-plain">${a.engaged.map((x) => `<li>${avatar(x.name, "sm")}<a href="#/contacts/${x.contact_id}" style="flex:1">${esc(x.name)}</a><span class="small muted">${x.opens ? `${x.opens} opens` : ""}${x.clicks ? ` · ${x.clicks} clicks` : ""}${x.replies ? ` · ${x.replies} replies` : ""}</span></li>`).join("")}</ul>` : `<div class="empty small">No engagement yet</div>`}</div>
    </div></div>
  <div class="card"><div class="card-h"><h3>How tracking works</h3></div><div class="card-b small"><dl class="props" style="grid-template-columns:130px 1fr">
    <dt>${trackBadges({ opened_at: 1 })}</dt><dd>A tiny invisible image in the email loaded. Some email apps block images (so the open isn't counted) and Apple Mail preloads them (so it may count an open that wasn't read). Treat opens as a good signal, not proof.</dd>
    <dt><span class="badge b-blue">Clicked</span></dt><dd>The person clicked a link in your email. Very reliable.</dd>
    <dt><span class="badge b-purple">↩ Replied</span></dt><dd>A reply arrived in the Gmail account that sent the email. Shows within ~10 minutes, or right away when you click Sync in the Inbox.</dd>
    <dt><span class="badge b-red">Bounced</span></dt><dd>Gmail reported the address doesn't exist or rejected the email. Fix or remove that contact's email.</dd>
    <dt><span class="badge">Not opened yet</span></dt><dd>Sent successfully — it reached their mail server — but no open recorded yet.</dd></dl></div></div>`;
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
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select name="mode" style="width:auto">${t.contact_email && senderOpts().length ? `<option value="email">Email reply to ${esc(t.contact_email)}</option>` : ""}<option value="public">Log reply (not emailed)</option><option value="internal">Internal note</option></select>
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
  const [data, boxes] = await Promise.all([GET("/api/users"), GET("/api/mailboxes?all=1")]);
  const gmailOf = (u) => boxes.rows.filter((b) => b.user_id === u.id).map((b) => `<span class="badge ${b.status === "Disconnected" ? "b-red" : "b-green"}" title="${esc(b.status)}${b.shared ? " · shared" : ""}">${esc(b.email)}</span>`).join(" ") || '<span class="faint small">not connected</span>';
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
  <div class="card" style="margin-bottom:16px">${table([{ l: "Name", f: (u) => `<div class="name-cell">${avatar(u.name)}<div><b>${esc(u.name)}</b><span class="small muted">${esc(u.title || "")}</span></div></div>` }, { l: "Email (login)", k: "email" }, { l: "Role", f: (u) => badge(u.role) }, { l: "Gmail", f: gmailOf }, { l: "Status", f: (u) => (u.active ? (u.must_change_password ? '<span class="badge b-amber">Invited</span>' : badge("Active")) : '<span class="badge b-red">Deactivated</span>') }, { l: "Last sign-in", f: (u) => (u.last_login ? ago(u.last_login) : '<span class="faint">never</span>') }, { l: "", f: (u) => (u.id === S.me.id ? '<span class="small muted">you</span>' : `<button class="icon-btn" data-u="${u.id}">${icon("more")}</button>`) }], data.rows)}</div>
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
    $("#testMail").onclick = safe(async () => { const r = await POST("/api/emails/send", { to: S.me.email, layout: "branded", subject: "Test email from your CRM", body_html: "<p>Hi {{my_name}},</p><p>Email sending from the CRM is working.</p>{{signature}}" }); toast(`Test email sent to ${S.me.email} from ${r.from}`); });
    $("#copyRedirect").onclick = () => navigator.clipboard.writeText(s.redirect_uri).then(() => toast("Copied"));
    $("#logoFile").onchange = safe(async (e) => { const file = e.target.files[0]; if (!file) return; const r = await uploadImage(file, 600); $("[name=logo_url]").value = r.url; $("#logoPrev").innerHTML = `<img src="${esc(r.url)}" style="max-height:44px">`; toast("Logo uploaded — click Save settings"); });
    $("#logoClear").onclick = () => { $("[name=logo_url]").value = ""; $("#logoPrev").innerHTML = `<span class="muted small">No logo — your business name is shown instead</span>`; };
    $("#brandPick").oninput = (e) => ($("[name=brand_color]").value = e.target.value);
    $("[name=brand_color]").oninput = (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $("#brandPick").value = e.target.value; };
  });
  const inp = (k, l, t = "text", ph = "", hint = "") => `<label class="f"><span>${l}</span><input type="${t}" name="${k}" value="${esc(s[k] ?? "")}" placeholder="${esc(ph)}">${hint ? `<div class="hint">${hint}</div>` : ""}</label>`;
  return `${pageHead("Settings", "Business details, sales targets, email accounts and branding")}
  <form id="setForm" class="grid" style="max-width:980px">
    <div class="card"><div class="card-h"><h3>Business</h3></div><div class="card-b"><div class="form-grid">${inp("company_name", "Business name")}${inp("company_tagline", "Tagline")}${inp("company_phone", "Phone")}${inp("company_website", "Website", "text", "indiancraftsupply.com", "Buttons in designed emails link here.")}
      <label class="f full"><span>Business mailing address</span><input type="text" name="company_address" value="${esc(s.company_address)}"><div class="hint">Shown in the footer of marketing emails — required by anti-spam laws (CAN-SPAM).</div></label></div></div></div>
    <div class="card"><div class="card-h"><h3>Sales</h3></div><div class="card-b"><div class="form-grid">${inp("monthly_target", "Monthly revenue target", "number", "", "Used on the dashboard and forecast.")}
      <label class="f"><span>Currency</span><select name="currency">${optList(["USD", "INR", "CAD", "GBP", "EUR", "AUD", "AED"], s.currency, null)}</select></label></div></div></div>

    <div class="card"><div class="card-h"><h3>Gmail — each person sends from their own Gmail</h3>${s.google_ready ? '<span class="badge b-green" style="margin-left:auto">Ready</span>' : '<span class="badge b-amber" style="margin-left:auto">One-time setup needed</span>'}</div><div class="card-b">
      <p class="muted" style="margin-top:0">Once this is set up, each user clicks <b>Inbox → Connect Gmail</b> and signs in with their own Google account. They get their own inbox in the CRM, and choose which account to send from. Google requires every business to register its own “app” once, which is what these steps do. It's free.</p>
      <details ${s.google_ready ? "" : "open"} class="setup-steps"><summary><b>Step-by-step setup (about 10 minutes)</b></summary><ol class="steps">
        <li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> and sign in with your Google account. Create a project named <b>ICS CRM</b>.</li>
        <li>Open <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">Gmail API</a> and click <b>Enable</b>.</li>
        <li>Open <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a> → <b>Get started</b>. App name: <b>${esc(s.company_name)} CRM</b>; support email: yours. Audience: <b>External</b> (if you use Google Workspace for your business email, choose <b>Internal</b> instead — then skip step 6).</li>
        <li><b>Data access</b> → Add or remove scopes → tick <code>…/auth/gmail.send</code> and <code>…/auth/gmail.readonly</code> → Update → Save.</li>
        <li><b>Clients</b> → Create client → Application type <b>Web application</b> → under <b>Authorized redirect URIs</b> add exactly:<div class="copy-row"><code>${esc(s.redirect_uri)}</code><button type="button" class="btn sm" id="copyRedirect">${icon("copy")} Copy</button></div>Click Create, then copy the <b>Client ID</b> and <b>Client secret</b> into the boxes below.</li>
        <li><b>Audience</b> → click <b>Publish app</b> (“In production”). Important: if the app stays in “Testing”, Google disconnects everyone every 7 days. When you and your team connect, Google shows a “Google hasn't verified this app” screen — click <b>Advanced → Go to ${esc(s.company_name)} CRM</b>. That's expected for a private business app.</li>
      </ol></details>
      <div class="form-grid" style="margin-top:14px">${inp("google_client_id", "Client ID", "text", "123456-abc.apps.googleusercontent.com")}
        <label class="f"><span>Client secret</span><input type="password" name="google_client_secret" placeholder="${s.google_secret_saved ? "•••••• saved — leave blank to keep" : "GOCSPX-…"}" autocomplete="off"><div class="hint">Stored securely on Cloudflare and never shown again.</div></label></div>
      ${s.google_ready ? `<div class="ok-box" style="margin-top:12px">Gmail is ready. Each user can now go to <a href="#/inbox">Inbox</a> and click <b>Connect Gmail</b>.</div>` : ""}</div></div>

    <div class="card"><div class="card-h"><h3>Email look & signature</h3></div><div class="card-b"><div class="form-grid">
      <label class="f"><span>Brand color</span><div style="display:flex;gap:8px;align-items:center"><input type="color" id="brandPick" value="${esc(/^#[0-9a-f]{6}$/i.test(s.brand_color) ? s.brand_color : "#86602d")}" style="width:46px;height:36px;padding:2px;border:1px solid var(--border2);border-radius:8px;background:var(--surface)"><input type="text" name="brand_color" value="${esc(s.brand_color || "#86602d")}" style="width:120px"></div><div class="hint">Used for buttons, headers and designed emails.</div></label>
      <label class="f"><span>Logo</span><input type="hidden" name="logo_url" value="${esc(s.logo_url || "")}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div id="logoPrev">${s.logo_url ? `<img src="${esc(s.logo_url)}" style="max-height:44px">` : `<span class="muted small">No logo — your business name is shown instead</span>`}</div><label class="btn sm" style="cursor:pointer">${icon("upload")} Upload<input type="file" id="logoFile" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label><button type="button" class="btn sm ghost" id="logoClear">Remove</button></div><div class="hint">A wide PNG with a transparent background works best.</div></label>
      ${inp("email_footer", "Extra footer line (optional)", "text", "e.g. Wholesale only · Free samples on request")}
      <div class="full"><span class="small muted" style="font-weight:600;display:block;margin-bottom:4px">Default email signature — used for {{signature}} (each Gmail account can have its own in Inbox → Account settings)</span>${richEditor("sig", s.email_signature || `<p>{{my_name}}<br>{{my_title}}<br>${esc(s.company_name)}<br>{{my_phone}}</p>`, { height: 100 })}</div></div>
      <div style="margin-top:12px"><button type="button" class="btn" id="testMail" ${senderOpts().length ? "" : "disabled"}>${icon("send")} Send a test email to me</button> <span class="small muted">${senderOpts().length ? "" : "Connect your Gmail in Inbox first."}</span></div></div></div>

    <details class="card"><summary class="card-h" style="cursor:pointer"><h3>Optional: company sending through Resend</h3><span class="badge ${s.email_ready ? "b-green" : ""}" style="margin-left:auto">${s.email_ready ? "Connected" : "Not used"}</span></summary><div class="card-b">
      <p class="muted" style="margin-top:0">Most businesses only need Gmail. Resend is useful for campaigns to more than ~500 people a day (Gmail's limit). When set up, “Company sending” appears as an extra <b>From</b> choice.</p>
      <ol class="steps small"><li>Create an account at <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> (3,000 emails/month free) and verify your domain.</li><li>Create an API key with “Sending access” and paste it below, with a From address on that domain.</li></ol>
      <div class="form-grid">${inp("email_from_name", "From name", "text", "Indian Craft Supply")}${inp("email_from_address", "From address", "email", "sales@yourdomain.com")}
      ${inp("email_reply_to", "Reply-to address", "email", "", "Where replies to company emails go (e.g. your Gmail address, so replies show in your CRM inbox).")}
      <label class="f"><span>Resend API key</span><input type="password" name="resend_api_key" placeholder="${s.resend_key_source ? "•••••• (" + esc(s.resend_key_source) + ") — leave blank to keep" : "re_…"}" autocomplete="off"><div class="hint">Stored securely and never shown again.${s.resend_key_source === "saved in settings" ? ` <a href="javascript:void 0" id="clearKey">Remove key</a>` : ""}</div></label></div></div></details>

    <details class="card"><summary class="card-h" style="cursor:pointer"><h3>Optional: receive email at your own domain</h3></summary><div class="card-b">
      <p class="muted" style="margin-top:0">If your business domain is on Cloudflare, emails sent to an address like crm@yourdomain.com can be delivered straight into the CRM (matched to the contact, or saved as a new lead). Not needed if you use Gmail.</p>
      <ol class="steps small"><li>Cloudflare dashboard → your domain → Email → Email Routing → enable it.</li><li>Routing rules → Create address (e.g. <b>crm@yourdomain.com</b>) → Action: <b>Send to a Worker</b> → choose <b>ics-crm</b>.</li></ol>
      <div class="form-grid">${inp("inbound_address", "CRM inbound address", "email", "crm@yourdomain.com")}${inp("support_address", "Support address (creates tickets)", "email", "support@yourdomain.com", "New emails to this address open a support ticket automatically.")}</div></div></details>
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
