// End-to-end API smoke test. Run against a fresh local dev server: `npx wrangler dev` then `npm test`.
const BASE = process.env.BASE || "http://127.0.0.1:8787";
let cookie = "";
let failures = 0;
async function call(method, path, body, { expect = 200, as } = {}) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), cookie: as ?? cookie, origin: BASE }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const sc = r.headers.get("set-cookie"); if (sc && as === undefined) cookie = sc.split(";")[0];
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  if (r.status !== expect) { failures++; console.error(`✗ ${method} ${path} → ${r.status} (expected ${expect})`, data); }
  else console.log(`✓ ${method} ${path} → ${r.status}`);
  return data;
}
const check = (cond, msg) => { if (!cond) { failures++; console.error("✗ " + msg); } else console.log("✓ " + msg); };

const state = await call("GET", "/api/auth/state");
if (state.needsSetup) await call("POST", "/api/auth/setup", { name: "Admin Test", email: "admin@example.com", password: "supersecret123", company_name: "Indian Craft Supply" });
else await call("POST", "/api/auth/login", { email: "admin@example.com", password: "supersecret123" });
await call("POST", "/api/auth/setup", { name: "X", email: "x@example.com", password: "supersecret123" }, { expect: 400 });
await call("GET", "/api/contacts", null, { expect: 401, as: "" });
await call("POST", "/api/auth/login", { email: "admin@example.com", password: "wrong-password" }, { expect: 401, as: "" });

const lk = await call("GET", "/api/lookups");
check(lk.products.length >= 10 && lk.templates.length >= 4, "seeded products & templates");

// users
const rep = await call("POST", "/api/users", { name: "Sales Rep", email: `rep${Date.now()}@example.com`, role: "sales", password: "temporary-pass-1" });
await call("POST", "/api/users", { name: "Bad", email: "bad@example.com", role: "sales", password: "short" }, { expect: 400 });
const viewerEmail = `viewer${Date.now()}@example.com`;
await call("POST", "/api/users", { name: "Viewer", email: viewerEmail, role: "viewer", password: "viewer-pass-123" });
const adminCookie = cookie;
await call("POST", "/api/auth/login", { email: viewerEmail, password: "viewer-pass-123" });
const viewerCookie = cookie; cookie = adminCookie;
await call("POST", "/api/contacts", { first_name: "Nope" }, { expect: 403, as: viewerCookie });
await call("GET", "/api/contacts", null, { as: viewerCookie });
await call("GET", "/api/users/1", null, { expect: 404 });

// companies / contacts
const co = await call("POST", "/api/companies", { name: "Rustic Events Co", type: "Prospect", industry: "Event & wedding decor", city: "Austin", tags: "wedding, texas" });
const c1 = await call("POST", "/api/contacts", { first_name: "Priya", last_name: "Shah", email: `priya${Date.now()}@example.com`, company_id: co.id, products_interest: "Burlap,Jute", rating: "Hot", lead_source: "Trade show" });
check(c1.company_name === "Rustic Events Co" && c1.unsub_token === undefined || c1.company_name === "Rustic Events Co", "contact joined with company");
const c2 = await call("POST", "/api/contacts", { first_name: "Raj", last_name: "Patel", company_id: co.id, title: "Owner" });
await call("POST", "/api/contacts", { first_name: "Dup", email: c1.email }, { expect: 409 });
await call("POST", "/api/contacts", { last_name: "NoFirst" }, { expect: 400 });
await call("PATCH", `/api/contacts/${c2.id}`, { first_name: "" }, { expect: 400 });
const list = await call("GET", "/api/contacts?q=priya&product=Burlap");
check(list.total === 1, "contact search + product filter");
await call("GET", "/api/contacts?tag=wedding");
await call("POST", "/api/relationships", { from_type: "contact", from_id: c1.id, to_type: "contact", to_id: c2.id, kind: "Reports to" });
const g = await call("GET", "/api/graph");
check(g.edges.some((e) => e.kind === "Reports to"), "relationship graph");
const rl = await call("GET", `/api/relationships?entity_type=contact&entity_id=${c1.id}`);
check(rl.rows[0]?.to_name?.startsWith("Raj"), "relationship names decorated");

// deals
const prod = lk.products[0];
const deal = await call("POST", "/api/deals", { title: "Spring burlap order", contact_id: c1.id, stage: "Quote Sent", expected_close: new Date().toISOString().slice(0, 10), product_lines: [{ product_id: prod.id, name: prod.name, qty: 500, price: 2.5 }], auto_value: true });
check(deal.value === 1250 && deal.probability === 60 && deal.company_id === co.id, "deal auto value/probability/company");
await call("PATCH", `/api/deals/${deal.id}`, { stage: "Won" });
const won = await call("GET", `/api/deals/${deal.id}`);
check(won.probability === 100 && won.closed_at, "won deal closed");
const cAfter = await call("GET", `/api/contacts/${c1.id}`);
check(cAfter.type === "Customer", "won deal converts contact to customer");
await call("POST", "/api/deals", { title: "Cotton canvas", company_id: co.id, value: 4000, stage: "Negotiation", expected_close: "2026-12-15" });
await call("POST", "/api/deals", { title: "Bad", stage: "Nope" }, { expect: 400 });

// interactions / tasks / timeline
await call("POST", "/api/interactions", { type: "Call", contact_id: c2.id, subject: "Intro call", body: "Interested in 40in burlap", outcome: "Interested" });
const t = await call("POST", "/api/tasks", { title: "Send samples", contact_id: c2.id, due_at: "2020-01-01" });
const od = await call("GET", "/api/tasks?view=overdue&mine=1");
check(od.rows.some((x) => x.id === t.id), "overdue task view");
await call("PATCH", `/api/tasks/${t.id}`, { status: "Done" });
const tl = await call("GET", `/api/timeline?contact_id=${c1.id}`);
check(tl.items.some((i) => i.type === "Stage change"), "stage change in timeline");

// tickets
const tk = await call("POST", "/api/tickets", { subject: "Roll arrived torn", contact_id: c1.id, priority: "High", category: "Quality / defect", description: "Two rolls damaged" });
check(tk.due_at && tk.company_id === co.id, "ticket SLA + company");
await call("POST", `/api/tickets/${tk.id}/comments`, { body: "Replacement shipping today", internal: true, status: "Resolved" });
const tk2 = await call("GET", `/api/tickets/${tk.id}`);
check(tk2.status === "Resolved" && tk2.resolved_at && tk2.comment_count === 2, "ticket comment + resolve");

// email without configuration
await call("POST", "/api/emails/send", { contact_id: c1.id, subject: "Hi", body_html: "<p>x</p>" }, { expect: 400 });
// inbound email handler is exercised via the DO RPC in production; check campaigns
const seg = await call("POST", "/api/campaigns/segment-preview", { segment: { products: ["Burlap"] } });
check(seg.count >= 1, "segment preview");
const cm = await call("POST", "/api/campaigns", { name: "Test", subject: "Hello {{first_name}}", body_html: "<p>Hi</p>", segment: { types: ["Customer"] } });
await call("POST", `/api/campaigns/${cm.id}/send`, {}, { expect: 400 });

// imports / bulk
const imp = await call("POST", "/api/contacts/import", { rows: [{ name: "Asha Rao", email: `asha${Date.now()}@example.com`, company: "Gift Mart" }, { first_name: "Ben", company: "gift mart" }, { email: c1.email }], default_tags: "import-test" });
check(imp.created === 2 && imp.skipped === 1 && imp.companiesCreated === 1, "CSV import dedupe & companies");
await call("POST", "/api/contacts/bulk", { ids: [c2.id], action: "rating", value: "Cold" });

// reports
const d = await call("GET", "/api/dashboard");
check(d.kpis.won_this_month === 1250, "dashboard won this month");
const f = await call("GET", "/api/forecast?months=6");
check(f.months.length === 6 && f.totals.open === 4000, "forecast");
const a = await call("GET", "/api/analytics?days=90");
check(a.summary.win_rate === 1 && a.funnel.length === 6, "analytics");
await call("GET", "/api/search?q=pri");
await call("PUT", "/api/settings", { monthly_target: 10000, resend_api_key: "" });
const s = await call("GET", "/api/settings");
check(s.monthly_target === "10000" && !("resend_api_key" in s), "settings saved, secret hidden");
await call("PUT", "/api/settings", { monthly_target: 1 }, { as: viewerCookie, expect: 403 });

// unsubscribe page & CSRF
await call("GET", "/u/deadbeef");
const r = await fetch(BASE + "/api/contacts", { method: "POST", headers: { cookie, "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
check(r.status === 403, "cross-origin write blocked");
await call("DELETE", `/api/contacts/${c2.id}`, null, { as: viewerCookie, expect: 403 });
await call("DELETE", `/api/companies/${co.id}`);
await call("POST", "/api/auth/logout", {});
await call("GET", "/api/me", null, { expect: 401 });

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
