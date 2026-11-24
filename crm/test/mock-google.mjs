// Minimal stand-in for Google OAuth + the Gmail API, for local testing only.
// Run: node test/mock-google.mjs  (listens on :9900). Point the Worker at it with .dev.vars:
//   GMAIL_API_BASE=http://127.0.0.1:9900  GOOGLE_TOKEN_URL=http://127.0.0.1:9900/token  GOOGLE_AUTH_URL=http://127.0.0.1:9900/auth
import http from "node:http";
const boxes = {}; // email -> [messages]
let seq = 1;
const box = (e) => (boxes[e] ||= []);
const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function parseMime(raw) {
  const [head, ...rest] = raw.split("\r\n\r\n"); const body = rest.join("\r\n\r\n");
  const headers = []; for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) { const i = line.indexOf(":"); if (i > 0) headers.push({ name: line.slice(0, i), value: line.slice(i + 1).trim() }); }
  const ct = headers.find((h) => h.name.toLowerCase() === "content-type")?.value || "";
  const bd = (ct.match(/boundary="?([^";]+)"?/) || [])[1];
  let text = "", html = "";
  if (bd) for (const part of body.split("--" + bd)) {
    const [ph, ...pb] = part.split("\r\n\r\n"); const data = pb.join("\r\n\r\n").replace(/\r\n/g, "");
    const dec = /base64/i.test(ph) ? Buffer.from(data, "base64").toString("utf8") : data;
    if (/text\/plain/i.test(ph)) text = dec; if (/text\/html/i.test(ph)) html = dec;
  } else text = body;
  return { headers, text, html };
}
const decodeWord = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (m, b) => Buffer.from(b, "base64").toString("utf8"));
function add(email, msg) { const m = { id: "m" + seq++, internalDate: String(Date.now()), ...msg }; box(email).push(m); return m; }
const who = (req) => decodeURIComponent((req.headers.authorization || "").replace(/^Bearer at:/, ""));
const send = (res, code, data) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); let body = ""; for await (const c of req) body += c;
  if (u.pathname === "/token") {
    const p = new URLSearchParams(body);
    if (p.get("grant_type") === "authorization_code") { const email = p.get("code") + "@gmail.test"; return send(res, 200, { access_token: "at:" + email, refresh_token: "rt:" + email, expires_in: 30, scope: "openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly" }); }
    const rt = p.get("refresh_token") || ""; if (rt.includes("revoked")) return send(res, 400, { error: "invalid_grant" });
    return send(res, 200, { access_token: "at:" + rt.replace(/^rt:/, ""), expires_in: 3600 });
  }
  if (u.pathname === "/auth") { const q = u.searchParams; res.writeHead(302, { location: `${q.get("redirect_uri")}?code=${q.get("login_hint") || "maya"}&state=${q.get("state")}` }); return res.end(); }
  if (u.pathname === "/_inject") { const j = JSON.parse(body); const hs = [{ name: "From", value: j.from }, { name: "To", value: j.to }, { name: "Subject", value: j.subject }, { name: "Message-ID", value: `<${Date.now()}@mock>` }, ...(j.headers || [])]; const m = add(j.to.match(/[^<\s]+@[^>\s]+/)[0], { threadId: j.threadId || "t" + seq, labelIds: ["INBOX", "UNREAD"], parsed: { headers: hs, text: j.text, html: j.html || "" } }); return send(res, 200, m); }
  if (u.pathname === "/_box") return send(res, 200, box(u.searchParams.get("email")));
  const me = who(req); if (!me) return send(res, 401, { error: { message: "no auth" } });
  if (u.pathname === "/gmail/v1/users/me/profile") return send(res, 200, { emailAddress: me, historyId: "1" });
  if (u.pathname === "/gmail/v1/users/me/messages/send") {
    const j = JSON.parse(body); const parsed = parseMime(b64urlDecode(j.raw));
    const m = add(me, { threadId: j.threadId || "t" + seq, labelIds: ["SENT"], parsed });
    const to = (parsed.headers.find((h) => h.name === "To")?.value || "").match(/[^<\s,]+@[^>\s,]+/g) || [];
    for (const t of to) if (boxes[t]) add(t, { threadId: m.threadId, labelIds: ["INBOX", "UNREAD"], parsed });
    return send(res, 200, { id: m.id, threadId: m.threadId });
  }
  if (u.pathname === "/gmail/v1/users/me/messages") return send(res, 200, { messages: [...box(me)].reverse().map((m) => ({ id: m.id, threadId: m.threadId })) });
  const mm = u.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/(m\d+)$/);
  if (mm) {
    const m = box(me).find((x) => x.id === mm[1]); if (!m) return send(res, 404, { error: { message: "not found" } });
    const hs = m.parsed.headers.map((h) => ({ name: h.name, value: decodeWord(h.value) }));
    return send(res, 200, { id: m.id, threadId: m.threadId, labelIds: m.labelIds, internalDate: m.internalDate, snippet: (m.parsed.text || "").slice(0, 80),
      payload: { mimeType: "multipart/alternative", headers: hs, parts: [{ mimeType: "text/plain", body: { data: b64url(m.parsed.text || "") } }, ...(m.parsed.html ? [{ mimeType: "text/html", body: { data: b64url(m.parsed.html) } }] : [])] } });
  }
  send(res, 404, { error: { message: "unknown " + u.pathname } });
}).listen(9900, "127.0.0.1", () => console.log("mock google on :9900"));
