import { chromium, devices } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { pointInBox, humanMove, humanClick, humanType, humanWheel, sleep } from "./human.mjs";
import { pageSnapshot } from "./snapshot.mjs";
import { Recorder, maskHeaders } from "./recorder.mjs";

const SETTING_KEYS = ["headless", "width", "height", "deviceScaleFactor", "proxy", "userAgent", "locale", "timezoneId", "extraArgs", "channel", "executablePath"];

// Keep pages running at full speed even when the window is hidden, minimized or the screen is locked.
const BASE_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
  "--no-first-run",
  "--no-default-browser-check",
];

const NET_LIMIT = 500;
const API_TYPES = new Set(["xhr", "fetch", "websocket", "eventsource"]);

export class BrowserManager {
  constructor(config, baseDir) {
    this.config = config;
    this.baseDir = baseDir;
    this.dir = (p) => path.resolve(baseDir, p);
    this.settingsFile = this.dir("settings.local.json");
    this.settings = { ...pick(config, SETTING_KEYS), ...readJson(this.settingsFile) };
    this.main = null; // persistent context (your normal logged-in profile)
    this.extraBrowser = null; // for incognito / proxy / custom contexts
    this.contexts = new Map(); // id -> { ctx, incognito, label }
    this.tabs = new Map(); // id -> tab state
    this.pageIds = new WeakMap();
    this.reqIds = new WeakMap();
    this.counters = { tab: 0, ctx: 0, req: 0 };
    this.activeTabId = null;
    this.downloads = [];
    this.dialogs = { mode: "accept", promptText: undefined, log: [] };
    this.recorder = new Recorder(this, this.dir(config.recordingsDir || "./recordings"));
    this.downloadsDir = this.dir(config.downloadsDir || "./downloads");
    fs.mkdirSync(this.downloadsDir, { recursive: true });
  }

  launchOptions(s) {
    const width = s.width || 1920;
    const height = s.height || 1080;
    return {
      headless: !!s.headless,
      ...(s.executablePath ? { executablePath: s.executablePath } : { channel: s.channel || "chrome" }),
      args: [...BASE_ARGS, `--window-size=${width},${height + 140}`, ...(s.extraArgs || [])],
      ignoreDefaultArgs: ["--enable-automation"],
    };
  }

  contextOptions(s) {
    const width = s.width || 1920;
    const height = s.height || 1080;
    return {
      viewport: { width, height },
      screen: { width, height },
      deviceScaleFactor: s.deviceScaleFactor || 1,
      acceptDownloads: true,
      ...(s.proxy ? { proxy: s.proxy } : {}),
      ...(s.userAgent ? { userAgent: s.userAgent } : {}),
      ...(s.locale ? { locale: s.locale } : {}),
      ...(s.timezoneId ? { timezoneId: s.timezoneId } : {}),
    };
  }

  get attached() {
    return !!this.config.cdpUrl;
  }

  async ensure() {
    if (this.main) return;
    if (this.attached) {
      // Attach mode: drive the Chrome you opened yourself (open-chrome.cmd / .sh). We never close it.
      const browser = await chromium.connectOverCDP(this.config.cdpUrl).catch((e) => {
        throw new Error(`Can't reach Chrome at ${this.config.cdpUrl} — open it with open-chrome.cmd (or open-chrome.sh) first. (${e.message.split("\n")[0]})`);
      });
      this.extraBrowser = browser;
      this.main = browser.contexts()[0];
      browser.on("disconnected", () => {
        this.main = null;
        this.extraBrowser = null;
        this.contexts.clear();
        this.tabs.clear();
        this.activeTabId = null;
      });
      this.attachContext(this.main, "main", { incognito: false, label: "your Chrome window" });
      return;
    }
    const profile = this.dir(this.config.profileDir || "./profile");
    fs.mkdirSync(profile, { recursive: true });
    this.main = await chromium.launchPersistentContext(profile, { ...this.launchOptions(this.settings), ...this.contextOptions(this.settings) });
    this.main.on("close", () => {
      this.contexts.delete("main");
      this.main = null;
      for (const [id, t] of this.tabs) if (t.contextId === "main") this.tabs.delete(id);
    });
    this.attachContext(this.main, "main", { incognito: false, label: "main profile" });
  }

  async ensureExtraBrowser() {
    if (this.extraBrowser?.isConnected()) return this.extraBrowser;
    if (this.attached) {
      await this.ensure();
      return this.extraBrowser;
    }
    this.extraBrowser = await chromium.launch(this.launchOptions(this.settings));
    return this.extraBrowser;
  }

  attachContext(ctx, id, meta) {
    this.contexts.set(id, { ctx, ...meta });
    ctx.on("page", (p) => this.registerPage(p, id));
    for (const p of ctx.pages()) this.registerPage(p, id);
    ctx.on("close", () => this.contexts.delete(id));
  }

  registerPage(page, contextId) {
    const existing = this.pageIds.get(page);
    if (existing) return existing;
    const id = `t${++this.counters.tab}`;
    this.pageIds.set(page, id);
    const tab = { id, page, contextId, net: [], console: [], mouse: null };
    this.tabs.set(id, tab);
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) this.activeTabId = id;

    page.on("request", (req) => {
      const rid = this.requestId(req);
      tab.net.push({ id: rid, method: req.method(), url: req.url(), type: req.resourceType(), started: Date.now(), req });
      if (tab.net.length > NET_LIMIT) tab.net.shift();
    });
    page.on("requestfinished", async (req) => {
      const e = tab.net.find((n) => n.req === req);
      if (!e) return;
      const res = await req.response().catch(() => null);
      e.status = res?.status();
      e.ms = Date.now() - e.started;
      const sizes = await req.sizes().catch(() => null);
      if (sizes) e.size = sizes.responseBodySize;
    });
    page.on("requestfailed", (req) => {
      const e = tab.net.find((n) => n.req === req);
      if (e) e.failure = req.failure()?.errorText;
    });
    page.on("console", (m) => {
      tab.console.push({ ts: new Date().toISOString(), level: m.type(), text: m.text().slice(0, 2000), at: m.location()?.url });
      if (tab.console.length > 500) tab.console.shift();
    });
    page.on("pageerror", (err) => tab.console.push({ ts: new Date().toISOString(), level: "pageerror", text: String(err?.stack || err).slice(0, 2000) }));
    page.on("dialog", async (d) => {
      this.dialogs.log.push({ ts: new Date().toISOString(), tab: id, type: d.type(), message: d.message(), handled: this.dialogs.mode });
      if (this.dialogs.log.length > 50) this.dialogs.log.shift();
      try {
        if (this.dialogs.mode === "accept") await d.accept(this.dialogs.promptText);
        else await d.dismiss();
      } catch { /* already handled */ }
    });
    page.on("download", async (dl) => {
      const file = path.join(this.downloadsDir, `${Date.now()}-${dl.suggestedFilename()}`);
      const entry = { ts: new Date().toISOString(), url: dl.url(), file, status: "downloading" };
      this.downloads.push(entry);
      try {
        await dl.saveAs(file);
        entry.status = "done";
        entry.bytes = fs.statSync(file).size;
      } catch (e) {
        entry.status = `failed: ${e.message}`;
      }
    });
    page.on("close", () => {
      this.tabs.delete(id);
      if (this.activeTabId === id) this.activeTabId = [...this.tabs.keys()].pop() ?? null;
    });
    return id;
  }

  requestId(req) {
    let id = this.reqIds.get(req);
    if (!id) {
      id = `r${++this.counters.req}`;
      this.reqIds.set(req, id);
    }
    return id;
  }

  async tab(tabId) {
    await this.ensure();
    if (tabId) {
      const t = this.tabs.get(tabId);
      if (!t) throw new Error(`No tab ${tabId}. Open tabs: ${[...this.tabs.keys()].join(", ") || "none"}`);
      return t;
    }
    let t = this.activeTabId && this.tabs.get(this.activeTabId);
    if (!t) {
      const page = this.main.pages()[0] ?? (await this.main.newPage());
      t = this.tabs.get(this.registerPage(page, "main"));
      this.activeTabId = t.id;
    }
    return t;
  }

  async shutdown() {
    await this.recorder.stopIfActive().catch(() => {});
    for (const [id, c] of this.contexts) if (id !== "main") await c.ctx.close().catch(() => {});
    if (this.attached) {
      // Only disconnect — your Chrome window and its tabs stay open.
      await this.extraBrowser?.close().catch(() => {});
    } else {
      await this.main?.close().catch(() => {});
      await this.extraBrowser?.close().catch(() => {});
    }
    this.main = null;
    this.extraBrowser = null;
    this.contexts.clear();
    this.tabs.clear();
    this.activeTabId = null;
  }
}

// ---------------------------------------------------------------- helpers

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined && obj[k] !== null).map((k) => [k, obj[k]]));
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function locatorFor(page, a) {
  if (a.ref) return page.locator(`[data-cref="${a.ref}"]`).first();
  if (a.selector) return page.locator(a.selector).first();
  if (a.text) return page.getByText(a.text).first();
  return null;
}

async function requireLocator(page, a) {
  const loc = locatorFor(page, a);
  if (!loc) throw new Error("Say which element: ref (from browser_snapshot), selector, or text.");
  if ((await loc.count()) === 0) {
    throw new Error(a.ref ? `Element ref ${a.ref} not found — the page changed; call browser_snapshot again.` : `No element matches ${a.selector ?? a.text}.`);
  }
  return loc;
}

async function pointFor(page, a) {
  if (typeof a.x === "number" && typeof a.y === "number") return { x: a.x, y: a.y };
  const loc = await requireLocator(page, a);
  await loc.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
  const box = await loc.boundingBox();
  if (!box) throw new Error("Element has no visible box (hidden or detached).");
  return pointInBox(box);
}

async function pageInfo(page) {
  return { url: page.url(), title: await page.title().catch(() => "") };
}

const modKey = process.platform === "darwin" ? "Meta" : "Control";

async function settle(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
}

// ---------------------------------------------------------------- actions
// Each action receives (mgr, args) and returns JSON or MCP content {content:[…]}.

export const actions = {
  async status(m) {
    return {
      launched: !!m.main,
      mode: m.attached ? `attached to your Chrome at ${m.config.cdpUrl}` : m.settings.headless ? "Chrome, headless" : "Chrome, visible window",
      settings: m.settings,
      activeTabId: m.activeTabId,
      contexts: [...m.contexts].map(([id, c]) => ({ id, incognito: c.incognito, label: c.label })),
      tabs: await actions.tabs(m, {}, true),
      recording: m.recorder.active ? { name: m.recorder.active.name, requests: m.recorder.active.count } : null,
    };
  },

  async launch(m, a) {
    if (m.attached) {
      if (a.width && a.height) {
        const t = await m.tab();
        await t.page.setViewportSize({ width: a.width, height: a.height });
      }
      return { attached: m.config.cdpUrl, note: "Attached to your own Chrome: headless/proxy/flags are set by how Chrome was opened (open-chrome script). Use browser_tab_new {proxy} or {incognito} for per-tab settings, browser_set_viewport for size." };
    }
    const next = { ...m.settings };
    for (const k of SETTING_KEYS) if (a[k] !== undefined) next[k] = a[k];
    await m.shutdown();
    m.settings = next;
    fs.writeFileSync(m.settingsFile, JSON.stringify(next, null, 2));
    await m.ensure();
    return { launched: true, settings: next };
  },

  async shutdown(m) {
    await m.shutdown();
    return m.attached ? { disconnected: true, note: "Your Chrome stays open." } : { closed: true };
  },

  async tabs(m, _a, noEnsure) {
    if (!noEnsure) await m.ensure();
    const out = [];
    for (const [id, t] of m.tabs) {
      out.push({ tabId: id, active: id === m.activeTabId, context: t.contextId, incognito: !!m.contexts.get(t.contextId)?.incognito, ...(await pageInfo(t.page)) });
    }
    return out;
  },

  async tab_new(m, a) {
    await m.ensure();
    let contextId = a.contextId;
    let ctx;
    if (contextId) {
      ctx = m.contexts.get(contextId)?.ctx;
      if (!ctx) throw new Error(`No context ${contextId}`);
    } else if (a.incognito || a.proxy || a.userAgent || a.width || a.height || a.locale || a.timezoneId || a.geolocation || a.mobile) {
      const browser = await m.ensureExtraBrowser();
      const opts = m.contextOptions({ ...m.settings, proxy: a.proxy, userAgent: a.userAgent ?? m.settings.userAgent, width: a.width ?? m.settings.width, height: a.height ?? m.settings.height, locale: a.locale ?? m.settings.locale, timezoneId: a.timezoneId ?? m.settings.timezoneId });
      if (!a.proxy) delete opts.proxy;
      if (a.mobile) Object.assign(opts, devices["iPhone 13"]);
      if (a.geolocation) Object.assign(opts, { geolocation: a.geolocation, permissions: ["geolocation"] });
      ctx = await browser.newContext(opts);
      contextId = `c${++m.counters.ctx}`;
      m.attachContext(ctx, contextId, { incognito: true, label: [a.proxy && `proxy ${a.proxy.server}`, a.mobile && "mobile"].filter(Boolean).join(", ") || "incognito" });
    } else {
      contextId = "main";
      ctx = m.main;
    }
    const page = await ctx.newPage();
    const tabId = m.registerPage(page, contextId);
    m.activeTabId = tabId;
    if (a.url) await page.goto(a.url, { waitUntil: "load", timeout: 45_000 }).catch((e) => ({ error: e.message }));
    return { tabId, contextId, ...(await pageInfo(page)) };
  },

  async tab_select(m, a) {
    const t = await m.tab(a.tabId);
    await t.page.bringToFront();
    m.activeTabId = t.id;
    return { tabId: t.id, ...(await pageInfo(t.page)) };
  },

  async tab_close(m, a) {
    await m.ensure();
    const ids = a.all ? [...m.tabs.keys()] : a.allExcept ? [...m.tabs.keys()].filter((id) => id !== a.allExcept) : [a.tabId ?? m.activeTabId];
    // Keep the persistent window alive: never close its very last page, replace it with a blank one.
    for (const id of ids) {
      const t = m.tabs.get(id);
      if (!t) continue;
      if (t.contextId === "main" && m.main.pages().length === 1) await m.main.newPage();
      await t.page.close().catch(() => {});
    }
    return { closed: ids, remaining: await actions.tabs(m, {}, true) };
  },

  async context_close(m, a) {
    if (a.contextId === "main") throw new Error("Use browser_shutdown to close the main profile.");
    const c = m.contexts.get(a.contextId);
    if (!c) throw new Error(`No context ${a.contextId}`);
    await c.ctx.close();
    return { closed: a.contextId };
  },

  async navigate(m, a) {
    const t = await m.tab(a.tabId);
    const res = await t.page.goto(a.url, { waitUntil: a.waitUntil || "load", timeout: (a.timeoutSec ?? 45) * 1000 });
    return { status: res?.status(), ...(await pageInfo(t.page)) };
  },

  async history(m, a) {
    const t = await m.tab(a.tabId);
    const opts = { waitUntil: "load", timeout: 45_000 };
    if (a.action === "back") await t.page.goBack(opts);
    else if (a.action === "forward") await t.page.goForward(opts);
    else await t.page.reload(opts);
    return pageInfo(t.page);
  },

  async snapshot(m, a) {
    const t = await m.tab(a.tabId);
    const snap = await t.page.evaluate(pageSnapshot, { viewportOnly: !!a.viewportOnly });
    const mode = a.mode || "both";
    const lines = [`URL: ${snap.url}`, `Title: ${snap.title}`, `Viewport ${snap.viewport.width}x${snap.viewport.height}, scrolled ${snap.scroll.y}/${snap.scroll.maxY}px`, `Tab: ${t.id}`];
    if (mode !== "text") {
      lines.push("", "Interactive elements (use ref with click/type/etc; * = off-screen):");
      for (const e of snap.elements) {
        const extra = [e.value !== undefined && `value="${e.value}"`, e.checked !== undefined && `checked=${e.checked}`, e.placeholder && `placeholder="${e.placeholder}"`, e.href && `→ ${e.href}`, e.disabled && "disabled"].filter(Boolean).join(" ");
        lines.push(`[${e.ref}]${e.inView ? "" : "*"} ${e.role} "${e.name}"${extra ? " " + extra : ""}`);
      }
    }
    if (mode !== "interactive") {
      const max = a.maxChars ?? 15000;
      lines.push("", "Page text:", snap.text.length > max ? snap.text.slice(0, max) + `\n…[${snap.text.length - max} more chars]` : snap.text);
    }
    return lines.join("\n");
  },

  async screenshot(m, a) {
    const t = await m.tab(a.tabId);
    const type = a.format === "png" ? "png" : "jpeg";
    const opts = { type, ...(type === "jpeg" ? { quality: a.quality ?? 70 } : {}), timeout: 30_000 };
    let buf;
    if (a.ref || a.selector) buf = await (await requireLocator(t.page, a)).screenshot(opts);
    else buf = await t.page.screenshot({ ...opts, fullPage: !!a.fullPage });
    const info = await pageInfo(t.page);
    return { content: [{ type: "image", data: buf.toString("base64"), mimeType: `image/${type}` }, { type: "text", text: `${t.id}: ${info.title} — ${info.url}` }] };
  },

  async click(m, a) {
    const t = await m.tab(a.tabId);
    const page = t.page;
    const before = m.tabs.size;
    const mods = [...(a.modifiers || []), ...(a.newTab ? [modKey] : [])];
    if (a.human === false && !(typeof a.x === "number")) {
      const loc = await requireLocator(page, a);
      await loc.click({ button: a.button, clickCount: a.clickCount, modifiers: mods, force: a.force, timeout: 15_000 });
    } else {
      const p = await pointFor(page, a);
      for (const k of mods) await page.keyboard.down(k);
      if (a.human === false) await page.mouse.click(p.x, p.y, { button: a.button, clickCount: a.clickCount });
      else await humanClick(page, t, p.x, p.y, { button: a.button, clickCount: a.clickCount ?? 1 });
      for (const k of mods.reverse()) await page.keyboard.up(k);
    }
    await sleep(400);
    await settle(page);
    const newTabs = [...m.tabs.keys()].slice(before);
    return { ...(await pageInfo(page)), ...(newTabs.length ? { newTabs } : {}) };
  },

  async hover(m, a) {
    const t = await m.tab(a.tabId);
    const p = await pointFor(t.page, a);
    if (a.human === false) await t.page.mouse.move(p.x, p.y);
    else await humanMove(t.page, t, p.x, p.y);
    t.mouse = p;
    return { hovered: p };
  },

  async type(m, a) {
    const t = await m.tab(a.tabId);
    const page = t.page;
    if (a.ref || a.selector) {
      const loc = await requireLocator(page, a);
      if (a.human === false) await loc.focus();
      else {
        const p = await pointFor(page, a);
        await humanClick(page, t, p.x, p.y);
      }
      if (a.clear) await loc.fill("");
    } else if (a.clear) {
      await page.keyboard.press(`${modKey}+A`);
      await page.keyboard.press("Backspace");
    }
    if (a.human === false) await page.keyboard.type(a.text);
    else await humanType(page, a.text);
    if (a.pressEnter) {
      await page.keyboard.press("Enter");
      await settle(page);
    }
    return { typed: a.text.length, ...(await pageInfo(page)) };
  },

  async press(m, a) {
    const t = await m.tab(a.tabId);
    for (let i = 0; i < (a.count ?? 1); i++) {
      await t.page.keyboard.press(a.key);
      if (a.count > 1) await sleep(60 + Math.random() * 80);
    }
    await settle(t.page);
    return pageInfo(t.page);
  },

  async select(m, a) {
    const t = await m.tab(a.tabId);
    const chosen = await (await requireLocator(t.page, a)).selectOption(a.values, { timeout: 10_000 });
    return { selected: chosen };
  },

  async check(m, a) {
    const t = await m.tab(a.tabId);
    await (await requireLocator(t.page, a)).setChecked(a.checked ?? true, { timeout: 10_000 });
    return { checked: a.checked ?? true };
  },

  async drag(m, a) {
    const t = await m.tab(a.tabId);
    const page = t.page;
    const from = await pointFor(page, a.from);
    const to = await pointFor(page, a.to);
    if (a.human === false) {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: a.steps ?? 20 });
      await page.mouse.up();
    } else {
      await humanMove(page, t, from.x, from.y);
      await sleep(80 + Math.random() * 120);
      await page.mouse.down();
      await sleep(100 + Math.random() * 150);
      await humanMove(page, t, to.x, to.y, a.steps);
      await sleep(80 + Math.random() * 120);
      await page.mouse.up();
    }
    return { from, to };
  },

  async scroll(m, a) {
    const t = await m.tab(a.tabId);
    const page = t.page;
    if ((a.ref || a.selector) && !a.within) {
      await (await requireLocator(page, a)).scrollIntoViewIfNeeded({ timeout: 10_000 });
    } else if (a.to) {
      if (a.human === false) await page.evaluate((to) => window.scrollTo(0, to === "top" ? 0 : document.documentElement.scrollHeight), a.to);
      else {
        const dist = await page.evaluate((to) => (to === "top" ? -scrollY : document.documentElement.scrollHeight - scrollY - innerHeight), a.to);
        await humanWheel(page, 0, dist);
      }
    } else {
      if (a.within) {
        const p = await pointFor(page, { ref: a.within });
        await page.mouse.move(p.x, p.y);
      } else if (!t.mouse) {
        const vp = page.viewportSize() ?? { width: 1200, height: 800 };
        await page.mouse.move(vp.width / 2, vp.height / 2);
      }
      if (a.human === false) await page.mouse.wheel(a.dx ?? 0, a.dy ?? 0);
      else await humanWheel(page, a.dx ?? 0, a.dy ?? 0);
    }
    await sleep(250);
    return page.evaluate(() => ({ x: Math.round(scrollX), y: Math.round(scrollY), maxY: document.documentElement.scrollHeight - innerHeight }));
  },

  async zoom(m, a) {
    const t = await m.tab(a.tabId);
    await t.page.evaluate((z) => (document.documentElement.style.zoom = String(z)), a.level);
    return { zoom: a.level };
  },

  async set_viewport(m, a) {
    const t = await m.tab(a.tabId);
    await t.page.setViewportSize({ width: a.width, height: a.height });
    return { width: a.width, height: a.height };
  },

  async mouse(m, a) {
    const t = await m.tab(a.tabId);
    const mo = t.page.mouse;
    switch (a.action) {
      case "move":
        if (a.human === false) await mo.move(a.x, a.y);
        else await humanMove(t.page, t, a.x, a.y);
        break;
      case "down": await mo.down({ button: a.button }); break;
      case "up": await mo.up({ button: a.button }); break;
      case "wheel": await mo.wheel(a.deltaX ?? 0, a.deltaY ?? 0); break;
      case "click":
        if (a.human === false) await mo.click(a.x, a.y, { button: a.button });
        else await humanClick(t.page, t, a.x, a.y, { button: a.button });
        break;
    }
    if (a.x !== undefined) t.mouse = { x: a.x, y: a.y };
    return { ok: true };
  },

  async wait(m, a) {
    const t = await m.tab(a.tabId);
    const page = t.page;
    const timeout = (a.timeoutSec ?? 30) * 1000;
    const state = a.gone ? "hidden" : "visible";
    if (a.selector) await page.locator(a.selector).first().waitFor({ state, timeout });
    if (a.text) await page.getByText(a.text).first().waitFor({ state, timeout });
    if (a.urlIncludes) await page.waitForURL((u) => u.toString().includes(a.urlIncludes), { timeout });
    if (a.networkIdle) await page.waitForLoadState("networkidle", { timeout });
    if (a.seconds) await sleep(a.seconds * 1000);
    return pageInfo(page);
  },

  async evaluate(m, a) {
    const t = await m.tab(a.tabId);
    const result = await t.page.evaluate(a.expression);
    return result === undefined ? "undefined" : result;
  },

  async content(m, a) {
    const t = await m.tab(a.tabId);
    const max = a.maxChars ?? 50_000;
    let out;
    if (a.selector) {
      const loc = await requireLocator(t.page, a);
      out = a.format === "html" ? await loc.evaluate((e) => e.outerHTML) : await loc.innerText();
    } else out = a.format === "html" ? await t.page.content() : await t.page.evaluate(() => document.body?.innerText ?? "");
    return out.length > max ? out.slice(0, max) + `\n…[${out.length - max} more chars]` : out;
  },

  async cookies(m, a) {
    const t = await m.tab(a.tabId);
    const ctx = t.page.context();
    switch (a.action) {
      case "get": return ctx.cookies(a.urls);
      case "set": await ctx.addCookies(a.cookies || []); return { set: (a.cookies || []).length };
      case "clear": await ctx.clearCookies(); return { cleared: true };
      case "localStorage": return t.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    }
    throw new Error("action must be get, set, clear or localStorage");
  },

  async upload(m, a) {
    const t = await m.tab(a.tabId);
    await (await requireLocator(t.page, a)).setInputFiles(a.paths);
    return { uploaded: a.paths };
  },

  async downloads(m) {
    return { folder: m.downloadsDir, files: m.downloads };
  },

  async dialogs(m, a) {
    if (a.mode) m.dialogs.mode = a.mode;
    if (a.promptText !== undefined) m.dialogs.promptText = a.promptText;
    return { mode: m.dialogs.mode, recent: m.dialogs.log.slice(-20) };
  },

  async emulate(m, a) {
    const t = await m.tab(a.tabId);
    const ctx = t.page.context();
    if (a.offline !== undefined) await ctx.setOffline(a.offline);
    if (a.extraHTTPHeaders) await ctx.setExtraHTTPHeaders(a.extraHTTPHeaders);
    if (a.geolocation) {
      await ctx.grantPermissions(["geolocation"]);
      await ctx.setGeolocation(a.geolocation);
    }
    if (a.colorScheme || a.media) await t.page.emulateMedia({ colorScheme: a.colorScheme, media: a.media });
    return { ok: true };
  },

  async block(m, a) {
    const t = await m.tab(a.tabId);
    if (a.clear) {
      await t.page.unrouteAll({ behavior: "ignoreErrors" });
      return { cleared: true };
    }
    for (const p of a.patterns || []) await t.page.route(p, (r) => r.abort());
    if (a.resourceTypes?.length) {
      const types = new Set(a.resourceTypes);
      await t.page.route("**/*", (r) => (types.has(r.request().resourceType()) ? r.abort() : r.fallback()));
    }
    return { blocking: { patterns: a.patterns, resourceTypes: a.resourceTypes } };
  },

  async network(m, a) {
    const t = await m.tab(a.tabId);
    let list = t.net;
    if (a.apiOnly) list = list.filter((n) => API_TYPES.has(n.type));
    if (a.resourceType) list = list.filter((n) => n.type === a.resourceType);
    if (a.method) list = list.filter((n) => n.method === a.method.toUpperCase());
    if (a.urlContains) list = list.filter((n) => n.url.includes(a.urlContains));
    return list.slice(-(a.limit ?? 100)).map(({ req, started, ...rest }) => ({ ...rest, url: rest.url.length > 300 ? rest.url.slice(0, 300) + "…" : rest.url }));
  },

  async request_detail(m, a) {
    const t = await m.tab(a.tabId);
    const e = t.net.find((n) => n.id === a.requestId);
    if (!e) throw new Error(`Request ${a.requestId} isn't in this tab's recent log.`);
    const max = a.maxBodyChars ?? 20_000;
    const req = e.req;
    const res = await req.response().catch(() => null);
    let body;
    if (res) {
      try {
        const buf = await res.body();
        const ct = res.headers()["content-type"] || "";
        body = /json|text|javascript|xml|html|graphql|x-www-form/.test(ct) ? buf.toString("utf8") : `<${buf.length} bytes ${ct}>`;
        if (body.length > max) body = body.slice(0, max) + `…[${body.length - max} more]`;
      } catch (err) {
        body = `<unavailable: ${err.message}>`;
      }
    }
    return {
      id: e.id, method: e.method, url: e.url, type: e.type, status: e.status,
      requestHeaders: maskHeaders(await req.allHeaders().catch(() => ({})), a.revealSecrets),
      requestBody: req.postData()?.slice(0, max),
      responseHeaders: res ? maskHeaders(await res.allHeaders().catch(() => ({})), a.revealSecrets) : undefined,
      responseBody: body,
      timing: req.timing(),
    };
  },

  async console(m, a) {
    const t = await m.tab(a.tabId);
    let list = t.console;
    if (a.level) list = list.filter((c) => c.level === a.level);
    return list.slice(-(a.limit ?? 100));
  },

  async pdf(m, a) {
    if (!m.settings.headless) throw new Error("PDF export only works in headless mode — browser_launch {headless:true} first.");
    const t = await m.tab(a.tabId);
    const file = a.path || path.join(m.downloadsDir, `page-${Date.now()}.pdf`);
    await t.page.pdf({ path: file, printBackground: true });
    return { file };
  },

  record_start: (m, a) => m.recorder.start(a),
  record_stop: (m, a) => m.recorder.stop(a),
  record_list: (m) => m.recorder.list(),
  record_analyze: (m, a) => m.recorder.analyzeSession(a.session, a.revealSecrets),
  record_query: (m, a) => m.recorder.query(a),
  record_get: (m, a) => m.recorder.get(a),
};
