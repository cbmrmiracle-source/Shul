import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { USER_ACTION_SCRIPT } from "./snapshot.mjs";

// Record mode: everything a site does while you (or Claude) use it, saved to
// recordings/<session>/:
//   requests.jsonl   one line per request (headers, post data, status, timing, body file)
//   bodies/          response bodies
//   scripts/         every JavaScript file + scripts.json index
//   websockets.jsonl frames sent/received
//   console.jsonl    console + page errors
//   actions.jsonl    the human's clicks / typing / submits, and navigations
//   pages/           HTML of every open page at stop time
//   cookies.json     cookies at stop time
//   analysis.json    endpoint map, auth, third parties (also returned by record_stop)

const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-amz-access-token|x-auth-token|x-csrf-token|x-xsrf-token|.*token.*|.*secret.*|.*session.*)$/i;
const SKIP_BODY_TYPES = new Set(["image", "media", "font"]);
const API_TYPES = new Set(["xhr", "fetch", "eventsource", "websocket"]);

export function mask(value) {
  const v = String(value ?? "");
  return v.length <= 8 ? "••••" : `${v.slice(0, 6)}…(${v.length} chars)`;
}

export function maskHeaders(h = {}, reveal = false) {
  if (reveal) return h;
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET_HEADER.test(k) ? (k.toLowerCase() === "cookie" ? maskCookieHeader(v) : mask(v)) : v]));
}

function maskCookieHeader(v) {
  return String(v).split(/;\s*/).map((c) => { const i = c.indexOf("="); return i < 0 ? c : `${c.slice(0, i)}=${mask(c.slice(i + 1))}`; }).join("; ");
}

const safeName = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);

function extFor(ct = "", type) {
  if (/json/.test(ct)) return "json";
  if (/javascript|ecmascript/.test(ct) || type === "script") return "js";
  if (/html/.test(ct)) return "html";
  if (/css/.test(ct)) return "css";
  if (/xml/.test(ct)) return "xml";
  if (/text/.test(ct)) return "txt";
  return "bin";
}

function normalizePath(p) {
  return p
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return "{id}";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return "{uuid}";
      if (/^[0-9a-f]{16,}$/i.test(seg)) return "{hex}";
      if (seg.length >= 20 && /\d/.test(seg) && /^[A-Za-z0-9_\-=.]+$/.test(seg)) return "{token}";
      if (/^B0[0-9A-Z]{8}$/.test(seg)) return "{asin}";
      return seg;
    })
    .join("/");
}

const baseDomain = (host) => host.split(".").slice(-2).join(".");

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export class Recorder {
  constructor(mgr, dir) {
    this.mgr = mgr;
    this.dir = dir;
    this.active = null;
    this.instrumented = new WeakSet();
    fs.mkdirSync(dir, { recursive: true });
  }

  sessionDir(name) {
    const d = path.join(this.dir, safeName(name));
    if (!fs.existsSync(d)) throw new Error(`No recording "${name}". Use browser_record_list.`);
    return d;
  }

  async start(a = {}) {
    if (this.active) throw new Error(`Already recording "${this.active.name}". Stop it first.`);
    await this.mgr.ensure();
    const contextId = a.contextId || "main";
    const c = this.mgr.contexts.get(contextId);
    if (!c) throw new Error(`No context ${contextId}`);
    const name = safeName(a.name || `rec-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    const dir = path.join(this.dir, name);
    for (const sub of ["bodies", "scripts", "pages"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    const rec = {
      name, dir, contextId, ctx: c.ctx, count: 0, startedAt: new Date().toISOString(),
      opts: { captureBodies: a.captureBodies !== false, maxBody: (a.maxBodyKB ?? 2048) * 1024, captureUserActions: a.captureUserActions !== false },
      scripts: {}, cleanups: [],
      write: (file, obj) => fs.appendFileSync(path.join(dir, file), JSON.stringify(obj) + "\n"),
    };
    this.active = rec;

    const onFinished = (req) => this.onRequestDone(rec, req, null);
    const onFailed = (req) => this.onRequestDone(rec, req, req.failure()?.errorText || "failed");
    rec.ctx.on("requestfinished", onFinished);
    rec.ctx.on("requestfailed", onFailed);
    rec.cleanups.push(() => rec.ctx.off("requestfinished", onFinished), () => rec.ctx.off("requestfailed", onFailed));

    const hookPage = (page) => {
      const tabId = this.mgr.pageIds.get(page);
      const onConsole = (msg) => rec.write("console.jsonl", { ts: Date.now(), tabId, level: msg.type(), text: msg.text().slice(0, 4000), at: msg.location()?.url });
      const onError = (err) => rec.write("console.jsonl", { ts: Date.now(), tabId, level: "pageerror", text: String(err?.stack || err).slice(0, 4000) });
      const onNav = (frame) => { if (frame === page.mainFrame()) rec.write("actions.jsonl", { ts: Date.now(), tabId, type: "navigate", url: frame.url() }); };
      const onWs = (ws) => {
        const wsId = `ws${hash(ws.url() + Date.now())}`;
        rec.write("websockets.jsonl", { ts: Date.now(), wsId, event: "open", url: ws.url() });
        ws.on("framesent", (f) => rec.write("websockets.jsonl", { ts: Date.now(), wsId, dir: "sent", payload: String(f.payload).slice(0, 4000) }));
        ws.on("framereceived", (f) => rec.write("websockets.jsonl", { ts: Date.now(), wsId, dir: "received", payload: String(f.payload).slice(0, 4000) }));
        ws.on("close", () => rec.write("websockets.jsonl", { ts: Date.now(), wsId, event: "close" }));
      };
      page.on("console", onConsole);
      page.on("pageerror", onError);
      page.on("framenavigated", onNav);
      page.on("websocket", onWs);
      rec.cleanups.push(() => { page.off("console", onConsole); page.off("pageerror", onError); page.off("framenavigated", onNav); page.off("websocket", onWs); });
    };
    for (const p of rec.ctx.pages()) hookPage(p);
    rec.ctx.on("page", hookPage);
    rec.cleanups.push(() => rec.ctx.off("page", hookPage));

    if (rec.opts.captureUserActions) {
      if (!this.instrumented.has(rec.ctx)) {
        this.instrumented.add(rec.ctx);
        await rec.ctx.exposeBinding("__claudeRecord", (source, ev) => {
          if (this.active?.ctx === rec.ctx) this.active.write("actions.jsonl", { ts: Date.now(), tabId: this.mgr.pageIds.get(source.page), url: source.page.url(), ...ev });
        });
        await rec.ctx.addInitScript(USER_ACTION_SCRIPT);
      }
      for (const p of rec.ctx.pages()) await p.evaluate(USER_ACTION_SCRIPT).catch(() => {});
    }
    return { recording: name, folder: dir, context: contextId, note: "Browse now (any tab in this context). Call browser_record_stop when done." };
  }

  async onRequestDone(rec, req, failure) {
    if (this.active !== rec) return;
    const id = this.mgr.requestId(req);
    const type = req.resourceType();
    let tabId;
    try { tabId = this.mgr.pageIds.get(req.frame().page()); } catch { /* service worker request */ }
    const entry = { id, ts: Date.now(), tabId, method: req.method(), url: req.url(), type, failure };
    try {
      entry.requestHeaders = await req.allHeaders();
      const post = req.postData();
      if (post) entry.postData = post.length > 200_000 ? post.slice(0, 200_000) + "…" : post;
      entry.redirectedFrom = req.redirectedFrom()?.url();
      const res = failure ? null : await req.response();
      if (res) {
        entry.status = res.status();
        entry.responseHeaders = await res.allHeaders();
        entry.timing = req.timing();
        const ct = entry.responseHeaders["content-type"] || "";
        if (rec.opts.captureBodies && !SKIP_BODY_TYPES.has(type) && (entry.status < 300 || entry.status >= 400)) {
          const buf = await res.body().catch(() => null);
          if (buf) {
            entry.bodySize = buf.length;
            if (buf.length <= rec.opts.maxBody) {
              const file = `bodies/${id}.${extFor(ct, type)}`;
              fs.writeFileSync(path.join(rec.dir, file), buf);
              entry.bodyFile = file;
              if (type === "script" || /javascript/.test(ct)) {
                const u = new URL(req.url());
                const sfile = `scripts/${safeName(u.hostname + u.pathname).slice(-70)}_${hash(req.url())}.js`;
                fs.writeFileSync(path.join(rec.dir, sfile), buf);
                rec.scripts[req.url()] = { file: sfile, bytes: buf.length };
                fs.writeFileSync(path.join(rec.dir, "scripts", "scripts.json"), JSON.stringify(rec.scripts, null, 2));
              }
            }
          }
        }
      }
    } catch (e) {
      entry.captureError = e.message;
    }
    rec.count++;
    rec.write("requests.jsonl", entry);
  }

  async stopIfActive() {
    if (this.active) await this.stop({});
  }

  async stop(a = {}) {
    const rec = this.active;
    if (!rec) throw new Error("Not recording.");
    if (a.session && a.session !== rec.name) throw new Error(`Active recording is "${rec.name}".`);
    await new Promise((r) => setTimeout(r, 800)); // let in-flight bodies land
    for (const fn of rec.cleanups) { try { fn(); } catch {} }
    this.active = null;
    let i = 0;
    for (const p of rec.ctx.pages()) {
      const html = await p.content().catch(() => null);
      if (html) fs.writeFileSync(path.join(rec.dir, "pages", `${++i}-${safeName(new URL(p.url()).hostname || "blank")}.html`), html);
    }
    fs.writeFileSync(path.join(rec.dir, "cookies.json"), JSON.stringify(await rec.ctx.cookies().catch(() => []), null, 2));
    fs.writeFileSync(path.join(rec.dir, "meta.json"), JSON.stringify({ name: rec.name, context: rec.contextId, startedAt: rec.startedAt, stoppedAt: new Date().toISOString(), requests: rec.count }, null, 2));
    const analysis = this.analyze(rec.dir, false);
    fs.writeFileSync(path.join(rec.dir, "analysis.json"), JSON.stringify(analysis, null, 2));
    return { session: rec.name, folder: rec.dir, ...analysis };
  }

  list() {
    return fs.readdirSync(this.dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(this.dir, d.name, "meta.json"), "utf8")); } catch { meta = { status: this.active?.name === d.name ? "recording" : "incomplete" }; }
      return { session: d.name, ...meta };
    });
  }

  analyzeSession(name, reveal) {
    return this.analyze(this.sessionDir(name), reveal);
  }

  analyze(dir, reveal) {
    const reqs = readJsonl(path.join(dir, "requests.jsonl"));
    const actions = readJsonl(path.join(dir, "actions.jsonl"));
    const wsFrames = readJsonl(path.join(dir, "websockets.jsonl"));
    const consoleLog = readJsonl(path.join(dir, "console.jsonl"));
    let scripts = {};
    try { scripts = JSON.parse(fs.readFileSync(path.join(dir, "scripts", "scripts.json"), "utf8")); } catch {}

    const firstDoc = reqs.find((r) => r.type === "document");
    const firstParty = firstDoc ? baseDomain(new URL(firstDoc.url).hostname) : null;
    const byType = {};
    const domains = {};
    for (const r of reqs) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      const h = new URL(r.url).hostname;
      domains[h] ??= { requests: 0, bytes: 0, firstParty: baseDomain(h) === firstParty };
      domains[h].requests++;
      domains[h].bytes += r.bodySize ?? 0;
    }

    const isApi = (r) => API_TYPES.has(r.type) || (r.method !== "GET" && r.type !== "document") || /json|graphql|protobuf/.test(r.responseHeaders?.["content-type"] ?? "");
    const endpoints = {};
    const authHeaders = {};
    const cookieNames = new Set();
    for (const r of reqs.filter(isApi)) {
      const u = new URL(r.url);
      const key = `${r.method} ${u.host}${normalizePath(u.pathname)}`;
      const ep = (endpoints[key] ??= { calls: 0, statuses: [], sampleIds: [], queryKeys: [], requestBodyKeys: [], responseKeys: [], contentType: undefined, graphqlOperations: [] });
      ep.calls++;
      if (r.status && !ep.statuses.includes(r.status)) ep.statuses.push(r.status);
      if (ep.sampleIds.length < 3) ep.sampleIds.push(r.id);
      for (const k of u.searchParams.keys()) if (!ep.queryKeys.includes(k)) ep.queryKeys.push(k);
      ep.contentType ??= r.responseHeaders?.["content-type"]?.split(";")[0];
      if (r.postData) {
        try {
          const body = JSON.parse(r.postData);
          const items = Array.isArray(body) ? body : [body];
          for (const b of items) {
            if (b && typeof b === "object") {
              for (const k of Object.keys(b)) if (!ep.requestBodyKeys.includes(k) && ep.requestBodyKeys.length < 30) ep.requestBodyKeys.push(k);
              const op = b.operationName || (typeof b.query === "string" && b.query.match(/^\s*(query|mutation|subscription)\s+(\w+)/)?.slice(1).join(" "));
              if (op && !ep.graphqlOperations.includes(op)) ep.graphqlOperations.push(op);
            }
          }
        } catch {
          if (/=/.test(r.postData)) for (const k of new URLSearchParams(r.postData).keys()) if (!ep.requestBodyKeys.includes(k) && ep.requestBodyKeys.length < 30) ep.requestBodyKeys.push(k);
        }
      }
      if (r.bodyFile && ep.responseKeys.length === 0 && /json/.test(ep.contentType ?? "")) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(dir, r.bodyFile), "utf8"));
          ep.responseKeys = Array.isArray(j) ? [`[array of ${j.length}]`, ...Object.keys(j[0] ?? {}).slice(0, 20)] : Object.keys(j).slice(0, 30);
        } catch {}
      }
      for (const [k, v] of Object.entries(r.requestHeaders ?? {})) {
        const lk = k.toLowerCase();
        if (lk === "cookie") { String(v).split(/;\s*/).forEach((c) => cookieNames.add(c.split("=")[0])); continue; }
        if (SECRET_HEADER.test(lk) || lk.startsWith("x-")) {
          authHeaders[lk] ??= { hosts: [], example: reveal ? v : (SECRET_HEADER.test(lk) ? (lk === "authorization" ? `${String(v).split(" ")[0]} ${mask(String(v).split(" ")[1])}` : mask(v)) : String(v).slice(0, 60)) };
          if (!authHeaders[lk].hosts.includes(u.host)) authHeaders[lk].hosts.push(u.host);
        }
      }
    }
    const setCookies = new Set();
    for (const r of reqs) {
      const sc = r.responseHeaders?.["set-cookie"];
      if (sc) String(sc).split("\n").forEach((c) => setCookies.add(`${c.split("=")[0]} (${new URL(r.url).hostname})`));
    }
    const wsConns = {};
    for (const f of wsFrames) {
      const w = (wsConns[f.wsId] ??= { url: undefined, sent: 0, received: 0, samples: [] });
      if (f.event === "open") w.url = f.url;
      if (f.dir) { w[f.dir]++; if (w.samples.length < 3) w.samples.push(`${f.dir}: ${f.payload.slice(0, 300)}`); }
    }

    return {
      summary: {
        requests: reqs.length, firstParty, byType,
        apiEndpoints: Object.keys(endpoints).length, scripts: Object.keys(scripts).length,
        websockets: Object.keys(wsConns).length, userActions: actions.filter((a) => a.type !== "navigate").length,
        consoleErrors: consoleLog.filter((c) => c.level === "error" || c.level === "pageerror").length,
      },
      endpoints: Object.fromEntries(Object.entries(endpoints).sort((a, b) => b[1].calls - a[1].calls).slice(0, 150)),
      auth: { headers: authHeaders, cookiesSentToApis: [...cookieNames].slice(0, 80), cookiesSet: [...setCookies].slice(0, 80) },
      domains: Object.fromEntries(Object.entries(domains).sort((a, b) => b[1].requests - a[1].requests).slice(0, 60)),
      scripts: Object.entries(scripts).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40).map(([url, s]) => ({ url: url.slice(0, 200), file: s.file, kb: Math.round(s.bytes / 1024) })),
      websockets: Object.values(wsConns),
      userActions: actions.slice(0, 200).map((a) => ({ type: a.type, url: a.url, key: a.key, value: a.value, target: a.target?.text || a.target?.path })),
      tips: "browser_record_query to search requests, browser_record_get for a request's full headers/bodies or a script's source (grep for function names, endpoints, keys).",
    };
  }

  query(a) {
    const dir = this.sessionDir(a.session);
    let reqs = readJsonl(path.join(dir, "requests.jsonl"));
    if (a.urlContains) reqs = reqs.filter((r) => r.url.includes(a.urlContains));
    if (a.method) reqs = reqs.filter((r) => r.method === a.method.toUpperCase());
    if (a.resourceType) reqs = reqs.filter((r) => r.type === a.resourceType);
    if (a.status) reqs = reqs.filter((r) => r.status === a.status);
    if (a.bodyContains) {
      reqs = reqs.filter((r) => {
        if (r.postData?.includes(a.bodyContains)) return true;
        if (!r.bodyFile) return false;
        try { return fs.readFileSync(path.join(dir, r.bodyFile), "utf8").includes(a.bodyContains); } catch { return false; }
      });
    }
    const offset = a.offset ?? 0;
    const limit = a.limit ?? 50;
    return {
      total: reqs.length, offset,
      requests: reqs.slice(offset, offset + limit).map((r) => ({ id: r.id, method: r.method, url: r.url.length > 250 ? r.url.slice(0, 250) + "…" : r.url, type: r.type, status: r.status, bytes: r.bodySize, failure: r.failure })),
    };
  }

  get(a) {
    const dir = this.sessionDir(a.session);
    const max = a.maxChars ?? 30_000;
    const offset = a.offset ?? 0;
    const cut = (s) => (s.length - offset > max ? s.slice(offset, offset + max) + `\n…[${s.length - offset - max} more chars — use offset]` : s.slice(offset));
    if (a.script) {
      const scripts = JSON.parse(fs.readFileSync(path.join(dir, "scripts", "scripts.json"), "utf8"));
      const hit = Object.entries(scripts).find(([url, s]) => s.file.includes(a.script) || url.includes(a.script));
      if (!hit) throw new Error(`No script matching "${a.script}".`);
      const src = fs.readFileSync(path.join(dir, hit[1].file), "utf8");
      if (a.grep) {
        const re = new RegExp(a.grep, "g");
        const matches = [];
        let mt;
        while ((mt = re.exec(src)) && matches.length < 60) {
          matches.push({ at: mt.index, snippet: src.slice(Math.max(0, mt.index - 200), mt.index + 300) });
          if (mt.index === re.lastIndex) re.lastIndex++;
        }
        return { url: hit[0], bytes: src.length, matches };
      }
      return { url: hit[0], bytes: src.length, source: cut(src) };
    }
    const r = readJsonl(path.join(dir, "requests.jsonl")).find((x) => x.id === a.requestId);
    if (!r) throw new Error(`No request ${a.requestId} in ${a.session}.`);
    let body;
    if (r.bodyFile) {
      const buf = fs.readFileSync(path.join(dir, r.bodyFile));
      body = r.bodyFile.endsWith(".bin") ? `<binary ${buf.length} bytes at ${r.bodyFile}>` : cut(buf.toString("utf8"));
    }
    return { ...r, requestHeaders: maskHeaders(r.requestHeaders, a.revealSecrets), responseHeaders: maskHeaders(r.responseHeaders, a.revealSecrets), postData: r.postData && cut(r.postData), responseBody: body };
  }
}
