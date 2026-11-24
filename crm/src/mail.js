// Email for the CRM: Gmail accounts per user (OAuth), Resend fallback, email layouts,
// open/click/reply/bounce tracking, inbox sync, hosted images and inbound routing.
const SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
const utf8b64 = (str) => { const by = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode(...by.subarray(i, i + 0x8000)); return btoa(bin); };
const b64url = (s) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => { const bin = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
const wrap76 = (s) => s.replace(/.{1,76}/g, "$&\r\n");
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`);
const addrList = (s) => (String(s || "").match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((x) => x.toLowerCase());
const hdr = (H, n) => (H || []).find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
const unesc = (s) => String(s).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const OPEN_GRACE_MS = 10000; // ignore pixel loads in the first seconds after sending (sender's own client / scanners); OPEN_GRACE_MS env overrides

function extractBody(p, out = { html: "", text: "", files: [] }) {
  if (!p) return out;
  if (p.filename) { out.files.push(p.filename); return out; }
  const data = p.body?.data ? fromB64url(p.body.data) : "";
  if (p.mimeType === "text/html" && data && !out.html) out.html = data;
  else if (p.mimeType === "text/plain" && data && !out.text) out.text = data;
  for (const c of p.parts || []) extractBody(c, out);
  return out;
}

// ---------------------------------------------------------------- designed templates (seeded once)
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:{{brand_color}};color:#ffffff;padding:13px 28px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">${label}</a>`;
const shell = (inner) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#2b2620;border:1px solid #e8e1d6">${inner}</table>`;
const head = `<tr><td style="padding:20px 28px;border-bottom:1px solid #efe8dc">{{logo}}</td></tr>`;
const card = (title, sub) => `<div style="display:inline-block;width:100%;max-width:262px;vertical-align:top;margin:0 6px 14px"><div style="background:#f6f0e6;border-radius:10px;padding:0 0 14px;text-align:left;overflow:hidden"><div style="height:130px;background:{{brand_color}};opacity:.85;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 3px,transparent 3px 9px)"></div><div style="padding:12px 14px 0;font-size:16px;font-weight:bold;color:#2b2620">${title}</div><div style="padding:4px 14px 0;font-size:13px;color:#6f665a;line-height:1.5">${sub}</div></div></div>`;
export const DESIGNS = [
  ["Design · New arrivals showcase", "Fresh stock just landed at {{my_company}}", shell(`${head}
<tr><td style="background:{{brand_color}};padding:44px 32px;text-align:center;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 2px,transparent 2px 8px),repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 2px,transparent 2px 8px)">
<div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#f3e6cf">New this season</div>
<h1 style="margin:10px 0 12px;font-size:32px;line-height:1.15;color:#ffffff">Natural burlap, jute &amp; cotton — restocked</h1>
<p style="margin:0 0 22px;font-size:16px;color:#f8efe0">Wholesale rolls, bags, twine and ribbon, ready to ship.</p>
<a href="{{website_url}}" style="display:inline-block;background:#ffffff;color:{{brand_color}};padding:13px 28px;border-radius:6px;font-size:15px;font-weight:bold;text-decoration:none">See the collection</a></td></tr>
<tr><td style="padding:28px 28px 6px;font-size:15px;line-height:1.6"><p style="margin:0 0 12px">Hi {{first_name}},</p><p style="margin:0">We've just restocked our most popular natural fabrics. Here are a few highlights for {{company}}:</p></td></tr>
<tr><td style="padding:14px 22px 4px;text-align:center">${card("Burlap rolls", "40&quot; and 60&quot; widths, 10 oz natural weave. Rolls of 50 and 100 yards.")}${card("Jute twine &amp; ribbon", "3-ply twine spools and 2.5&quot; burlap ribbon in natural and colors.")}${card("Cotton canvas &amp; muslin", "Unbleached muslin and 10 oz duck canvas by the yard or bolt.")}${card("Juco &amp; jute bags", "Tote, drawstring and gunny bags. Custom printing available.")}</td></tr>
<tr><td style="padding:8px 28px 30px;text-align:center">${btn("{{website_url}}", "Request today's price list")}</td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;line-height:1.6;border-top:1px solid #efe8dc"><p style="margin:20px 0 0">{{signature}}</p></td></tr>`)],
  ["Design · Wholesale price list", "{{my_company}} wholesale price list", shell(`${head}
<tr><td style="padding:30px 28px 10px"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:{{brand_color}};font-weight:bold">Wholesale pricing</div><h1 style="margin:8px 0 12px;font-size:26px;line-height:1.2">Our current price list</h1>
<p style="margin:0;font-size:15px;line-height:1.6">Hi {{first_name}}, here are our current wholesale prices. Volume discounts apply on larger orders — just ask.</p></td></tr>
<tr><td style="padding:16px 28px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="background:{{brand_color}};color:#ffffff"><th align="left" style="padding:10px 12px">Item</th><th align="left" style="padding:10px 12px">Spec</th><th align="right" style="padding:10px 12px">Price</th></tr>
<tr><td style="padding:10px 12px;border-bottom:1px solid #eee5d8">Natural burlap cloth</td><td style="padding:10px 12px;border-bottom:1px solid #eee5d8;color:#6f665a">40&quot; · 10 oz</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #eee5d8"><b>$0.00 / yd</b></td></tr>
<tr style="background:#faf7f2"><td style="padding:10px 12px;border-bottom:1px solid #eee5d8">Burlap roll</td><td style="padding:10px 12px;border-bottom:1px solid #eee5d8;color:#6f665a">40&quot; × 100 yd</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #eee5d8"><b>$0.00 / roll</b></td></tr>
<tr><td style="padding:10px 12px;border-bottom:1px solid #eee5d8">Jute twine, 3-ply</td><td style="padding:10px 12px;border-bottom:1px solid #eee5d8;color:#6f665a">Spool</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #eee5d8"><b>$0.00 / spool</b></td></tr>
<tr style="background:#faf7f2"><td style="padding:10px 12px;border-bottom:1px solid #eee5d8">Cotton canvas duck</td><td style="padding:10px 12px;border-bottom:1px solid #eee5d8;color:#6f665a">60&quot; · 10 oz</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #eee5d8"><b>$0.00 / yd</b></td></tr>
<tr><td style="padding:10px 12px">Juco tote bags</td><td style="padding:10px 12px;color:#6f665a">Natural</td><td align="right" style="padding:10px 12px"><b>$0.00 / pc</b></td></tr></table></td></tr>
<tr><td style="padding:6px 28px 8px"><div style="background:#f6f0e6;border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.6;color:#5a5146">✔ Free samples on request &nbsp; ✔ Volume discounts &nbsp; ✔ Fast dispatch</div></td></tr>
<tr><td style="padding:22px 28px 30px;text-align:center">${btn("mailto:{{my_email}}?subject=Quote%20request", "Request a quote")}</td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;line-height:1.6;border-top:1px solid #efe8dc"><p style="margin:20px 0 0">{{signature}}</p></td></tr>`)],
  ["Design · Seasonal promotion", "{{first_name}}, 10% off your next wholesale order", shell(`${head}
<tr><td style="padding:40px 28px 10px;text-align:center"><div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8a8073">Limited-time offer</div>
<div style="font-size:64px;font-weight:bold;line-height:1;margin:14px 0 6px;color:{{brand_color}}">10% OFF</div><div style="font-size:18px;color:#2b2620">your next order of burlap, jute or cotton</div></td></tr>
<tr><td style="padding:22px 28px;text-align:center"><div style="display:inline-block;border:2px dashed {{brand_color}};border-radius:10px;padding:14px 28px"><div style="font-size:12px;color:#8a8073;text-transform:uppercase;letter-spacing:2px">Use code</div><div style="font-size:26px;font-weight:bold;letter-spacing:4px;color:#2b2620">SEASON10</div></div>
<p style="font-size:13px;color:#8a8073;margin:12px 0 0">Valid until the end of the month on orders above our minimum quantity.</p></td></tr>
<tr><td style="padding:10px 28px 30px;font-size:15px;line-height:1.6;text-align:center"><p style="margin:0 0 22px">Hi {{first_name}} — stock up for the busy season and save. Reply to this email with your quantities and we'll confirm pricing the same day.</p>${btn("{{website_url}}", "Order now")}</td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;line-height:1.6;border-top:1px solid #efe8dc"><p style="margin:20px 0 0">{{signature}}</p></td></tr>`)],
  ["Design · Free sample kit", "Free natural-fabric sample kit for {{company}}", shell(`${head}
<tr><td style="padding:34px 28px 8px"><h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">Feel the quality before you order</h1><p style="margin:0;font-size:15px;line-height:1.6">Hi {{first_name}}, we'd love to send {{company}} a <b>free sample kit</b> so you can compare weights, weaves and finishes in person.</p></td></tr>
<tr><td style="padding:16px 28px"><table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5">
<tr><td width="34" valign="top" style="padding:7px 0;color:{{brand_color}};font-size:18px">✔</td><td style="padding:7px 0"><b>Burlap swatches</b> — 3 weights, natural and colored</td></tr>
<tr><td valign="top" style="padding:7px 0;color:{{brand_color}};font-size:18px">✔</td><td style="padding:7px 0"><b>Jute twine &amp; ribbon</b> — 3-ply twine, 1.5&quot; and 2.5&quot; ribbon</td></tr>
<tr><td valign="top" style="padding:7px 0;color:{{brand_color}};font-size:18px">✔</td><td style="padding:7px 0"><b>Cotton canvas &amp; muslin</b> — unbleached and natural</td></tr>
<tr><td valign="top" style="padding:7px 0;color:{{brand_color}};font-size:18px">✔</td><td style="padding:7px 0"><b>Price sheet</b> with volume tiers</td></tr></table></td></tr>
<tr><td style="padding:16px 28px 30px;text-align:center">${btn("mailto:{{my_email}}?subject=Sample%20kit%20request", "Send me a sample kit")}<p style="font-size:12px;color:#8a8073;margin:12px 0 0">Just reply with your shipping address — no obligation.</p></td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;line-height:1.6;border-top:1px solid #efe8dc"><p style="margin:20px 0 0">{{signature}}</p></td></tr>`)],
  ["Design · Monthly newsletter", "News from {{my_company}}", shell(`${head}
<tr><td style="padding:30px 28px 6px"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:{{brand_color}};font-weight:bold">Monthly update</div><h1 style="margin:8px 0 12px;font-size:26px;line-height:1.2">What's new this month</h1>
<p style="margin:0;font-size:15px;line-height:1.6">Hi {{first_name}}, here's a quick roundup of new products, tips and stories from our workshop.</p></td></tr>
<tr><td style="padding:20px 28px"><div style="border-left:4px solid {{brand_color}};background:#faf7f2;border-radius:0 8px 8px 0;padding:16px 18px"><div style="font-size:17px;font-weight:bold;margin-bottom:6px">Featured: our new colored burlap range</div><div style="font-size:14px;line-height:1.6;color:#5a5146">Twelve earthy shades, same sturdy 10 oz weave. Perfect for events, gift wrapping and retail displays.</div></div></td></tr>
<tr><td style="padding:4px 22px 10px">
<div style="display:inline-block;width:100%;max-width:266px;vertical-align:top;margin:0 6px 12px"><div style="font-size:15px;font-weight:bold;margin-bottom:6px">🧵 Tip: storing jute</div><div style="font-size:14px;line-height:1.6;color:#5a5146">Keep rolls dry and off the floor; natural fibers breathe best in a cool, ventilated space.</div></div>
<div style="display:inline-block;width:100%;max-width:266px;vertical-align:top;margin:0 6px 12px"><div style="font-size:15px;font-weight:bold;margin-bottom:6px">⭐ Customer spotlight</div><div style="font-size:14px;line-height:1.6;color:#5a5146">A wedding decorator used 600 yards of our burlap for a rustic barn venue this month.</div></div></td></tr>
<tr><td style="padding:6px 28px 30px;text-align:center">${btn("{{website_url}}", "Visit our store")}</td></tr>
<tr><td style="padding:0 28px 26px;font-size:15px;line-height:1.6;border-top:1px solid #efe8dc"><p style="margin:20px 0 0">{{signature}}</p></td></tr>`)],
];

export function installMail(Cls, H) {
  const { nowIso, rid, escHtml, stripHtml, validEmail, json, fail } = H;

  const methods = {
    // ---------------------------------------------------------- schema
    mailMigrate() {
      for (const s of [
        `CREATE TABLE IF NOT EXISTS mailboxes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT, provider TEXT DEFAULT 'gmail',
          refresh_token TEXT, access_token TEXT, access_expires INTEGER, shared INTEGER DEFAULT 0, sync_enabled INTEGER DEFAULT 1, signature TEXT,
          last_sync TEXT, last_sync_epoch INTEGER, status TEXT DEFAULT 'Connected', error TEXT, created_at TEXT)`,
        `CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, user_id INTEGER, origin TEXT, created_at INTEGER)`,
        `CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, name TEXT, mime TEXT, size INTEGER, data BLOB, user_id INTEGER, created_at TEXT)`,
        `CREATE TABLE IF NOT EXISTS email_events (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER, recipient_id INTEGER, type TEXT, url TEXT, ua TEXT, at TEXT)`,
        `CREATE INDEX IF NOT EXISTS idx_ev_at ON email_events(at)`,
      ]) this.sql.exec(s);
      const add = (t, c, d) => { if (!this.all(`PRAGMA table_info(${t})`).some((x) => x.name === c)) this.sql.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
      for (const [c, d] of [["mailbox_id", "INTEGER"], ["gmail_id", "TEXT"], ["thread_id", "TEXT"], ["message_id_hdr", "TEXT"], ["cc_addr", "TEXT"], ["snippet", "TEXT"], ["is_read", "INTEGER DEFAULT 1"],
        ["clicked_at", "TEXT"], ["click_count", "INTEGER DEFAULT 0"], ["replied_at", "TEXT"], ["bounced_at", "TEXT"], ["layout", "TEXT"], ["attachments", "TEXT"]]) add("emails", c, d);
      add("campaigns", "mailbox_id", "TEXT"); add("campaigns", "layout", "TEXT DEFAULT 'branded'"); add("templates", "layout", "TEXT");
      for (const [c, d] of [["thread_id", "TEXT"], ["replied_at", "TEXT"], ["bounced_at", "TEXT"], ["mailbox_id", "INTEGER"]]) add("campaign_recipients", c, d);
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_em_gmail ON emails(mailbox_id, gmail_id)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_em_thread ON emails(thread_id)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_em_box ON emails(mailbox_id, created_at)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_cr_thread ON campaign_recipients(thread_id)");
      if (!this.one("SELECT value FROM settings WHERE key='_designs_v1'")) {
        const t = nowIso();
        for (const [name, subject, body] of DESIGNS) this.sql.exec("INSERT INTO templates (name,category,subject,body_html,layout,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", name, "Designs", subject, body, "design", t, t);
        this.sql.exec("UPDATE templates SET layout='plain' WHERE layout IS NULL");
        this.sql.exec("INSERT OR REPLACE INTO settings (key,value) VALUES ('_designs_v1','1')");
      }
    },

    // ---------------------------------------------------------- API
    async mailApi(M, P, Q, req, url, me, need) {
      let m;
      const origin = url.origin;
      if (P === "/api/mailboxes" && M === "GET") {
        const all = Q.all === "1" && this.rank(me) >= 3;
        return json({ rows: all ? this.all(`SELECT m.id,m.user_id,m.email,m.name,m.shared,m.status,m.error,m.last_sync,m.created_at,u.name AS owner_name FROM mailboxes m LEFT JOIN users u ON u.id=m.user_id ORDER BY u.name`) : this.mailboxesFor(me), google_ready: this.googleReady(), redirect_uri: origin + "/api/gmail/callback" });
      }
      if (P === "/api/mailboxes/connect" && M === "POST") { need(1); return json({ url: this.gmailConnectUrl(me, origin) }); }
      if ((m = P.match(/^\/api\/mailboxes\/(\d+)$/))) {
        const mb = this.one("SELECT * FROM mailboxes WHERE id=?", +m[1]) || fail(404, "Account not found");
        if (M === "PATCH") {
          if (mb.user_id !== me.id) fail(403, "Only the owner can change this account");
          const b = await this.body(req);
          this.sql.exec("UPDATE mailboxes SET name=COALESCE(?,name), shared=COALESCE(?,shared), sync_enabled=COALESCE(?,sync_enabled), signature=? WHERE id=?",
            b.name ?? null, b.shared == null ? null : b.shared ? 1 : 0, b.sync_enabled == null ? null : b.sync_enabled ? 1 : 0, b.signature !== undefined ? b.signature : mb.signature, mb.id);
          return json(this.mailboxesFor(me).find((x) => x.id === mb.id));
        }
        if (M === "DELETE") {
          if (mb.user_id !== me.id && this.rank(me) < 3) fail(403, "Only the owner or an admin can disconnect this account");
          if (mb.refresh_token) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(mb.refresh_token), { method: "POST" }); } catch {} }
          this.sql.exec("DELETE FROM emails WHERE mailbox_id=? AND contact_id IS NULL AND token IS NULL", mb.id);
          this.sql.exec("DELETE FROM mailboxes WHERE id=?", mb.id);
          this.audit(me, "disconnect", "mailboxes", mb.id, mb.email);
          return json({ ok: true });
        }
      }
      if ((m = P.match(/^\/api\/mailboxes\/(\d+)\/sync$/)) && M === "POST") {
        const mb = this.one("SELECT * FROM mailboxes WHERE id=?", +m[1]) || fail(404, "Account not found");
        if (!this.canUse(mb, me)) fail(403, "Not your account");
        return json(await this.syncMailbox(mb, 45));
      }
      if (P === "/api/emails/send" && M === "POST") { need(1); return json(await this.sendOne(await this.body(req), me, origin)); }
      if (P === "/api/emails/preview" && M === "POST") {
        const b = await this.body(req);
        const contact = b.contact_id ? this.one("SELECT * FROM contacts WHERE id=?", +b.contact_id) : this.one("SELECT * FROM contacts WHERE email IS NOT NULL ORDER BY id DESC LIMIT 1");
        const sender = this.trySender(me, b.mailbox_id);
        const inner = this.merge(b.body_html || "", contact, me, this.senderVars(sender, me, { unsubscribe_url: "#" }));
        const footer = b.campaign ? this.campaignFooter("#") : b.layout === "branded" ? this.brandFooter() : "";
        return json({ subject: unesc(this.merge(b.subject || "", contact, me)), html: this.renderEmail({ layout: b.layout, inner, preheader: b.preheader, footer }), sample: contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : null });
      }
      if ((m = P.match(/^\/api\/emails\/(\d+)$/)) && M === "GET") {
        const e = this.one(`SELECT e.*, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, mb.email AS mailbox_email, mb.user_id AS mailbox_owner, mb.shared AS mailbox_shared, u.name AS user_name
          FROM emails e LEFT JOIN contacts c ON c.id=e.contact_id LEFT JOIN mailboxes mb ON mb.id=e.mailbox_id LEFT JOIN users u ON u.id=e.user_id WHERE e.id=?`, +m[1]) || fail(404, "Not found");
        if (!this.canSeeEmail(e, me)) fail(404, "Not found");
        if (e.direction === "in" && !e.is_read && e.mailbox_owner === me.id) this.sql.exec("UPDATE emails SET is_read=1 WHERE id=?", e.id);
        const thread = e.thread_id ? this.all(`SELECT e.id,e.direction,e.from_addr,e.to_addr,e.cc_addr,e.subject,e.body_html,e.body_text,e.created_at,e.status,e.opened_at,e.open_count,e.clicked_at,e.click_count,e.replied_at,e.bounced_at,e.contact_id,e.mailbox_id,e.attachments,e.message_id_hdr,e.token,
          mb.user_id AS mailbox_owner, mb.shared AS mailbox_shared FROM emails e LEFT JOIN mailboxes mb ON mb.id=e.mailbox_id WHERE e.thread_id=? ORDER BY e.created_at`, e.thread_id).filter((x) => this.canSeeEmail(x, me)) : [e];
        const events = this.all("SELECT type, url, ua, at FROM email_events WHERE email_id IN (" + thread.map(() => "?").join(",") + ") ORDER BY id DESC LIMIT 100", ...thread.map((x) => x.id));
        return json({ ...e, thread, events });
      }
      if ((m = P.match(/^\/api\/emails\/(\d+)\/read$/)) && M === "POST") {
        const b = await this.body(req);
        this.sql.exec("UPDATE emails SET is_read=? WHERE id=? AND mailbox_id IN (SELECT id FROM mailboxes WHERE user_id=? OR shared=1)", b.is_read ? 1 : 0, +m[1], me.id);
        return json({ ok: true });
      }
      if (P === "/api/email-activity" && M === "GET") return json(this.emailActivity(Q, me));
      if (P === "/api/files" && M === "GET") return json({ rows: this.all("SELECT id, token, name, mime, size, created_at FROM files ORDER BY id DESC LIMIT 200").map((f) => ({ ...f, url: `${origin}/f/${f.token}` })) });
      if (P === "/api/files" && M === "POST") {
        need(1);
        const b = await this.body(req);
        if (!IMG_TYPES.includes(b.mime)) fail(400, "Only PNG, JPEG, GIF or WebP images can be uploaded");
        let bytes; try { bytes = Uint8Array.from(atob(String(b.data || "")), (c) => c.charCodeAt(0)); } catch { fail(400, "Bad image data"); }
        if (bytes.length > 1_500_000) fail(413, "Image is too large (max 1.5 MB)");
        const token = rid(12);
        const f = this.one("INSERT INTO files (token,name,mime,size,data,user_id,created_at) VALUES (?,?,?,?,?,?,?) RETURNING id", token, String(b.name || "image").slice(0, 120), b.mime, bytes.length, bytes.buffer, me.id, nowIso());
        return json({ id: f.id, url: `${origin}/f/${token}` });
      }
      if ((m = P.match(/^\/api\/files\/(\d+)$/)) && M === "DELETE") {
        const f = this.one("SELECT id, user_id FROM files WHERE id=?", +m[1]) || fail(404, "Not found");
        if (f.user_id !== me.id) need(2);
        this.sql.exec("DELETE FROM files WHERE id=?", f.id);
        return json({ ok: true });
      }
      if ((m = P.match(/^\/api\/campaigns\/(\d+)\/test$/)) && M === "POST") { need(1); return json(await this.campaignTest(+m[1], await this.body(req), me, origin)); }
      if ((m = P.match(/^\/api\/campaigns\/(\d+)\/send$/)) && M === "POST") { need(2); return json(await this.campaignSend(+m[1], me, origin)); }
      return null;
    },

    rank(me) { return { viewer: 0, support: 1, sales: 1, manager: 2, admin: 3 }[me.role] ?? 0; },
    canUse(mb, me) { return mb && (mb.user_id === me.id || !!mb.shared); },
    canSeeEmail(e, me) { return !e.mailbox_id || e.contact_id || e.mailbox_owner === me.id || !!e.mailbox_shared || e.token; },
    // visibility filter for the generic /api/emails list
    emailScope(me) { return ["(e.mailbox_id IS NULL OR e.contact_id IS NOT NULL OR e.token IS NOT NULL OR mb.user_id = ? OR mb.shared = 1)", me.id]; },
    mailboxesFor(me) {
      return this.all(`SELECT m.id,m.user_id,m.email,m.name,m.shared,m.status,m.error,m.last_sync,m.sync_enabled,m.signature,m.created_at,u.name AS owner_name,
        (SELECT COUNT(*) FROM emails e WHERE e.mailbox_id=m.id AND e.direction='in' AND e.is_read=0) AS unread
        FROM mailboxes m LEFT JOIN users u ON u.id=m.user_id WHERE m.user_id=? OR m.shared=1 ORDER BY (m.user_id=?) DESC, m.email`, me.id, me.id).map((x) => ({ ...x, mine: x.user_id === me.id }));
    },

    // ---------------------------------------------------------- Google OAuth / Gmail API
    gBase() { return this.env.GMAIL_API_BASE || "https://gmail.googleapis.com"; },
    googleReady() { return !!((this.setting("google_client_id") || this.env.GOOGLE_CLIENT_ID) && (this.one("SELECT value FROM settings WHERE key='google_client_secret'")?.value || this.env.GOOGLE_CLIENT_SECRET)); },
    googleCreds() {
      const id = this.setting("google_client_id") || this.env.GOOGLE_CLIENT_ID, secret = this.one("SELECT value FROM settings WHERE key='google_client_secret'")?.value || this.env.GOOGLE_CLIENT_SECRET;
      if (!id || !secret) fail(400, "Gmail isn't set up yet. An admin needs to add the Google client ID and secret in Settings → Email.");
      return { id, secret };
    },
    gmailConnectUrl(me, origin) {
      const { id } = this.googleCreds(), state = rid(16);
      this.sql.exec("DELETE FROM oauth_states WHERE created_at < ?", Date.now() - 600000);
      this.sql.exec("INSERT INTO oauth_states (state,user_id,origin,created_at) VALUES (?,?,?,?)", state, me.id, origin, Date.now());
      const p = new URLSearchParams({ client_id: id, redirect_uri: origin + "/api/gmail/callback", response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", state });
      return (this.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth") + "?" + p;
    },
    async gmailCallback(url) {
      const back = (ok, msg) => Response.redirect(`${url.origin}/#/inbox?${ok ? "connected" : "gmail_error"}=${encodeURIComponent(msg)}`, 302);
      const state = url.searchParams.get("state"), code = url.searchParams.get("code"), err = url.searchParams.get("error");
      const st = state && this.one("SELECT * FROM oauth_states WHERE state=?", state);
      if (st) this.sql.exec("DELETE FROM oauth_states WHERE state=?", state);
      if (!st || st.created_at < Date.now() - 600000) return back(false, "That sign-in link expired. Please click Connect Gmail again.");
      if (err || !code) return back(false, err === "access_denied" ? "Google access wasn't granted." : `Google returned an error: ${err || "no code"}`);
      try {
        const { id, secret } = this.googleCreds();
        const r = await fetch(this.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: st.origin + "/api/gmail/callback", grant_type: "authorization_code" }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return back(false, d.error_description || d.error || `Token exchange failed (${r.status})`);
        if (!String(d.scope || "").includes("gmail.send") || !String(d.scope || "").includes("gmail.readonly")) return back(false, "Please tick both Gmail permission boxes on Google's consent screen so the CRM can send and show your email.");
        if (!d.refresh_token) return back(false, "Google didn't grant offline access. Remove the app at myaccount.google.com/permissions and connect again.");
        const pr = await fetch(this.gBase() + "/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${d.access_token}` } });
        const prof = await pr.json().catch(() => ({}));
        const email = String(prof.emailAddress || "").toLowerCase();
        if (!email) return back(false, "Couldn't read the Gmail address");
        const other = this.one("SELECT m.id, u.name FROM mailboxes m JOIN users u ON u.id=m.user_id WHERE m.email=? AND m.user_id<>?", email, st.user_id);
        if (other) return back(false, `${email} is already connected by ${other.name}. Ask them to share it instead.`);
        const user = this.one("SELECT id, name FROM users WHERE id=?", st.user_id);
        const ex = this.one("SELECT id FROM mailboxes WHERE user_id=? AND email=?", st.user_id, email);
        const exp = Date.now() + (d.expires_in || 3600) * 1000;
        if (ex) this.sql.exec("UPDATE mailboxes SET refresh_token=?, access_token=?, access_expires=?, status='Connected', error=NULL WHERE id=?", d.refresh_token, d.access_token, exp, ex.id);
        else this.sql.exec("INSERT INTO mailboxes (user_id,email,name,refresh_token,access_token,access_expires,last_sync_epoch,status,created_at) VALUES (?,?,?,?,?,?,?,'Connected',?)",
          st.user_id, email, user?.name || null, d.refresh_token, d.access_token, exp, Math.floor(Date.now() / 1000) - 7 * 86400, nowIso());
        this.audit(user, "connect", "mailboxes", null, email);
        return back(true, email);
      } catch (e) { return back(false, e.message); }
    },
    async gToken(mb) {
      if (mb.access_token && mb.access_expires > Date.now() + 60000) return mb.access_token;
      const { id, secret } = this.googleCreds();
      const r = await fetch(this.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: mb.refresh_token || "", grant_type: "refresh_token" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = d.error === "invalid_grant" ? "Google access expired or was revoked — reconnect this account" : d.error_description || d.error || `Google token error ${r.status}`;
        if (d.error === "invalid_grant") this.sql.exec("UPDATE mailboxes SET status='Disconnected', error=?, access_token=NULL WHERE id=?", msg, mb.id);
        throw new Error(msg);
      }
      mb.access_token = d.access_token; mb.access_expires = Date.now() + (d.expires_in || 3600) * 1000;
      this.sql.exec("UPDATE mailboxes SET access_token=?, access_expires=?, status='Connected', error=NULL WHERE id=?", mb.access_token, mb.access_expires, mb.id);
      return mb.access_token;
    },
    async gFetch(mb, path, init = {}) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const tok = await this.gToken(mb);
        const r = await fetch(this.gBase() + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tok}` } });
        if (r.status === 401 && attempt === 0) { mb.access_expires = 0; continue; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error?.message || `Gmail error ${r.status}`);
        return d;
      }
    },

    // ---------------------------------------------------------- inbox sync
    async syncAll() {
      const boxes = this.all("SELECT * FROM mailboxes WHERE sync_enabled=1 AND status<>'Disconnected'");
      if (!boxes.length) return;
      const per = Math.max(8, Math.floor(45 / boxes.length));
      for (const mb of boxes) { try { await this.syncMailbox(mb, per); } catch (e) { console.error("sync", mb.email, e.message); } }
    },
    async syncMailbox(mb, budget = 40) {
      if (mb.status === "Disconnected") fail(400, mb.error || "This account needs to be reconnected");
      const startEpoch = Math.floor(Date.now() / 1000);
      const since = (mb.last_sync_epoch || startEpoch - 7 * 86400) - 900;
      const q = `after:${since} -in:chats -in:spam -in:trash -in:drafts -category:promotions -category:social`;
      try {
        const ids = []; let pageToken = "";
        for (let i = 0; i < 3; i++) {
          const d = await this.gFetch(mb, `/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ""}`); budget--;
          ids.push(...(d.messages || [])); pageToken = d.nextPageToken; if (!pageToken || budget < 5) break;
        }
        const from = new Date((since - 3 * 86400) * 1000).toISOString();
        const known = new Set([...this.all("SELECT gmail_id AS g FROM emails WHERE mailbox_id=? AND gmail_id IS NOT NULL AND created_at >= ?", mb.id, from),
          ...this.all("SELECT provider_id AS g FROM campaign_recipients WHERE mailbox_id=? AND provider_id IS NOT NULL AND sent_at >= ?", mb.id, from)].map((r) => r.g));
        const todo = ids.filter((x) => !known.has(x.id)).reverse();
        let n = 0;
        for (const x of todo) { if (budget <= 0) break; const msg = await this.gFetch(mb, `/gmail/v1/users/me/messages/${x.id}?format=full`); budget--; this.storeGmail(mb, msg); n++; }
        this.sql.exec("UPDATE mailboxes SET last_sync=?, last_sync_epoch=?, status='Connected', error=NULL WHERE id=?", nowIso(), n === todo.length ? startEpoch : mb.last_sync_epoch || since + 900, mb.id);
        return { fetched: n, remaining: todo.length - n };
      } catch (e) {
        this.sql.exec("UPDATE mailboxes SET error=?, last_sync=? WHERE id=?", e.message.slice(0, 300), nowIso(), mb.id);
        throw e;
      }
    },
    storeGmail(mb, msg) {
      const labels = msg.labelIds || [];
      if (labels.includes("DRAFT")) return;
      const Hd = msg.payload?.headers || [];
      const from = hdr(Hd, "From"), to = hdr(Hd, "To"), cc = hdr(Hd, "Cc"), subject = hdr(Hd, "Subject") || "(no subject)", mid = hdr(Hd, "Message-ID") || hdr(Hd, "Message-Id");
      const fromAddr = addrList(from)[0] || "";
      const out = labels.includes("SENT") && fromAddr === mb.email.toLowerCase();
      if (out && mid && this.one("SELECT id FROM emails WHERE message_id_hdr=? AND mailbox_id=?", mid, mb.id)) { // sent from the CRM: just record Gmail's id
        this.sql.exec("UPDATE emails SET gmail_id=COALESCE(gmail_id,?) WHERE message_id_hdr=? AND mailbox_id=?", msg.id, mid, mb.id); return;
      }
      const body = extractBody(msg.payload);
      const text = body.text || stripHtml(body.html);
      const at = new Date(+msg.internalDate || Date.now()).toISOString(), t = nowIso();
      if (!out && /mailer-daemon|postmaster/i.test(fromAddr)) {
        const failed = (hdr(Hd, "X-Failed-Recipients").split(",")[0] || (text.match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g) || []).find((a) => !/mailer-daemon|postmaster|google\.com|googlemail/i.test(a)) || "").trim().toLowerCase();
        if (failed) this.markBounce(failed, at);
      }
      const peer = out ? addrList(to)[0] : fromAddr;
      const contact = peer ? this.one("SELECT id, company_id, first_name, last_name FROM contacts WHERE email=?", peer) : null;
      const em = this.one(`INSERT INTO emails (mailbox_id,gmail_id,thread_id,message_id_hdr,direction,from_addr,to_addr,cc_addr,subject,body_html,body_text,snippet,status,is_read,contact_id,user_id,attachments,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, mb.id, msg.id, msg.threadId || null, mid || null, out ? "out" : "in", from, to, cc || null, subject,
        body.html ? body.html.slice(0, 400000) : null, text.slice(0, 100000), unesc(msg.snippet || "").slice(0, 300), out ? "Sent" : "Received", out || !labels.includes("UNREAD") ? 1 : 0,
        contact?.id ?? null, out ? mb.user_id : null, body.files.length ? body.files.join(", ").slice(0, 500) : null, at);
      if (!out && msg.threadId) {
        const orig = this.one("SELECT id FROM emails WHERE thread_id=? AND direction='out' AND token IS NOT NULL AND replied_at IS NULL ORDER BY id DESC LIMIT 1", msg.threadId);
        if (orig) { this.sql.exec("UPDATE emails SET replied_at=? WHERE id=?", at, orig.id); this.sql.exec("INSERT INTO email_events (email_id,type,at) VALUES (?,'reply',?)", orig.id, at); }
        const rc = this.one("SELECT id FROM campaign_recipients WHERE thread_id=? AND replied_at IS NULL", msg.threadId);
        if (rc) { this.sql.exec("UPDATE campaign_recipients SET replied_at=? WHERE id=?", at, rc.id); this.sql.exec("INSERT INTO email_events (recipient_id,type,at) VALUES (?,'reply',?)", rc.id, at); }
      }
      if (contact) {
        this.sql.exec("INSERT INTO interactions (contact_id,company_id,email_id,type,direction,subject,body,occurred_at,user_id,created_at) VALUES (?,?,?,'Email',?,?,?,?,?,?)",
          contact.id, contact.company_id, em.id, out ? "Outbound" : "Inbound", subject, text.slice(0, 5000), at, out ? mb.user_id : null, t);
        this.sql.exec("UPDATE contacts SET last_contacted=MAX(COALESCE(last_contacted,''), ?) WHERE id=?", at, contact.id);
        if (!out) this.ticketReply(contact, subject, text, at, em.id);
      }
    },
    markBounce(addr, at) {
      const e = this.one("SELECT id FROM emails WHERE direction='out' AND to_addr LIKE ? AND bounced_at IS NULL AND created_at >= ? ORDER BY id DESC LIMIT 1", `%${addr}%`, new Date(Date.now() - 7 * 864e5).toISOString());
      if (e) { this.sql.exec("UPDATE emails SET bounced_at=?, status='Bounced' WHERE id=?", at, e.id); this.sql.exec("INSERT INTO email_events (email_id,type,at) VALUES (?,'bounce',?)", e.id, at); }
      const r = this.one("SELECT id FROM campaign_recipients WHERE email=? AND bounced_at IS NULL AND sent_at >= ? ORDER BY id DESC LIMIT 1", addr, new Date(Date.now() - 7 * 864e5).toISOString());
      if (r) { this.sql.exec("UPDATE campaign_recipients SET bounced_at=?, status='Bounced' WHERE id=?", at, r.id); this.sql.exec("INSERT INTO email_events (recipient_id,type,at) VALUES (?,'bounce',?)", r.id, at); }
    },
    ticketReply(contact, subject, body, at, emailId) {
      const tm = String(subject).match(/\[Ticket #(\d+)\]/i);
      if (!tm || !this.one("SELECT id FROM tickets WHERE id=?", +tm[1])) return null;
      const tid = +tm[1];
      this.sql.exec("INSERT INTO ticket_comments (ticket_id,author,body,internal,created_at) VALUES (?,?,?,0,?)", tid, `${contact.first_name} ${contact.last_name || ""} (customer)`.trim(), String(body).split(/\n>|\nOn .+wrote:/)[0].trim().slice(0, 20000), at);
      this.sql.exec("UPDATE tickets SET status='Open', updated_at=? WHERE id=? AND status IN ('Waiting on customer','Resolved')", nowIso(), tid);
      if (emailId) this.sql.exec("UPDATE emails SET ticket_id=? WHERE id=?", tid, emailId);
      return tid;
    },

    // ---------------------------------------------------------- composing & rendering
    resendKey() { return this.env.RESEND_API_KEY || this.one("SELECT value FROM settings WHERE key='resend_api_key'")?.value || ""; },
    resendReady() { return !!this.resendKey() && validEmail(this.setting("email_from_address")); },
    trySender(me, mailboxId) { try { return this.resolveSender(me, mailboxId); } catch { return null; } },
    resolveSender(me, mailboxId) {
      if (mailboxId && mailboxId !== "resend") {
        const mb = this.one("SELECT * FROM mailboxes WHERE id=?", +mailboxId);
        if (!this.canUse(mb, me)) fail(403, "You can't send from that account");
        if (mb.status === "Disconnected") fail(400, `${mb.email} needs to be reconnected (Inbox → Accounts)`);
        const name = (mb.name || this.setting("company_name") || "").replace(/["<>]/g, "");
        return { kind: "gmail", mb, from: name ? `"${encWord(name)}" <${mb.email}>` : mb.email, address: mb.email };
      }
      if (!mailboxId) {
        const mb = this.one("SELECT * FROM mailboxes WHERE user_id=? AND status<>'Disconnected' ORDER BY id LIMIT 1", me.id);
        if (mb) return this.resolveSender(me, mb.id);
      }
      const addr = this.setting("email_from_address");
      if (!this.resendKey() || !validEmail(addr)) fail(400, "No email account to send from. Connect your Gmail in Inbox, or ask an admin to set up company sending in Settings → Email.");
      const name = (this.setting("email_from_name") || this.setting("company_name") || "").replace(/["<>]/g, "");
      return { kind: "resend", from: name ? `${name} <${addr}>` : addr, address: addr };
    },
    senderVars(sender, me, extra = {}) { return { ...(sender?.mb?.signature ? { signature: sender.mb.signature } : {}), ...(sender ? { my_email: sender.address } : {}), ...extra }; },
    merge(text, contact, me, extra = {}) {
      const co = contact?.company_id ? this.one("SELECT name FROM companies WHERE id=?", contact.company_id)?.name : contact?.company_name;
      const myEmail = extra.my_email || me?.email || "";
      const sig = (extra.signature || this.setting("email_signature") || `<p>${escHtml(me?.name || "")}<br>${escHtml(this.setting("company_name"))}</p>`)
        .replace(/\{\{my_name\}\}/g, escHtml(me?.name || "")).replace(/\{\{my_title\}\}/g, escHtml(me?.title || "")).replace(/\{\{my_phone\}\}/g, escHtml(me?.phone || "")).replace(/\{\{my_email\}\}/g, escHtml(myEmail)).replace(/\{\{my_company\}\}/g, escHtml(this.setting("company_name")));
      const logoUrl = this.setting("logo_url");
      const raw = {
        signature: sig, logo: logoUrl ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(this.setting("company_name"))}" style="max-height:44px;max-width:220px;display:block;border:0">` : `<span style="font-size:19px;font-weight:bold;color:${escHtml(this.brandColor())};font-family:Arial,Helvetica,sans-serif">${escHtml(this.setting("company_name"))}</span>`,
        brand_color: this.brandColor(), website_url: escHtml(this.setting("company_website") ? (/^https?:/.test(this.setting("company_website")) ? this.setting("company_website") : "https://" + this.setting("company_website")) : `mailto:${myEmail}`),
        unsubscribe_url: escHtml(extra.unsubscribe_url || "#"),
      };
      const vars = {
        first_name: contact?.first_name || "there", last_name: contact?.last_name || "", full_name: contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : "",
        company: co || "your company", email: contact?.email || "", city: contact?.city || "", title: contact?.title || "",
        my_name: me?.name || "", my_email: myEmail, my_phone: me?.phone || "", my_title: me?.title || "", my_company: this.setting("company_name"),
        company_name: this.setting("company_name"), company_phone: this.setting("company_phone") || "", company_address: this.setting("company_address") || "",
      };
      return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m0, k) => (k in raw ? raw[k] : k in vars ? escHtml(vars[k]) : m0));
    },
    brandColor() { const c = this.setting("brand_color"); return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#86602d"; },
    brandFooter() { const a = this.setting("company_address"), f = this.setting("email_footer"); return `${escHtml(this.setting("company_name"))}${a ? " · " + escHtml(a) : ""}${f ? "<br>" + escHtml(f) : ""}`; },
    campaignFooter(unsub) { return `${this.brandFooter()}<br>You're receiving this because you're a contact of ${escHtml(this.setting("company_name"))}. <a href="${unsub}" style="color:#8a8073">Unsubscribe</a>`; },
    renderEmail({ layout = "branded", inner = "", preheader = "", footer = "", pixel = "" }) {
      const pre = preheader ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(preheader)}</span>` : "";
      const meta = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`;
      if (layout === "plain") return `<!doctype html><html><head>${meta}</head><body style="margin:0;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222222">${pre}${inner}${footer ? `<div style="margin-top:30px;padding-top:10px;border-top:1px solid #eeeeee;color:#999999;font-size:11px;line-height:1.5">${footer}</div>` : ""}${pixel}</body></html>`;
      if (layout === "design") {
        const tail = `${footer ? `<div style="max-width:600px;margin:14px auto 0;color:#8a8073;font-size:11px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;text-align:center">${footer}</div>` : ""}`;
        if (/<html[\s>]/i.test(inner)) return /<\/body>/i.test(inner) ? inner.replace(/<\/body>/i, `${tail}${pixel}</body>`) : inner + tail + pixel;
        return `<!doctype html><html><head>${meta}</head><body style="margin:0;background:#f4f1ec">${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:22px 10px">${inner}${tail}</td></tr></table>${pixel}</body></html>`;
      }
      const company = escHtml(this.setting("company_name")), logoUrl = this.setting("logo_url"), bc = this.brandColor();
      const header = logoUrl ? `<td style="padding:18px 28px;border-bottom:3px solid ${bc}"><img src="${escHtml(logoUrl)}" alt="${company}" style="max-height:44px;max-width:220px;display:block;border:0"></td>` : `<td style="background:${bc};padding:18px 28px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px">${company}</td>`;
      return `<!doctype html><html><head>${meta}</head><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2b2620">${pre}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee;padding:24px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e8e1d6">
<tr>${header}</tr><tr><td style="padding:28px;font-size:15px;line-height:1.6">${inner}</td></tr>
${footer ? `<tr><td style="padding:16px 28px;background:#faf7f2;color:#8a8073;font-size:12px;line-height:1.5">${footer}</td></tr>` : ""}
</table></td></tr></table>${pixel}</body></html>`;
    },
    trackLinks(html, base) { return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m0, u) => `href="${base}?u=${encodeURIComponent(u.replace(/&amp;/g, "&"))}"`); },
    pixel(src) { return `<img src="${src}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`; },

    async resend(payload, batch = false) {
      const r = await fetch(batch ? "https://api.resend.com/emails/batch" : "https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.resendKey()}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || data.error || `Email provider error ${r.status}`);
      return data;
    },
    async deliver(sender, { to, cc = [], subject, html, text, replyTo, headers = {}, threadId, inReplyTo }) {
      if (sender.kind === "resend") {
        const r = await this.resend({ from: sender.from, to, cc: cc.length ? cc : undefined, subject, html, text, reply_to: replyTo || undefined, headers });
        return { provider_id: r.id || null };
      }
      const boundary = "b_" + rid(10), msgId = `<${rid(14)}@${sender.address.split("@")[1]}>`;
      const lines = [`From: ${sender.from}`, `To: ${to.join(", ")}`, cc.length ? `Cc: ${cc.join(", ")}` : null, `Subject: ${encWord(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${msgId}`,
        inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, inReplyTo ? `References: ${inReplyTo}` : null, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(text || "")),
        `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(utf8b64(html)), `--${boundary}--`, ""].filter((x) => x !== null);
      const d = await this.gFetch(sender.mb, "/gmail/v1/users/me/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: b64url(utf8b64(lines.join("\r\n"))), threadId: threadId || undefined }) });
      return { provider_id: d.id, gmail_id: d.id, thread_id: d.threadId, message_id: msgId };
    },
    async sendOne(b, me, origin) {
      const sender = this.resolveSender(me, b.mailbox_id);
      let contact = b.contact_id ? this.one("SELECT * FROM contacts WHERE id=?", +b.contact_id) : null;
      const to = String(b.to || contact?.email || "").trim().toLowerCase();
      if (!validEmail(to)) fail(400, "A valid recipient email is required");
      if (!contact) contact = this.one("SELECT * FROM contacts WHERE email=?", to);
      if (!b.subject) fail(400, "Subject is required");
      const layout = ["plain", "branded", "design"].includes(b.layout) ? b.layout : "plain";
      const token = rid(16), t = nowIso();
      const subject = unesc(this.merge(b.subject, contact, me, this.senderVars(sender, me)));
      const inner = this.merge(b.body_html || "", contact, me, this.senderVars(sender, me));
      const html = this.renderEmail({ layout, inner: this.trackLinks(inner, `${origin}/t/l/${token}`), footer: layout === "branded" ? this.brandFooter() : "", pixel: this.pixel(`${origin}/t/e/${token}.gif`) });
      const cc = String(b.cc || "").split(",").map((s) => s.trim().toLowerCase()).filter(validEmail);
      let status = "Sent", error = null, res = {};
      try { res = await this.deliver(sender, { to: [to], cc, subject, html, text: stripHtml(inner), replyTo: sender.kind === "resend" ? this.setting("email_reply_to") || me.email : null, threadId: b.thread_id, inReplyTo: b.in_reply_to }); }
      catch (e) { status = "Failed"; error = e.message; }
      const em = this.one(`INSERT INTO emails (contact_id,deal_id,ticket_id,mailbox_id,gmail_id,thread_id,message_id_hdr,direction,from_addr,to_addr,cc_addr,subject,body_html,body_text,snippet,status,error,provider_id,token,layout,user_id,is_read,created_at)
        VALUES (?,?,?,?,?,?,?,'out',?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) RETURNING id`, contact?.id ?? null, b.deal_id || null, b.ticket_id || null, sender.mb?.id ?? null, res.gmail_id ?? null, res.thread_id ?? null, res.message_id ?? null,
        sender.from, to, cc.join(", ") || null, subject, inner, stripHtml(inner), stripHtml(inner).slice(0, 200), status, error, res.provider_id ?? null, token, layout, me.id, t);
      if (status === "Sent") {
        this.sql.exec("INSERT INTO interactions (contact_id,company_id,deal_id,ticket_id,email_id,type,direction,subject,body,occurred_at,user_id,created_at) VALUES (?,?,?,?,?,'Email','Outbound',?,?,?,?,?)",
          contact?.id ?? null, contact?.company_id ?? null, b.deal_id || null, b.ticket_id || null, em.id, subject, stripHtml(inner).slice(0, 5000), t, me.id, t);
        if (contact) this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, contact.id);
      }
      this.audit(me, "email", "emails", em.id, `${sender.address} → ${to}: ${subject} (${status})`);
      if (status === "Failed") fail(502, "Email was not sent: " + error);
      return { ok: true, id: em.id, from: sender.address };
    },

    // ---------------------------------------------------------- campaigns
    campaignHtml(cm, contact, me, origin, token, unsubToken, sender) {
      const unsub = unsubToken ? `${origin}/u/${unsubToken}` : "#";
      let inner = this.merge(cm.body_html || "", contact, me, this.senderVars(sender, me, { unsubscribe_url: unsub }));
      if (token) inner = inner.replace(/href="(https?:\/\/[^"]+)"/gi, (m0, u) => (u === unsub ? m0 : `href="${origin}/t/c/${token}?u=${encodeURIComponent(u.replace(/&amp;/g, "&"))}"`));
      return { html: this.renderEmail({ layout: cm.layout || "branded", inner, preheader: cm.preheader, footer: this.campaignFooter(unsub), pixel: token ? this.pixel(`${origin}/t/o/${token}.gif`) : "" }), text: stripHtml(inner) + `\n\nUnsubscribe: ${unsub}`, unsub };
    },
    async campaignTest(id, b, me, origin) {
      const cm = this.one("SELECT * FROM campaigns WHERE id=?", id) || fail(404, "Not found");
      const to = String(b.to || me.email).trim();
      if (!validEmail(to)) fail(400, "Invalid test address");
      const sender = this.resolveSender(me, cm.mailbox_id);
      const sample = this.segmentContacts(JSON.parse(cm.segment || "{}"))[0] || { first_name: me.name.split(" ")[0], company_name: "Sample Company" };
      const { html, text } = this.campaignHtml(cm, sample, me, origin, null, null, sender);
      await this.deliver(sender, { to: [to], subject: "[TEST] " + unesc(this.merge(cm.subject, sample, me)), html, text, replyTo: sender.kind === "resend" ? this.setting("email_reply_to") || me.email : null });
      return { ok: true, from: sender.address };
    },
    async campaignSend(id, me, origin) {
      const cm = this.one("SELECT * FROM campaigns WHERE id=?", id) || fail(404, "Not found");
      const sender = this.resolveSender(me, cm.mailbox_id);
      if (!cm.subject || !cm.body_html) fail(400, "Campaign needs a subject and content");
      if (cm.status === "Draft") {
        const list = this.segmentContacts(JSON.parse(cm.segment || "{}"));
        if (!list.length) fail(400, "No contacts match this campaign's audience");
        if (sender.kind === "gmail" && list.length > 450) fail(400, `Gmail accounts can send about 500 emails a day (2,000 for Google Workspace). This audience has ${list.length} contacts — narrow it, or send through company sending (Resend).`);
        this.ctx.storage.transactionSync(() => {
          for (const c of list) this.sql.exec("INSERT INTO campaign_recipients (campaign_id,contact_id,email,token,status,mailbox_id) VALUES (?,?,?,?,'Queued',?)", id, c.id, c.email, rid(16), sender.mb?.id ?? null);
          this.sql.exec("UPDATE campaigns SET status='Sending', sent_at=?, updated_at=? WHERE id=?", nowIso(), nowIso(), id);
        });
        this.audit(me, "campaign_send", "campaigns", id, `${list.length} recipients from ${sender.address}`);
      } else if (cm.status !== "Sending") fail(400, "This campaign was already sent");
      const limit = sender.kind === "gmail" ? 35 : 200;
      const queue = this.all("SELECT r.*, c.first_name, c.last_name, c.company_id, c.city, c.title, c.unsub_token, c.unsubscribed FROM campaign_recipients r LEFT JOIN contacts c ON c.id=r.contact_id WHERE r.campaign_id=? AND r.status='Queued' ORDER BY r.id LIMIT ?", id, limit);
      let sent = 0, failed = 0;
      const replyTo = sender.kind === "resend" ? this.setting("email_reply_to") || undefined : null;
      const mark = (r, res, t) => {
        this.sql.exec("UPDATE campaign_recipients SET status='Sent', sent_at=?, provider_id=?, thread_id=? WHERE id=?", t, res?.provider_id ?? null, res?.thread_id ?? null, r.id);
        if (r.contact_id) {
          this.sql.exec("INSERT INTO interactions (contact_id,company_id,type,direction,subject,body,occurred_at,user_id,created_at) VALUES (?,?,'Campaign','Outbound',?,?,?,?,?)", r.contact_id, r.company_id, `Campaign: ${cm.name}`, cm.subject, t, me.id, t);
          this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, r.contact_id);
        }
        sent++;
      };
      const live = queue.filter((r) => { if (r.unsubscribed) { this.sql.exec("UPDATE campaign_recipients SET status='Skipped', error='Unsubscribed' WHERE id=?", r.id); return false; } return true; });
      const build = (r) => { const { html, text, unsub } = this.campaignHtml(cm, r, me, origin, r.token, r.unsub_token, sender); return { to: [r.email], subject: unesc(this.merge(cm.subject, r, me)), html, text, replyTo, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }; };
      if (sender.kind === "gmail") {
        for (const r of live) {
          try { mark(r, await this.deliver(sender, build(r)), nowIso()); }
          catch (e) { this.sql.exec("UPDATE campaign_recipients SET status='Failed', error=? WHERE id=?", e.message.slice(0, 500), r.id); failed++; if (/rate|limit|quota/i.test(e.message)) break; }
        }
      } else {
        for (let i = 0; i < live.length; i += 100) {
          const chunk = live.slice(i, i + 100), t = nowIso();
          try {
            const res = await this.resend(chunk.map((r) => { const x = build(r); return { from: sender.from, to: x.to, subject: x.subject, html: x.html, text: x.text, reply_to: replyTo, headers: x.headers }; }), true);
            chunk.forEach((r, k) => mark(r, { provider_id: res.data?.[k]?.id }, t));
          } catch (e) { chunk.forEach((r) => this.sql.exec("UPDATE campaign_recipients SET status='Failed', error=? WHERE id=?", e.message.slice(0, 500), r.id)); failed += chunk.length; }
        }
      }
      const remaining = this.one("SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id=? AND status='Queued'", id).n;
      if (!remaining) this.sql.exec("UPDATE campaigns SET status='Sent', updated_at=? WHERE id=?", nowIso(), id);
      return { sent, failed, remaining };
    },

    async addTicketComment(tid, b, me, origin) {
      const tk = this.one("SELECT tk.*, c.email AS contact_email FROM tickets tk LEFT JOIN contacts c ON c.id=tk.contact_id WHERE tk.id=?", tid) || fail(404, "Ticket not found");
      if (!b.body) fail(400, "Comment is empty");
      let emailed = 0;
      if (b.email_customer && !b.internal) {
        if (!tk.contact_email) fail(400, "This ticket's contact has no email address");
        const prev = this.one("SELECT thread_id, message_id_hdr, mailbox_id FROM emails WHERE ticket_id=? AND thread_id IS NOT NULL ORDER BY id DESC LIMIT 1", tid);
        await this.sendOne({ contact_id: tk.contact_id, to: tk.contact_email, mailbox_id: b.mailbox_id || prev?.mailbox_id || null, thread_id: prev?.thread_id, in_reply_to: prev?.message_id_hdr, layout: "plain", subject: `Re: [Ticket #${tid}] ${tk.subject}`, body_html: `<p>${escHtml(b.body).replace(/\n/g, "<br>")}</p>{{signature}}<p style="color:#8a8073;font-size:12px">Reply to this email to respond — please keep [Ticket #${tid}] in the subject.</p>`, ticket_id: tid }, me, origin);
        emailed = 1;
      }
      const c = this.one("INSERT INTO ticket_comments (ticket_id,user_id,author,body,internal,emailed,created_at) VALUES (?,?,?,?,?,?,?) RETURNING *", tid, me.id, me.name, b.body, b.internal ? 1 : 0, emailed, nowIso());
      if (b.status) this.save("tickets", tid, { status: b.status }, me);
      else if (emailed && tk.status === "Open") this.sql.exec("UPDATE tickets SET status='Waiting on customer', updated_at=? WHERE id=?", nowIso(), tid);
      return c;
    },

    // ---------------------------------------------------------- tracking report
    emailActivity(Q, me) {
      const days = Math.min(Math.max(+Q.days || 30, 1), 3650), since = new Date(Date.now() - days * 864e5).toISOString();
      const f = [], b = [since];
      if (Q.mailbox_id) { f.push("e.mailbox_id=?"); b.push(+Q.mailbox_id); }
      if (Q.user_id) { f.push("e.user_id=?"); b.push(+Q.user_id); }
      const sent = this.all(`SELECT e.id,e.contact_id,e.to_addr,e.subject,e.created_at,e.status,e.error,e.opened_at,e.open_count,e.clicked_at,e.click_count,e.replied_at,e.bounced_at,e.mailbox_id,e.layout,
        (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, u.name AS user_name, COALESCE(mb.email, 'Company sending') AS sent_from
        FROM emails e LEFT JOIN contacts c ON c.id=e.contact_id LEFT JOIN users u ON u.id=e.user_id LEFT JOIN mailboxes mb ON mb.id=e.mailbox_id
        WHERE e.direction='out' AND e.token IS NOT NULL AND e.created_at>=?${f.map((x) => " AND " + x).join("")} ORDER BY e.id DESC LIMIT 500`, ...b);
      const ok = sent.filter((e) => e.status !== "Failed");
      const cr = this.one(`SELECT COUNT(*) AS sent, SUM(opened_at IS NOT NULL) AS opened, SUM(clicked_at IS NOT NULL) AS clicked, SUM(replied_at IS NOT NULL) AS replied, SUM(bounced_at IS NOT NULL) AS bounced
        FROM campaign_recipients WHERE sent_at>=?`, since);
      const events = this.all(`SELECT ev.id, ev.type, ev.at, ev.url, ev.email_id, ev.recipient_id, COALESCE(e.subject, cm.subject) AS subject, COALESCE(e.contact_id, r.contact_id) AS contact_id,
        (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name, COALESCE(e.to_addr, r.email) AS email, cm.name AS campaign_name, cm.id AS campaign_id
        FROM email_events ev LEFT JOIN emails e ON e.id=ev.email_id LEFT JOIN campaign_recipients r ON r.id=ev.recipient_id LEFT JOIN campaigns cm ON cm.id=r.campaign_id
        LEFT JOIN contacts c ON c.id=COALESCE(e.contact_id, r.contact_id) WHERE ev.at>=? ORDER BY ev.id DESC LIMIT 150`, since);
      const score = {};
      for (const ev of events) if (ev.contact_id) { const s = (score[ev.contact_id] ||= { contact_id: ev.contact_id, name: ev.contact_name, opens: 0, clicks: 0, replies: 0, last: ev.at }); s[ev.type === "open" ? "opens" : ev.type === "click" ? "clicks" : ev.type === "reply" ? "replies" : "x"]++; }
      const engaged = Object.values(score).map((s) => ({ ...s, score: s.opens + s.clicks * 3 + s.replies * 5 })).sort((a, z) => z.score - a.score).slice(0, 8);
      return {
        days, sent, events, engaged,
        summary: { sent: ok.length, failed: sent.length - ok.length, opened: ok.filter((e) => e.opened_at).length, clicked: ok.filter((e) => e.clicked_at).length, replied: ok.filter((e) => e.replied_at).length, bounced: ok.filter((e) => e.bounced_at).length },
        campaigns: { sent: cr?.sent || 0, opened: cr?.opened || 0, clicked: cr?.clicked || 0, replied: cr?.replied || 0, bounced: cr?.bounced || 0 },
      };
    },
    recentEngagement(limit = 8) {
      return this.all(`SELECT ev.type, ev.at, COALESCE(e.subject, cm.subject) AS subject, COALESCE(e.contact_id, r.contact_id) AS contact_id, (c.first_name || ' ' || COALESCE(c.last_name,'')) AS contact_name,
        COALESCE(e.to_addr, r.email) AS email, cm.name AS campaign_name, e.id AS email_id FROM email_events ev LEFT JOIN emails e ON e.id=ev.email_id LEFT JOIN campaign_recipients r ON r.id=ev.recipient_id
        LEFT JOIN campaigns cm ON cm.id=r.campaign_id LEFT JOIN contacts c ON c.id=COALESCE(e.contact_id, r.contact_id) ORDER BY ev.id DESC LIMIT ?`, limit);
    },

    // ---------------------------------------------------------- inbound via Cloudflare Email Routing
    async inboundEmail(m) {
      const addr = String(m.fromAddress || m.envelopeFrom).toLowerCase().trim(), t = nowIso();
      let contact = this.one("SELECT * FROM contacts WHERE email=?", addr);
      if (!contact) {
        const [first, ...rest] = (m.fromName || addr.split("@")[0]).trim().split(/\s+/);
        contact = this.one("INSERT INTO contacts (first_name,last_name,email,type,lead_source,rating,unsub_token,created_at,updated_at) VALUES (?,?,?,'Lead','Inbound email','Warm',?,?,?) RETURNING *", first || addr, rest.join(" ") || null, addr, rid(16), t, t);
      }
      const body = m.text || stripHtml(m.html);
      const em = this.one("INSERT INTO emails (contact_id,direction,from_addr,to_addr,subject,body_html,body_text,snippet,status,is_read,created_at) VALUES (?,'in',?,?,?,?,?,?,'Received',0,?) RETURNING id", contact.id, addr, m.to, m.subject, m.html || null, body.slice(0, 100000), body.slice(0, 200), t);
      let ticketId = this.ticketReply(contact, m.subject, body, t, em.id);
      if (!ticketId) {
        const support = (this.setting("support_address") || "").toLowerCase();
        if (support && String(m.to).toLowerCase() === support) {
          const tk = this.one("INSERT INTO tickets (subject,description,contact_id,company_id,category,priority,status,channel,due_at,created_at,updated_at) VALUES (?,?,?,?,'General','Normal','Open','Email',?,?,?) RETURNING id", m.subject, body.slice(0, 20000), contact.id, contact.company_id, new Date(Date.now() + 48 * 3600e3).toISOString(), t, t);
          ticketId = tk.id;
          this.sql.exec("INSERT INTO ticket_comments (ticket_id,author,body,internal,created_at) VALUES (?,?,?,0,?)", ticketId, `${contact.first_name} (customer)`, body.slice(0, 20000), t);
          this.sql.exec("UPDATE emails SET ticket_id=? WHERE id=?", ticketId, em.id);
        }
      }
      this.sql.exec("INSERT INTO interactions (contact_id,company_id,ticket_id,email_id,type,direction,subject,body,occurred_at,created_at) VALUES (?,?,?,?,'Email','Inbound',?,?,?,?)", contact.id, contact.company_id, ticketId, em.id, m.subject, body.slice(0, 5000), t, t);
      this.sql.exec("UPDATE contacts SET last_contacted=? WHERE id=?", t, contact.id);
      return { ok: true };
    },

    // ---------------------------------------------------------- public routes: tracking, unsubscribe, hosted images
    async publicRoutes(req, url) {
      const gif = () => new Response(Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, private" } });
      const ua = (req.headers.get("user-agent") || "").slice(0, 200), now = nowIso();
      const grace = this.env.OPEN_GRACE_MS != null ? +this.env.OPEN_GRACE_MS : OPEN_GRACE_MS;
      const fresh = (sentAt) => sentAt && Date.now() - new Date(sentAt).getTime() < grace;
      let m;
      if ((m = url.pathname.match(/^\/t\/o\/([a-f0-9]+)\.gif$/))) {
        const r = this.one("SELECT id, sent_at FROM campaign_recipients WHERE token=?", m[1]);
        if (r && !fresh(r.sent_at)) {
          this.sql.exec("UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,?), open_count=open_count+1, status=CASE WHEN status='Sent' THEN 'Opened' ELSE status END WHERE id=?", now, r.id);
          this.sql.exec("INSERT INTO email_events (recipient_id,type,ua,at) VALUES (?,'open',?,?)", r.id, ua, now);
        }
        return gif();
      }
      if ((m = url.pathname.match(/^\/t\/e\/([a-f0-9]+)\.gif$/))) {
        const e = this.one("SELECT id, created_at FROM emails WHERE token=?", m[1]);
        if (e && !fresh(e.created_at)) {
          this.sql.exec("UPDATE emails SET opened_at=COALESCE(opened_at,?), open_count=open_count+1 WHERE id=?", now, e.id);
          this.sql.exec("INSERT INTO email_events (email_id,type,ua,at) VALUES (?,'open',?,?)", e.id, ua, now);
        }
        return gif();
      }
      if ((m = url.pathname.match(/^\/t\/c\/([a-f0-9]+)$/))) {
        const target = url.searchParams.get("u") || "";
        const r = this.one("SELECT r.id, cm.body_html FROM campaign_recipients r JOIN campaigns cm ON cm.id=r.campaign_id WHERE r.token=?", m[1]);
        if (r && /^https?:\/\//i.test(target) && (r.body_html || "").replace(/&amp;/g, "&").includes(target)) {
          this.sql.exec("UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,?), click_count=click_count+1, opened_at=COALESCE(opened_at,?), status=CASE WHEN status IN ('Sent','Opened') THEN 'Clicked' ELSE status END WHERE id=?", now, now, r.id);
          this.sql.exec("INSERT INTO email_events (recipient_id,type,url,ua,at) VALUES (?,'click',?,?,?)", r.id, target.slice(0, 500), ua, now);
          return Response.redirect(target, 302);
        }
        return new Response("Link not found", { status: 404 });
      }
      if ((m = url.pathname.match(/^\/t\/l\/([a-f0-9]+)$/))) {
        const target = url.searchParams.get("u") || "";
        const e = this.one("SELECT id, body_html FROM emails WHERE token=?", m[1]);
        if (e && /^https?:\/\//i.test(target) && (e.body_html || "").replace(/&amp;/g, "&").includes(target)) {
          this.sql.exec("UPDATE emails SET clicked_at=COALESCE(clicked_at,?), click_count=click_count+1, opened_at=COALESCE(opened_at,?) WHERE id=?", now, now, e.id);
          this.sql.exec("INSERT INTO email_events (email_id,type,url,ua,at) VALUES (?,'click',?,?,?)", e.id, target.slice(0, 500), ua, now);
          return Response.redirect(target, 302);
        }
        return new Response("Link not found", { status: 404 });
      }
      if ((m = url.pathname.match(/^\/f\/([a-f0-9]+)$/))) {
        const f = this.one("SELECT mime, data FROM files WHERE token=?", m[1]);
        if (!f) return new Response("Not found", { status: 404 });
        return new Response(f.data, { headers: { "content-type": f.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
      }
      if ((m = url.pathname.match(/^\/u\/([a-f0-9]+)$/))) {
        const c = this.one("SELECT id, email FROM contacts WHERE unsub_token=?", m[1]);
        const company = escHtml(this.setting("company_name"));
        const page = (msg) => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${company}</title><body style="font-family:system-ui;background:#f6f3ee;display:grid;place-items:center;min-height:90vh;margin:0"><div style="background:#fff;padding:32px 40px;border-radius:12px;border:1px solid #e8e1d6;max-width:420px;text-align:center"><h2 style="margin-top:0">${company}</h2><p>${msg}</p></div>`, { headers: { "content-type": "text/html; charset=utf-8" } });
        if (!c) return page("This link is no longer valid.");
        if (req.method === "POST" || url.searchParams.get("confirm") === "1") {
          this.sql.exec("UPDATE contacts SET unsubscribed=1, updated_at=? WHERE id=?", now, c.id);
          this.sql.exec("INSERT INTO interactions (contact_id,type,direction,subject,occurred_at,created_at) VALUES (?,'Note','Inbound','Unsubscribed from marketing emails',?,?)", c.id, now, now);
          return page(`<strong>${escHtml(c.email)}</strong> has been unsubscribed from marketing emails.`);
        }
        return page(`Unsubscribe <strong>${escHtml(c.email)}</strong> from marketing emails?<br><br><a href="?confirm=1" style="display:inline-block;background:#7a5a2f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Yes, unsubscribe me</a>`);
      }
      return new Response("Not found", { status: 404 });
    },
  };
  Object.assign(Cls.prototype, methods);
}
