// Gmail / tracking end-to-end test. Needs: `node test/mock-google.mjs` and `npx wrangler dev` with .dev.vars
// pointing at the mock (see mock-google.mjs), on a fresh .wrangler/state.
const BASE = process.env.BASE || "http://127.0.0.1:8787", MOCK = "http://127.0.0.1:9900";
let failures = 0;
const jar = {};
async function call(who, method, path, body, expect = 200) {
  const r = await fetch(BASE + path, { method, redirect: "manual", headers: { ...(body ? { "content-type": "application/json" } : {}), cookie: jar[who] || "", origin: BASE }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (r.status !== expect) { failures++; console.error(`✗ [${who}] ${method} ${path} → ${r.status} (want ${expect})`, d); } else console.log(`✓ [${who}] ${method} ${path} → ${r.status}`);
  return { d, r };
}
const check = (c, m) => { if (c) console.log("✓ " + m); else { failures++; console.error("✗ " + m); } };
const mock = (p, b) => fetch(MOCK + p, b ? { method: "POST", body: JSON.stringify(b) } : undefined).then((r) => r.json());
async function connect(who, code) {
  const { d } = await call(who, "POST", "/api/mailboxes/connect", {});
  const state = new URL(d.url).searchParams.get("state");
  const { r } = await call(who, "GET", `/api/gmail/callback?code=${code}&state=${state}`, null, 302);
  return r.headers.get("location");
}

await call("alice", "POST", "/api/auth/setup", { name: "Alice Owner", email: "alice@shop.test", password: "supersecret123" });
await call("alice", "POST", "/api/mailboxes/connect", {}, 400); // not configured yet
await call("alice", "PUT", "/api/settings", { google_client_id: "cid.apps.googleusercontent.com", google_client_secret: "sec", brand_color: "#225588", company_website: "example.com" });
const st = (await call("alice", "GET", "/api/settings")).d;
check(st.google_ready && !("google_client_secret" in st) && st.redirect_uri.endsWith("/api/gmail/callback"), "google settings saved, secret hidden");
const loc = await connect("alice", "alice");
check(loc.includes("#/inbox?connected=alice%40gmail.test"), "alice Gmail connected → " + loc);
await call("alice", "POST", "/api/users", { name: "Bea Sales", email: "bea@shop.test", role: "sales", password: "bea-password-1", must_change_password: false });
await call("bea", "POST", "/api/auth/login", { email: "bea@shop.test", password: "bea-password-1" });
check((await connect("bea", "bea")).includes("connected=bea%40gmail.test"), "bea Gmail connected");
check((await connect("bea", "alice")).includes("gmail_error"), "same Gmail can't be connected by two users");
const { r: bad } = await call("bea", "GET", "/api/gmail/callback?code=x&state=forged", null, 302);
check(bad.headers.get("location").includes("gmail_error"), "forged OAuth state rejected");

const boxesA = (await call("alice", "GET", "/api/mailboxes")).d.rows, boxesB = (await call("bea", "GET", "/api/mailboxes")).d.rows;
const A = boxesA.find((x) => x.email === "alice@gmail.test"), B = boxesB.find((x) => x.email === "bea@gmail.test");
check(A && B && boxesA.length === 1 && boxesB.length === 1, "each user only sees their own account");
const lk = (await call("alice", "GET", "/api/lookups")).d;
check(lk.mailboxes.length === 1 && lk.mailboxes[0].email === "alice@gmail.test", "lookups lists my sending accounts");

const c = (await call("alice", "POST", "/api/contacts", { first_name: "Priya", email: "priya@cust.test" })).d;
// one-to-one send from Gmail, branded layout, with a link
const sent = (await call("alice", "POST", "/api/emails/send", { contact_id: c.id, mailbox_id: A.id, layout: "branded", subject: "Price list for {{company}}", body_html: '<p>Hi {{first_name}}, see <a href="https://example.com/prices">prices</a></p>{{signature}}' })).d;
check(sent.from === "alice@gmail.test", "sent from chosen Gmail account");
const aliceSent = (await mock("/_box?email=alice@gmail.test")).find((m) => m.labelIds.includes("SENT"));
const html = aliceSent.parsed.html;
check(html.includes("#225588") && html.includes("Hi Priya") && /\/t\/l\/[a-f0-9]+\?u=https%3A%2F%2Fexample\.com%2Fprices/.test(html), "MIME has brand color, merge fields and tracked link");
check(aliceSent.parsed.headers.find((h) => h.name === "From").value.includes("alice@gmail.test"), "From header is the Gmail address");
await call("bea", "POST", "/api/emails/send", { to: "x@y.test", mailbox_id: A.id, subject: "hi", body_html: "x" }, 403);
// tracking: open + click
const openUrl = html.match(/src="([^"]+\/t\/e\/[a-f0-9]+\.gif)"/)[1].replace(/^https?:\/\/[^/]+/, "");
const clickUrl = html.match(/href="([^"]+\/t\/l\/[^"]+)"/)[1].replace(/^https?:\/\/[^/]+/, "").replace(/&amp;/g, "&");
await call("anon", "GET", openUrl); await call("anon", "GET", openUrl);
const { r: cr } = await call("anon", "GET", clickUrl, null, 302);
check(cr.headers.get("location") === "https://example.com/prices", "click redirects to target");
await call("anon", "GET", clickUrl.replace(/u=[^&]+/, "u=" + encodeURIComponent("https://evil.test/")), null, 404);
let ed = (await call("alice", "GET", `/api/emails/${sent.id}`)).d;
check(ed.open_count === 2 && ed.click_count === 1 && ed.events.length === 3, "opens & clicks recorded");
// reply in same thread + an unrelated personal email + a bounce
await mock("/_inject", { from: "Priya <priya@cust.test>", to: "alice@gmail.test", subject: "Re: Price list", text: "Thanks! Please send 200 yards.", threadId: aliceSent.threadId });
await mock("/_inject", { from: "Dentist <appt@dentist.test>", to: "alice@gmail.test", subject: "Your appointment", text: "See you Tuesday" });
const sent2 = (await call("alice", "POST", "/api/emails/send", { to: "nobody@cust.test", mailbox_id: A.id, subject: "Hello", body_html: "<p>x</p>" })).d;
await mock("/_inject", { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", to: "alice@gmail.test", subject: "Delivery Status Notification (Failure)", text: "Address not found: nobody@cust.test", headers: [{ name: "X-Failed-Recipients", value: "nobody@cust.test" }] });
const sync = (await call("alice", "POST", `/api/mailboxes/${A.id}/sync`, {})).d;
check(sync.fetched === 3, `sync fetched 3 new messages (got ${sync.fetched})`);
const sync2 = (await call("alice", "POST", `/api/mailboxes/${A.id}/sync`, {})).d;
check(sync2.fetched === 0, "second sync fetches nothing new");
ed = (await call("alice", "GET", `/api/emails/${sent.id}`)).d;
check(ed.replied_at && ed.thread.length === 2, "reply detected and threaded");
check((await call("alice", "GET", `/api/emails/${sent2.id}`)).d.bounced_at, "bounce detected");
const inboxA = (await call("alice", "GET", `/api/emails?mailbox_id=${A.id}&direction=in`)).d.rows;
check(inboxA.some((e) => e.subject === "Your appointment") && inboxA.some((e) => e.subject === "Re: Price list" && e.contact_id === c.id && e.is_read === 0), "alice's inbox shows her mail, reply linked to contact, unread");
const inboxAasB = (await call("bea", "GET", `/api/emails?mailbox_id=${A.id}`)).d.rows;
check(!inboxAasB.some((e) => e.subject === "Your appointment"), "bea can't see alice's personal email");
const dentist = inboxA.find((e) => e.subject === "Your appointment");
await call("bea", "GET", `/api/emails/${dentist.id}`, null, 404);
const tl = (await call("bea", "GET", `/api/timeline?contact_id=${c.id}`)).d.items;
check(tl.some((i) => i.direction === "Inbound" && i.subject === "Re: Price list"), "customer reply on contact timeline (team-visible)");
await call("alice", "GET", `/api/emails/${inboxA.find((e) => e.subject === "Re: Price list").id}`);
check((await call("alice", "GET", "/api/mailboxes")).d.rows[0].unread === 2, "reading marks as read (2 unread left: appointment + bounce notice)");
// sharing
await call("bea", "PATCH", `/api/mailboxes/${A.id}`, { shared: true }, 403);
await call("alice", "PATCH", `/api/mailboxes/${A.id}`, { shared: true, signature: "<p>Alice — ICS</p>" });
check((await call("bea", "GET", "/api/mailboxes")).d.rows.length === 2, "shared account visible to bea");
await call("bea", "POST", "/api/emails/send", { to: "z@cust.test", mailbox_id: A.id, subject: "From shared", body_html: "{{signature}}" });
// campaign through Gmail
const c2 = (await call("alice", "POST", "/api/contacts", { first_name: "Raj", email: "raj@cust.test" })).d;
const cm = (await call("alice", "POST", "/api/campaigns", { name: "Gmail blast", subject: "Hi {{first_name}}", body_html: '<p>Hi {{first_name}} <a href="https://example.com/sale">sale</a></p>', layout: "design", mailbox_id: String(A.id), segment: { contact_ids: [c.id, c2.id] } })).d;
const pv = (await call("alice", "POST", "/api/emails/preview", { layout: "design", body_html: cm.body_html, subject: cm.subject, campaign: true })).d;
check(pv.html.includes("Unsubscribe") && pv.html.includes("Hi Priya") || pv.html.includes("Hi Raj"), "campaign preview renders with footer");
await call("alice", "POST", `/api/campaigns/${cm.id}/test`, { to: "alice@shop.test" });
const sr = (await call("alice", "POST", `/api/campaigns/${cm.id}/send`, {})).d;
check(sr.sent === 2 && sr.remaining === 0, "campaign sent via Gmail");
const rec = (await call("alice", "GET", `/api/campaigns/${cm.id}/recipients`)).d.rows;
check(rec.every((r) => r.thread_id && r.mailbox_id === A.id), "recipients have Gmail thread ids");
await mock("/_inject", { from: "Raj <raj@cust.test>", to: "alice@gmail.test", subject: "Re: Hi Raj", text: "Interested", threadId: rec.find((r) => r.email === "raj@cust.test").thread_id });
const s3 = (await call("alice", "POST", `/api/mailboxes/${A.id}/sync`, {})).d;
check(s3.fetched === 2, `campaign copies in Sent not re-imported; only test + reply fetched (got ${s3.fetched})`);
const camp = (await call("alice", "GET", `/api/campaigns/${cm.id}`)).d;
check(camp.replied === 1 && camp.sent === 2, "campaign reply counted");
const act = (await call("alice", "GET", "/api/email-activity?days=30")).d;
check(act.summary.opened >= 1 && act.summary.clicked === 1 && act.summary.replied === 1 && act.summary.bounced === 1 && act.campaigns.replied === 1 && act.events.length >= 5 && act.engaged[0].name.startsWith("Priya"), "tracking report");
const dash = (await call("alice", "GET", "/api/dashboard")).d;
check(dash.engagement.length >= 3, "dashboard engagement feed");
// images
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64").toString("base64");
const up = (await call("alice", "POST", "/api/files", { name: "logo.png", mime: "image/png", data: png })).d;
const img = await fetch(BASE + new URL(up.url).pathname);
check(img.status === 200 && img.headers.get("content-type") === "image/png" && (await img.arrayBuffer()).byteLength === 70, "image upload served");
await call("alice", "POST", "/api/files", { name: "x.svg", mime: "image/svg+xml", data: "PHN2Zz4=" }, 400);
// designs seeded
check(lk.templates.filter((t) => t.layout === "design").length === 5, "5 designed templates seeded");
// timeline tracking fields
const ints = (await call("alice", "GET", `/api/interactions?contact_id=${c.id}&type=Email`)).d.rows;
check(ints.some((i) => i.em_opens === 2 && i.em_clicked && i.em_replied), "timeline email shows tracking");
// cron sync & disconnect
await call("bea", "DELETE", `/api/mailboxes/${A.id}`, null, 403);
await call("alice", "DELETE", `/api/mailboxes/${B.id}`); // admin can disconnect anyone
check((await call("bea", "GET", "/api/mailboxes")).d.rows.every((x) => x.email !== "bea@gmail.test"), "admin disconnected bea's account");
console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll Gmail checks passed");
process.exit(failures ? 1 : 0);
