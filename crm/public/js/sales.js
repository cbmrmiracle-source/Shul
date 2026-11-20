/* Pipeline, deals, tasks, activity log, forecast, products */
"use strict";
const OPEN_STAGES = ["Lead", "Qualified", "Sample Sent", "Quote Sent", "Negotiation"];

// ---------------------------------------------------------------- pipeline
const PL = { view: "board", owner_id: "", q: "", showClosed: false };
ROUTES.pipeline = async () => {
  const data = await GET("/api/deals" + qs({ owner_id: PL.owner_id, q: PL.q, limit: 2000, sort: "expected_close", dir: "ASC" }));
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = data.rows.filter((d) => PL.showClosed || !["Won", "Lost"].includes(d.stage) || (d.closed_at && d.closed_at >= since));
  const open = rows.filter((d) => OPEN_STAGES.includes(d.stage));
  const stages = [...OPEN_STAGES, "Won", "Lost"];
  after(() => {
    $$("[data-view]").forEach((b) => (b.onclick = () => { PL.view = b.dataset.view; rerender(); }));
    $("#plOwner").onchange = (e) => { PL.owner_id = e.target.value; rerender(); };
    $("#plq").oninput = debounce((e) => { PL.q = e.target.value; rerender(); }, 300);
    $("#plClosed").onchange = (e) => { PL.showClosed = e.target.checked; rerender(); };
    $("#plNew") && ($("#plNew").onclick = () => editRecord("deal").then((r) => r && rerender()));
    if (PL.view === "list") bindTable($("#page"), rows, { click: (r) => go(`deals/${r.id}`) });
    if (PL.view === "board") {
      $$(".dcard").forEach((c) => {
        c.onclick = () => go(`deals/${c.dataset.id}`);
        if (!can(1)) return;
        c.draggable = true;
        c.ondragstart = (e) => { e.dataTransfer.setData("text/plain", c.dataset.id); c.classList.add("dragging"); };
        c.ondragend = () => c.classList.remove("dragging");
      });
      $$(".col").forEach((col) => {
        col.ondragover = (e) => { e.preventDefault(); col.classList.add("over"); };
        col.ondragleave = () => col.classList.remove("over");
        col.ondrop = safe(async (e) => {
          e.preventDefault(); col.classList.remove("over");
          const id = +e.dataTransfer.getData("text/plain"), stage = col.dataset.stage, d = rows.find((x) => x.id === id);
          if (!d || d.stage === stage) return;
          await moveStage(d, stage);
          rerender();
        });
      });
    }
  });
  const ownerSel = `<select id="plOwner" style="width:auto">${optList(S.lk.users.map((u) => [u.id, u.name]), PL.owner_id, "Everyone's deals")}</select>`;
  const head = pageHead("Sales pipeline", `${open.length} open deals · ${money(open.reduce((s, d) => s + d.value, 0))} total · ${money(open.reduce((s, d) => s + d.weighted_value, 0))} weighted`,
    `<div class="seg"><button data-view="board" class="${PL.view === "board" ? "on" : ""}">Board</button><button data-view="list" class="${PL.view === "list" ? "on" : ""}">List</button></div>${can(1) ? `<button class="btn primary" id="plNew">${icon("plus")} New deal</button>` : ""}`);
  const tools = `<div class="toolbar"><input type="search" id="plq" placeholder="Search deals…" value="${esc(PL.q)}">${ownerSel}<label class="switch small"><input type="checkbox" id="plClosed" ${PL.showClosed ? "checked" : ""}> Show all closed deals (default: last 30 days)</label></div>`;
  if (PL.view === "list") {
    return head + tools + `<div class="card">${table([
      { l: "Deal", f: (d) => `<b>${esc(d.title)}</b>` }, { l: "Company / contact", f: (d) => esc(d.company_name || d.contact_name || "") }, { l: "Stage", f: (d) => badge(d.stage) },
      { l: "Value", num: 1, f: (d) => money(d.value) }, { l: "Prob.", num: 1, f: (d) => `${d.probability ?? 0}%` }, { l: "Weighted", num: 1, f: (d) => money(d.weighted_value) },
      { l: "Expected close", f: (d) => `<span class="${d.expected_close && d.expected_close < today() && !["Won", "Lost"].includes(d.stage) ? "down" : ""}">${fmtDate(d.expected_close)}</span>` },
      { l: "Next step", f: (d) => `<span class="small">${esc(d.next_step || "")}</span>`, cls: "hide-sm" }, { l: "Owner", k: "owner_name" },
    ], rows, { click: 1, empty: "No deals yet" })}</div>`;
  }
  return head + tools + `<div class="board">${stages.map((s) => {
    const ds = rows.filter((d) => d.stage === s), tot = ds.reduce((a, d) => a + d.value, 0);
    return `<div class="col" data-stage="${esc(s)}"><div class="col-h"><div style="display:flex;justify-content:space-between"><b>${esc(s)}</b><span class="badge ${BADGE[s] || ""}">${ds.length}</span></div><div class="m">${money(tot, 1)}${OPEN_STAGES.includes(s) ? ` · ${S.settings.stage_probability?.[s] ?? ""}%` : ""}</div></div>
      <div class="col-b">${ds.map((d) => `<div class="dcard" data-id="${d.id}"><b>${esc(d.title)}</b><div class="small muted">${esc(d.company_name || d.contact_name || "—")}</div>
        <div class="row"><span class="val">${money(d.value, 1)}</span><span class="${d.expected_close && d.expected_close < today() && OPEN_STAGES.includes(s) ? "down" : ""}">${d.expected_close ? fmtDate(d.expected_close) : ""}</span></div>
        ${d.next_step ? `<div class="small" style="margin-top:5px;color:var(--muted)">→ ${esc(d.next_step)}</div>` : ""}<div class="row">${avatar(d.owner_name || "?", "sm")}<span>${d.probability ?? 0}%</span></div></div>`).join("") || `<div class="small faint center" style="padding:16px 0">Drop deals here</div>`}</div></div>`;
  }).join("")}</div>`;
};
async function moveStage(d, stage) {
  let extra = {};
  if (stage === "Lost") {
    const r = await modal({ title: `Mark “${d.title}” as lost`, size: "narrow", submit: "Mark lost", danger: true, body: `<label class="f"><span>Why was it lost?</span><select name="lost_reason">${optList(O.lost, "", null)}</select></label><label class="f" style="margin-top:10px"><span>Notes</span><textarea name="notes" placeholder="Optional"></textarea></label>`, onSubmit: (f) => ({ lost_reason: f.lost_reason.value, n: f.notes.value }) });
    if (!r) return false;
    extra.lost_reason = r.lost_reason; if (r.n) extra.notes = [d.notes, r.n].filter(Boolean).join("\n");
  }
  await PATCH(`/api/deals/${d.id}`, { stage, ...extra });
  toast(stage === "Won" ? `🎉 Won ${money(d.value)}!` : `Moved to ${stage}`);
  return true;
}

// ---------------------------------------------------------------- deal detail
ROUTES.deals = async (id) => {
  if (!id) return go("pipeline");
  const [d, tl, tasks, emails] = await Promise.all([GET(`/api/deals/${id}`), GET(`/api/timeline?deal_id=${id}`), GET(`/api/tasks?deal_id=${id}&limit=100&sort=due_at&dir=ASC`), GET(`/api/emails?deal_id=${id}&limit=100`)]);
  let lines = []; try { lines = JSON.parse(d.product_lines || "[]"); } catch {}
  const si = O.stages.indexOf(d.stage);
  after(() => {
    bindTimeline($("#page"));
    $$("[data-stage]").forEach((b) => (b.onclick = safe(async () => { if (!can(1)) return; if (await moveStage(d, b.dataset.stage)) rerender(); })));
    const pre = { deal_id: d.id, contact_id: d.contact_id, company_id: d.company_id };
    const A = {
      edit: () => editRecord("deal", d).then((r) => r && rerender()), del: () => deleteRecord("deal", d, d.title).then((r) => r && go("pipeline")),
      log: () => editRecord("interaction", null, pre).then((r) => r && rerender()), task: () => editRecord("task", null, { ...pre, title: d.next_step || "" }).then((r) => r && rerender()),
      email: () => composeEmail({ contact_id: d.contact_id, deal_id: d.id }),
      quote: () => composeEmail({ contact_id: d.contact_id, deal_id: d.id, subject: `Quotation: ${d.title}`, body: quoteHtml(d, lines) }),
    };
    $$("[data-a]").forEach((b) => (b.onclick = () => A[b.dataset.a]()));
    $$("[data-task-done]").forEach((b) => (b.onclick = safe(async () => { await PATCH(`/api/tasks/${b.dataset.taskDone}`, { status: b.classList.contains("on") ? "Open" : "Done" }); rerender(); })));
  });
  const w = can(1);
  return `<div class="small muted" style="margin-bottom:10px"><a href="#/pipeline">Pipeline</a> / ${esc(d.title)}</div>
  <div class="card" style="margin-bottom:16px"><div class="profile-head"><span class="avatar lg" style="border-radius:12px;background:var(--c3)">${icon("dollar").replace("<svg", '<svg style="width:26px;height:26px"')}</span>
    <div class="info"><h1>${esc(d.title)}</h1><div class="muted">${d.company_id ? `<a href="#/companies/${d.company_id}">${esc(d.company_name)}</a>` : ""}${d.company_id && d.contact_id ? " · " : ""}${d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name)}</a>` : ""}</div></div>
    <div class="right"><div style="font-size:26px;font-weight:700">${money(d.value)}</div><div class="small muted">${d.probability ?? 0}% · weighted ${money(d.weighted_value)}</div></div></div>
    <div style="padding:0 18px 14px"><div class="stagebar">${O.stages.map((s, i) => `<button data-stage="${esc(s)}" class="${s === d.stage ? (s === "Won" ? "won" : s === "Lost" ? "lost" : "cur") : i < si && d.stage !== "Lost" ? "done" : ""}" ${w ? "" : "disabled"}>${esc(s)}</button>`).join("")}</div></div>
    ${w ? `<div class="quick"><button class="btn sm" data-a="edit">${icon("edit")} Edit</button><button class="btn sm" data-a="email">${icon("mail")} Email</button><button class="btn sm" data-a="quote">${icon("send")} Email quote</button><button class="btn sm" data-a="log">${icon("activity")} Log activity</button><button class="btn sm" data-a="task">${icon("tasks")} Task</button>${can(2) ? `<button class="btn sm danger" data-a="del" style="margin-left:auto">${icon("trash")} Delete</button>` : ""}</div>` : ""}</div>
  <div class="grid g-main"><div class="grid" style="align-content:start">
    <div class="card"><div class="card-h"><h3>Products & quantities</h3></div>${lines.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${num(l.qty, 2)}</td><td>${esc(l.unit || "")}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.qty * l.price)}</td></tr>`).join("")}<tr><td colspan="4" class="right"><b>Total</b></td><td class="num"><b>${money(lines.reduce((s, l) => s + l.qty * l.price, 0))}</b></td></tr></tbody></table></div>` : `<div class="empty small">No product lines. Edit the deal to add jute, burlap or cotton items and quantities.</div>`}</div>
    <div class="card"><div class="card-h"><h3>Timeline</h3></div>${tl.items.length ? `<div class="timeline">${tl.items.map(tlItem).join("")}</div>` : `<div class="empty">No activity on this deal yet</div>`}</div>
  </div><div class="grid" style="align-content:start">
    <div class="card"><div class="card-h"><h3>Deal info</h3></div><div class="card-b"><dl class="props"><dt>Stage</dt><dd>${badge(d.stage)}</dd><dt>Expected close</dt><dd>${fmtDate(d.expected_close) || "—"}</dd>${d.closed_at ? `<dt>Closed</dt><dd>${fmtDate(d.closed_at)}</dd>` : ""}
      <dt>Owner</dt><dd>${esc(d.owner_name || "—")}</dd><dt>Source</dt><dd>${esc(d.source || "—")}</dd><dt>Next step</dt><dd>${esc(d.next_step || "—")}</dd>${d.lost_reason ? `<dt>Lost reason</dt><dd>${esc(d.lost_reason)}</dd>` : ""}<dt>Created</dt><dd>${fmtDate(d.created_at)}</dd></dl>
      ${d.notes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);white-space:pre-wrap">${esc(d.notes)}</div>` : ""}</div></div>
    <div class="card"><div class="card-h"><h3>Tasks</h3></div>${tasksMini(tasks.rows)}</div>
    <div class="card"><div class="card-h"><h3>Emails</h3></div>${emails.rows.length ? `<ul class="list-plain">${emails.rows.map((e) => `<li><a href="javascript:void 0" onclick="viewEmail(${e.id})" style="flex:1">${esc(e.subject)}</a>${badge(e.status)}<span class="small muted">${fmtDate(e.created_at)}</span></li>`).join("")}</ul>` : `<div class="empty small">No emails yet</div>`}</div>
  </div></div>`;
};
function quoteHtml(d, lines) {
  const rows = lines.map((l) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${num(l.qty, 2)} ${esc(l.unit || "")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.price)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.qty * l.price)}</td></tr>`).join("");
  return `<p>Hi {{first_name}},</p><p>Thank you for your interest. Here is our quotation for <b>${esc(d.title)}</b>:</p>
  ${lines.length ? `<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#f6f1e8"><th style="padding:6px 8px;text-align:left">Item</th><th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Unit price</th><th style="padding:6px 8px;text-align:right">Total</th></tr>${rows}<tr><td colspan="3" style="padding:8px;text-align:right"><b>Total</b></td><td style="padding:8px;text-align:right"><b>${money(d.value)}</b></td></tr></table>` : `<p><b>Total: ${money(d.value)}</b></p>`}
  <p>Prices are valid for 30 days. Let me know if you'd like to adjust quantities or delivery timing.</p><p>{{signature}}</p>`;
}

// ---------------------------------------------------------------- tasks
const TK = { view: "open", mine: "1", q: "", type: "", priority: "" };
ROUTES.tasks = async () => {
  const p = { mine: TK.mine, q: TK.q, type: TK.type, priority: TK.priority, limit: 300, sort: "due_at", dir: "ASC" };
  if (TK.view === "done") Object.assign(p, { status: "Done", sort: "completed_at", dir: "DESC" }); else p.view = TK.view;
  const data = await GET("/api/tasks" + qs(p));
  const t0 = today();
  const groups = TK.view === "done" ? [["Completed", data.rows]] : [["Overdue", data.rows.filter((t) => t.due_at && t.due_at.slice(0, 10) < t0)], ["Today", data.rows.filter((t) => t.due_at && t.due_at.slice(0, 10) === t0)], ["Upcoming", data.rows.filter((t) => t.due_at && t.due_at.slice(0, 10) > t0)], ["No due date", data.rows.filter((t) => !t.due_at)]].filter((g) => g[1].length);
  after(() => {
    $$("[data-tv]").forEach((b) => (b.onclick = () => { TK.view = b.dataset.tv; rerender(); }));
    $("#tkMine").onchange = (e) => { TK.mine = e.target.value; rerender(); };
    $$("[data-flt]").forEach((s) => (s.onchange = () => { TK[s.dataset.flt] = s.value; rerender(); }));
    $("#tkq").oninput = debounce((e) => { TK.q = e.target.value; rerender(); }, 300);
    $("#tkNew") && ($("#tkNew").onclick = () => editRecord("task").then((r) => r && (rerender(), updateCounts())));
    $$("[data-task-done]").forEach((b) => (b.onclick = safe(async (e) => { e.stopPropagation(); await PATCH(`/api/tasks/${b.dataset.taskDone}`, { status: b.classList.contains("on") ? "Open" : "Done" }); toast(b.classList.contains("on") ? "Reopened" : "Task completed"); rerender(); updateCounts(); })));
    $$("[data-edit-task]").forEach((li) => (li.onclick = async (e) => { if (e.target.closest("a,.check,button")) return; const t = data.rows.find((x) => x.id === +li.dataset.editTask); if (await editRecord("task", t)) rerender(); }));
    $$("[data-del-task]").forEach((b) => (b.onclick = safe(async (e) => { e.stopPropagation(); if (await confirmBox("Delete this task?")) { await DEL(`/api/tasks/${b.dataset.delTask}`); rerender(); updateCounts(); } })));
  });
  const views = [["open", "All open"], ["today", "Today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["done", "Completed"]];
  return `${pageHead("Tasks", "Follow-ups, calls, samples to send and payments to collect", can(1) ? `<button class="btn primary" id="tkNew">${icon("plus")} New task</button>` : "")}
  <div class="toolbar"><div class="seg">${views.map(([v, l]) => `<button data-tv="${v}" class="${TK.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <select id="tkMine" style="width:auto"><option value="1" ${TK.mine === "1" ? "selected" : ""}>My tasks</option><option value="" ${TK.mine === "" ? "selected" : ""}>Everyone's tasks</option></select>
    <select data-flt="type">${optList(O.ttype, TK.type, "All types")}</select><select data-flt="priority">${optList(O.priority, TK.priority, "Any priority")}</select><input type="search" id="tkq" placeholder="Search tasks…" value="${esc(TK.q)}"></div>
  ${groups.length ? groups.map(([g, rows]) => `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3 class="${g === "Overdue" ? "down" : ""}">${g}</h3><span class="badge">${rows.length}</span></div><ul class="list-plain">${rows.map((t) => `<li data-edit-task="${t.id}" style="cursor:pointer">
    <span class="check ${t.status === "Done" ? "on" : ""}" data-task-done="${t.id}" title="${t.status === "Done" ? "Reopen" : "Mark done"}">${t.status === "Done" ? icon("check") : ""}</span>
    <div style="flex:1;min-width:0"><div style="font-weight:550;${t.status === "Done" ? "text-decoration:line-through;color:var(--muted)" : ""}">${esc(t.title)}</div>
    <div class="small muted">${esc(t.type)}${t.contact_name ? ` · <a href="#/contacts/${t.contact_id}">${esc(t.contact_name)}</a>` : ""}${t.company_name ? ` · <a href="#/companies/${t.company_id}">${esc(t.company_name)}</a>` : ""}${t.deal_title ? ` · <a href="#/deals/${t.deal_id}">${esc(t.deal_title)}</a>` : ""}${t.description ? " · " + esc(t.description.slice(0, 80)) : ""}</div></div>
    ${t.priority !== "Normal" ? badge(t.priority) : ""}<span class="small ${g === "Overdue" ? "down" : "muted"} nowrap">${t.status === "Done" ? "Done " + fmtDate(t.completed_at) : t.due_at ? fmtDate(t.due_at) : ""}</span>
    ${TK.mine ? "" : `<span class="hide-sm">${avatar(t.assignee_name || "?", "sm")}</span>`}<button class="icon-btn" data-del-task="${t.id}" title="Delete">${icon("trash")}</button></li>`).join("")}</ul></div>`).join("") : `<div class="card"><div class="empty">${icon("tasks")}No tasks here. Nice work!</div></div>`}`;
};

// ---------------------------------------------------------------- activity log
const AL = { type: "", user_id: "", from: "", to: "", q: "", offset: 0 };
ROUTES.activities = async () => {
  const data = await GET("/api/interactions" + qs({ ...AL, limit: 50, sort: "occurred_at", dir: "DESC" }));
  after(() => {
    bindTimeline($("#page"));
    $$("[data-flt]").forEach((s) => (s.onchange = () => { AL[s.dataset.flt] = s.value; AL.offset = 0; rerender(); }));
    $("#alq").oninput = debounce((e) => { AL.q = e.target.value; AL.offset = 0; rerender(); }, 300);
    $$("[data-pg]").forEach((b) => (b.onclick = () => { AL.offset += +b.dataset.pg * 50; rerender(); }));
    $("#alNew") && ($("#alNew").onclick = () => editRecord("interaction").then((r) => r && rerender()));
  });
  return `${pageHead("Activity log", "Every call, email, meeting, visit and note across the business", can(1) ? `<button class="btn primary" id="alNew">${icon("plus")} Log activity</button>` : "")}
  <div class="toolbar"><input type="search" id="alq" placeholder="Search notes…" value="${esc(AL.q)}"><select data-flt="type">${optList([...O.itype, "Campaign", "Stage change"], AL.type, "All types")}</select>
    <select data-flt="user_id">${optList(S.lk.users.map((u) => [u.id, u.name]), AL.user_id, "Everyone")}</select>
    <label class="small muted">From</label><input type="date" data-flt="from" value="${esc(AL.from)}" style="width:auto"><label class="small muted">to</label><input type="date" data-flt="to" value="${esc(AL.to)}" style="width:auto"></div>
  <div class="card">${data.rows.length ? `<div class="timeline">${data.rows.map((r) => tlItem({ ...r, kind: "interaction", at: r.occurred_at })).join("")}</div>` : `<div class="empty">${icon("activity")}No activity found</div>`}${pager(data.total, AL.offset, 50)}</div>`;
};

// ---------------------------------------------------------------- forecast
const FC = { months: 6, owner_id: "" };
ROUTES.forecast = async () => {
  const f = await GET("/api/forecast" + qs(FC));
  const m = f.months, cur = m[0] || {};
  after(() => {
    $("#fcM").onchange = (e) => { FC.months = e.target.value; rerender(); };
    $("#fcO").onchange = (e) => { FC.owner_id = e.target.value; rerender(); };
    bindTable($("#fcOverdue"), f.overdue, { click: (r) => go(`deals/${r.id}`) });
  });
  const tgt = f.totals.target;
  return `${pageHead("Revenue forecast", "Based on open deals, their expected close dates and stage probabilities",
    `<select id="fcO" style="width:auto">${optList(S.lk.users.map((u) => [u.id, u.name]), FC.owner_id, "Whole team")}</select><select id="fcM" style="width:auto">${[3, 6, 12].map((n) => `<option value="${n}" ${+FC.months === n ? "selected" : ""}>Next ${n} months</option>`).join("")}</select>`)}
  <div class="kpis">
    <div class="kpi"><div class="l">This month — closed won</div><div class="v">${money(cur.closed_won || 0, 1)}</div><div class="d">${tgt ? `${pct((cur.closed_won || 0) / tgt)} of ${money(tgt, 1)} target` : "Set a monthly target in Settings"}</div></div>
    <div class="kpi"><div class="l">This month — projected</div><div class="v">${money((cur.closed_won || 0) + (cur.weighted || 0), 1)}</div><div class="d">won + weighted open</div></div>
    <div class="kpi"><div class="l">Commit (≥75% deals)</div><div class="v">${money(m.reduce((s, x) => s + x.commit, 0), 1)}</div><div class="d">next ${m.length} months</div></div>
    <div class="kpi"><div class="l">Weighted pipeline</div><div class="v">${money(f.totals.weighted, 1)}</div><div class="d">of ${money(f.totals.open, 1)} open</div></div>
    <div class="kpi"><div class="l">3-month run rate</div><div class="v">${money(f.run_rate, 1)}</div><div class="d">avg won per month</div></div>
  </div>
  ${tgt && cur.closed_won + cur.weighted < tgt ? `<div class="warn-box" style="margin-bottom:16px">This month is projected at ${money(cur.closed_won + cur.weighted)}, ${money(tgt - cur.closed_won - cur.weighted)} short of the ${money(tgt)} target. Focus on the Negotiation and Quote Sent deals below.</div>` : ""}
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Monthly forecast</h3><span class="small muted">Deals past their close date are counted in the current month</span></div><div class="card-b">
    ${barChart(m.map((x) => monthLabel(x.month)), [{ name: "Closed won", data: m.map((x) => x.closed_won), color: "var(--green)" }, { name: "Commit (≥75%)", data: m.map((x) => x.commit), color: "var(--c2)" }, { name: "Weighted", data: m.map((x) => x.weighted), color: "var(--c1)" }, { name: "Best case", data: m.map((x) => x.best_case), color: "var(--c8)" }], { h: 300, w: 1100, line: tgt || null, lineLabel: "Target" })}</div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Month</th><th class="num">Deals</th><th class="num">Closed won</th><th class="num">Commit</th><th class="num">Weighted</th><th class="num">Best case</th>${tgt ? `<th class="num">Projected vs target</th>` : ""}</tr></thead><tbody>
      ${m.map((x) => `<tr><td>${monthLabel(x.month)}</td><td class="num">${x.deals}</td><td class="num">${money(x.closed_won)}</td><td class="num">${money(x.commit)}</td><td class="num">${money(x.weighted)}</td><td class="num">${money(x.best_case)}</td>${tgt ? `<td class="num ${x.closed_won + x.weighted >= tgt ? "up" : "down"}">${pct((x.closed_won + x.weighted) / tgt)}</td>` : ""}</tr>`).join("")}
      <tr><td><b>Total</b></td><td class="num"><b>${m.reduce((s, x) => s + x.deals, 0)}</b></td><td class="num"><b>${money(m.reduce((s, x) => s + x.closed_won, 0))}</b></td><td class="num"><b>${money(m.reduce((s, x) => s + x.commit, 0))}</b></td><td class="num"><b>${money(m.reduce((s, x) => s + x.weighted, 0))}</b></td><td class="num"><b>${money(m.reduce((s, x) => s + x.best_case, 0))}</b></td>${tgt ? "<td></td>" : ""}</tr></tbody></table></div></div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>Won revenue — last 12 months</h3></div><div class="card-b">${lineChart(f.history.map((h) => monthLabel(h.month)), [{ name: "Won", data: f.history.map((h) => h.won) }])}</div></div>
    <div class="card"><div class="card-h"><h3>Weighted pipeline by product category</h3></div><div class="card-b">${donut(f.by_category.map((c) => ({ label: c.label, value: Math.round(c.value) })), { fmt: (v) => money(v, 1) })}</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>By stage</h3></div>${table([{ l: "Stage", f: (r) => badge(r.stage) }, { l: "Deals", num: 1, k: "count" }, { l: "Value", num: 1, f: (r) => money(r.value) }, { l: "Weighted", num: 1, f: (r) => money(r.weighted) }], f.by_stage)}</div>
    <div class="card"><div class="card-h"><h3>By salesperson</h3></div>${table([{ l: "Owner", f: (r) => `<div class="name-cell">${avatar(r.owner, "sm")}${esc(r.owner)}</div>` }, { l: "Open deals", num: 1, k: "deals" }, { l: "Open value", num: 1, f: (r) => money(r.open) }, { l: "Weighted", num: 1, f: (r) => money(r.weighted) }, { l: "Won this quarter", num: 1, f: (r) => money(r.won_qtd) }], f.by_owner, { empty: "No open deals" })}</div>
  </div>
  <div class="card" id="fcOverdue"><div class="card-h"><h3>Deals past their expected close date</h3><span class="badge ${f.overdue.length ? "b-red" : ""}">${f.overdue.length}</span></div>${table([{ l: "Deal", f: (d) => `<b>${esc(d.title)}</b>` }, { l: "Company", k: "company_name" }, { l: "Stage", f: (d) => badge(d.stage) }, { l: "Value", num: 1, f: (d) => money(d.value) }, { l: "Was due", f: (d) => `<span class="down">${fmtDate(d.expected_close)}</span>` }, { l: "Owner", k: "owner_name" }], f.overdue, { click: 1, empty: "Every open deal has a future close date 👍" })}</div>`;
};

// ---------------------------------------------------------------- products
const PR = { q: "", category: "", active: "" };
ROUTES.products = async () => {
  const data = await GET("/api/products" + qs({ ...PR, limit: 1000 }));
  after(() => {
    $("#prq").oninput = debounce((e) => { PR.q = e.target.value; rerender(); }, 300);
    $$("[data-flt]").forEach((s) => (s.onchange = () => { PR[s.dataset.flt] = s.value; rerender(); }));
    $("#prNew") && ($("#prNew").onclick = () => editRecord("product").then((r) => r && rerender()));
    bindTable($("#page"), data.rows, { click: (r) => can(2) && editRecord("product", r).then((x) => x && rerender()) });
    $$("[data-delp]").forEach((b) => (b.onclick = safe(async () => { const r = data.rows.find((x) => x.id === +b.dataset.delp); if (await deleteRecord("product", r, r.name)) rerender(); })));
    $("#prExport").onclick = () => downloadCSV(`products-${today()}.csv`, [{ l: "SKU", k: "sku" }, { l: "Name", k: "name" }, { l: "Category", k: "category" }, { l: "Unit", k: "unit" }, { l: "Price", k: "price" }, { l: "Cost", k: "cost" }, { l: "MOQ", k: "moq" }, { l: "Stock", k: "stock" }, { l: "Width", k: "width" }, { l: "Weight", k: "gsm" }, { l: "Lead time", k: "lead_time_days" }, { l: "Active", k: "active" }], data.rows);
  });
  return `${pageHead("Product catalog", "Jute, burlap and cotton items used in deals and quotes" + (can(2) ? " — click a row to edit" : ""), `<button class="btn" id="prExport">${icon("download")} Export</button>${can(2) ? `<button class="btn primary" id="prNew">${icon("plus")} New product</button>` : ""}`)}
  ${data.rows.some((p) => !p.price) && can(2) ? `<div class="info-box" style="margin-bottom:12px">Some starter products have no price yet. Click them to set your wholesale prices — deals and quotes fill prices in automatically.</div>` : ""}
  <div class="toolbar"><input type="search" id="prq" placeholder="Search products…" value="${esc(PR.q)}"><select data-flt="category">${optList(O.pcat, PR.category, "All categories")}</select><select data-flt="active"><option value="">Active & inactive</option><option value="1" ${PR.active === "1" ? "selected" : ""}>Active only</option><option value="0" ${PR.active === "0" ? "selected" : ""}>Inactive only</option></select></div>
  <div class="card">${table([
    { l: "SKU", f: (p) => `<span class="mono">${esc(p.sku || "")}</span>` }, { l: "Product", f: (p) => `<b>${esc(p.name)}</b>${p.description ? `<div class="small muted">${esc(p.description.slice(0, 80))}</div>` : ""}` },
    { l: "Category", f: (p) => badge(p.category) }, { l: "Spec", f: (p) => `<span class="small">${esc([p.width, p.gsm].filter(Boolean).join(" · "))}</span>` }, { l: "Unit", k: "unit" },
    { l: "Price", num: 1, f: (p) => (p.price ? money(p.price) : '<span class="faint">set price</span>') }, { l: "Margin", num: 1, f: (p) => (p.price && p.cost ? pct((p.price - p.cost) / p.price) : "") },
    { l: "MOQ", num: 1, f: (p) => (p.moq ? num(p.moq) : "") }, { l: "Stock", num: 1, f: (p) => (p.stock != null ? num(p.stock) : "") }, { l: "", f: (p) => (p.active ? "" : badge("Inactive")) + (can(2) ? `<button class="icon-btn" data-delp="${p.id}">${icon("trash")}</button>` : "") },
  ], data.rows, { click: can(2), empty: "No products" })}</div>`;
};
