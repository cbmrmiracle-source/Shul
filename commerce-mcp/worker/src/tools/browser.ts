import { type Tool, type Env, s, schema, ToolError } from "../mcp";

// Every browser_* tool is forwarded to the bridge agent running on the owner's
// computer (bridge/), through the BridgeHub Durable Object.

export async function hubFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  const stub = env.BRIDGE_HUB.get(env.BRIDGE_HUB.idFromName("hub"));
  return stub.fetch(`https://hub${path}`, init);
}

async function callBridge(env: Env, action: string, args: Record<string, unknown>) {
  const { computer, timeoutSec, ...rest } = args;
  const res = await hubFetch(env, "/call", {
    method: "POST",
    body: JSON.stringify({ computer, action, args: rest, timeoutMs: Math.min(Number(timeoutSec ?? 90), 600) * 1000 }),
  });
  const out: any = await res.json();
  if (!out.ok) throw new ToolError(out.error || "Bridge call failed");
  return out.result; // already MCP content ({content:[...]}) or plain JSON
}

// ---- shared argument shapes ----
const tab = { tabId: s.str("Tab id from browser_tabs (default: the active tab)") };
const target = {
  ref: s.str("Element ref from browser_snapshot, e.g. '12'"),
  selector: s.str("CSS / Playwright selector (text=…, role=button[name=…], xpath=…)"),
  text: s.str("Visible text to find (first match)"),
  x: s.num("Viewport X coordinate (use with y instead of an element)"),
  y: s.num("Viewport Y coordinate"),
};
const human = { human: s.bool("Human-like: curved mouse path, random offsets and delays (default true)") };
const point = s.obj("Element or point: {ref} | {selector} | {text} | {x, y}");

type Def = [name: string, description: string, props: Record<string, unknown>, required?: string[], readOnly?: boolean];

const defs: Def[] = [
  ["browser_status", "Connected computers, browser state, open contexts and tabs, recording status.", {}, [], true],
  ["browser_launch", "Starts or restarts Chrome on the computer with these settings (saved as the default). headless=true keeps working while the computer is locked or asleep-screen; width/height force the screen size.", {
    headless: s.bool("Run without a visible window (best when the computer is locked). Default from bridge config."),
    width: s.int("Viewport width in px (forced; default 1920)"),
    height: s.int("Viewport height in px (default 1080)"),
    deviceScaleFactor: s.num("Pixel ratio (1 = normal, 2 = retina)"),
    proxy: s.obj("Proxy for the main profile: {server:'http://host:port' | 'socks5://host:port', username?, password?, bypass?}"),
    userAgent: s.str("Override user agent"),
    locale: s.str("e.g. en-US"),
    timezoneId: s.str("e.g. America/New_York"),
    extraArgs: s.arr({ type: "string" }, "Extra Chrome command-line switches"),
  }],
  ["browser_shutdown", "Closes Chrome completely (all tabs and contexts).", {}],
  ["browser_tabs", "Lists all open tabs (id, title, url, context, incognito, active).", {}, [], true],
  ["browser_tab_new", "Opens a new tab. incognito=true opens it in a fresh private context (no cookies); proxy/userAgent/size create an isolated context with those settings. contextId reuses an existing incognito context.", {
    url: s.str("URL to open"),
    incognito: s.bool("Open in a new private (incognito) context"),
    contextId: s.str("Put the tab in this existing context"),
    proxy: s.obj("Proxy just for this new context {server, username?, password?}"),
    userAgent: s.str("User agent for the new context"),
    width: s.int("Viewport width for the new context"),
    height: s.int("Viewport height"),
    locale: s.str("Locale for the new context"),
    timezoneId: s.str("Timezone for the new context"),
    geolocation: s.obj("{latitude, longitude} for the new context"),
    mobile: s.bool("Emulate a phone (touch, mobile UA, 390x844)"),
  }],
  ["browser_tab_select", "Makes a tab the active one (and brings it to front).", { tabId: s.str("Tab id") }, ["tabId"]],
  ["browser_tab_close", "Closes one tab, all tabs, or all except one.", { tabId: s.str("Tab to close"), all: s.bool("Close every tab"), allExcept: s.str("Close every tab except this id") }],
  ["browser_context_close", "Closes an incognito/proxy context and all its tabs.", { contextId: s.str("Context id") }, ["contextId"]],
  ["browser_navigate", "Goes to a URL in a tab.", { ...tab, url: s.str("URL"), waitUntil: s.enum(["load", "domcontentloaded", "networkidle", "commit"], "Default load"), timeoutSec: s.int("Default 45") }, ["url"]],
  ["browser_history", "Back, forward or reload.", { ...tab, action: s.enum(["back", "forward", "reload"], "What to do") }, ["action"]],
  ["browser_snapshot", "Reads the page: URL, title, numbered interactive elements (refs for click/type) and visible text. Call this before interacting.", {
    ...tab,
    mode: s.enum(["interactive", "text", "both"], "Default both"),
    maxChars: s.int("Max page text characters (default 15000)"),
    viewportOnly: s.bool("Only elements currently on screen"),
  }, [], true],
  ["browser_screenshot", "Screenshot of the tab (viewport, full page, or one element). Returned as an image.", {
    ...tab, fullPage: s.bool("Whole scrollable page"), ref: target.ref, selector: target.selector,
    format: s.enum(["jpeg", "png"], "Default jpeg"), quality: s.int("JPEG quality 1-100 (default 70)"),
  }, [], true],
  ["browser_click", "Clicks an element or point. Natural (human-like) by default.", {
    ...tab, ...target, ...human,
    button: s.enum(["left", "right", "middle"], "Default left"),
    clickCount: s.int("2 = double-click"),
    modifiers: s.arr({ type: "string" }, "Alt, Control, Meta, Shift"),
    force: s.bool("Skip actionability checks"),
    newTab: s.bool("Ctrl/Cmd-click to open the link in a new tab"),
  }],
  ["browser_hover", "Moves the mouse over an element or point.", { ...tab, ...target, ...human }],
  ["browser_type", "Types text into an element (or the focused element). Human-like key timing by default.", {
    ...tab, ref: target.ref, selector: target.selector, text: s.str("Text to type"),
    clear: s.bool("Clear the field first"), pressEnter: s.bool("Press Enter after"), ...human,
  }, ["text"]],
  ["browser_press", "Presses a key or shortcut, e.g. Enter, Escape, Tab, ArrowDown, Control+A, Meta+C.", { ...tab, key: s.str("Key or chord"), count: s.int("Repeat (default 1)") }, ["key"]],
  ["browser_select", "Chooses option(s) in a <select>.", { ...tab, ref: target.ref, selector: target.selector, values: s.arr({ type: "string" }, "Option values or labels") }, ["values"]],
  ["browser_check", "Checks or unchecks a checkbox/radio.", { ...tab, ref: target.ref, selector: target.selector, checked: s.bool("Default true") }],
  ["browser_drag", "Drags from one element/point to another (natural mouse movement, works for sliders, sortable lists, maps, captcha-free puzzles).", {
    ...tab, from: point, to: point, ...human, steps: s.int("Mouse move steps (default ~25)"),
  }, ["from", "to"]],
  ["browser_scroll", "Scrolls the page or an element: by pixels, to top/bottom, or until an element is visible. Uses mouse-wheel events.", {
    ...tab, dx: s.num("Horizontal pixels"), dy: s.num("Vertical pixels (positive = down)"),
    to: s.enum(["top", "bottom"], "Jump to top/bottom"), ref: s.str("Scroll this element into view"), selector: s.str("Scroll this element into view"),
    within: s.str("Ref of a scrollable container to scroll inside"), ...human,
  }],
  ["browser_zoom", "Sets page zoom (1 = 100%, 0.5 = 50%, 1.5 = 150%).", { ...tab, level: s.num("Zoom factor") }, ["level"]],
  ["browser_set_viewport", "Forces the tab's screen size (and pixel ratio).", { ...tab, width: s.int("px"), height: s.int("px") }, ["width", "height"]],
  ["browser_mouse", "Low-level mouse: move, down, up, wheel, at coordinates.", {
    ...tab, action: s.enum(["move", "down", "up", "wheel", "click"], "Action"), x: s.num("X"), y: s.num("Y"),
    button: s.enum(["left", "right", "middle"], "Button"), deltaX: s.num("Wheel X"), deltaY: s.num("Wheel Y"), ...human,
  }, ["action"]],
  ["browser_wait", "Waits for an element, text, URL, network idle, or a number of seconds.", {
    ...tab, selector: s.str("Wait for this selector to be visible"), text: s.str("Wait for this text"), urlIncludes: s.str("Wait until the URL contains this"),
    networkIdle: s.bool("Wait for network idle"), seconds: s.num("Just wait this long"), gone: s.bool("Wait for selector/text to disappear instead"), timeoutSec: s.int("Default 30"),
  }],
  ["browser_evaluate", "Runs JavaScript in the page and returns the result (JSON). Use for extraction or anything the other tools can't do. Wrap statements in an IIFE; async allowed.", { ...tab, expression: s.str("JS expression, e.g. document.title or (async()=>{…})()") }, ["expression"]],
  ["browser_content", "Gets the page (or an element's) HTML or text.", { ...tab, selector: s.str("Element (default whole page)"), format: s.enum(["html", "text"], "Default text"), maxChars: s.int("Default 50000") }, [], true],
  ["browser_cookies", "Gets, sets or clears cookies / localStorage for a context.", {
    ...tab, action: s.enum(["get", "set", "clear", "localStorage"], "What to do"), urls: s.arr({ type: "string" }, "Filter cookies by URL"),
    cookies: s.arr({ type: "object" }, "For set: [{name, value, domain, path, expires?, httpOnly?, secure?, sameSite?}]"),
  }, ["action"]],
  ["browser_upload", "Sets files on a file input (paths on the computer running the bridge).", { ...tab, ref: target.ref, selector: target.selector, paths: s.arr({ type: "string" }, "Absolute file paths") }, ["paths"]],
  ["browser_downloads", "Lists files downloaded by the browser (saved in the bridge's downloads folder).", {}, [], true],
  ["browser_dialogs", "How to handle alert/confirm/prompt dialogs, and the recent dialog log.", { mode: s.enum(["accept", "dismiss"], "Default accept"), promptText: s.str("Text to answer prompt() with") }],
  ["browser_emulate", "Changes context settings on the fly: offline, extra HTTP headers, geolocation, color scheme, media.", {
    ...tab, offline: s.bool("Simulate offline"), extraHTTPHeaders: s.obj("Headers added to every request"), geolocation: s.obj("{latitude, longitude, accuracy?}"),
    colorScheme: s.enum(["light", "dark", "no-preference"], "prefers-color-scheme"), media: s.enum(["screen", "print"], "CSS media type"),
  }],
  ["browser_block", "Blocks (or unblocks) requests matching URL patterns or resource types — e.g. images/fonts for speed, or trackers.", {
    ...tab, patterns: s.arr({ type: "string" }, "Glob URL patterns like **/*.png or *://*.doubleclick.net/*"),
    resourceTypes: s.arr({ type: "string" }, "image, font, media, stylesheet, script…"), clear: s.bool("Remove all blocks"),
  }],
  ["browser_network", "Recent network requests of a tab (always captured, last 500): method, URL, status, type, size, timing. Filter to find API calls.", {
    ...tab, urlContains: s.str("Filter by URL substring"), resourceType: s.str("xhr, fetch, document, script, image…"), method: s.str("GET, POST…"),
    apiOnly: s.bool("Only xhr/fetch/websocket/eventsource"), limit: s.int("Default 100"),
  }, [], true],
  ["browser_request_detail", "Full detail of one request from browser_network: request headers/body and response headers/body.", { ...tab, requestId: s.str("Id from browser_network"), maxBodyChars: s.int("Default 20000"), revealSecrets: s.bool("Show cookie/authorization values (masked by default)") }, ["requestId"], true],
  ["browser_console", "Console messages and page errors of a tab.", { ...tab, limit: s.int("Default 100"), level: s.str("error, warning, log…") }, [], true],
  ["browser_pdf", "Saves the page as a PDF on the computer (headless mode only). Returns the file path.", { ...tab, path: s.str("Output path (default downloads folder)") }],
  ["browser_record_start", "Record mode: captures everything a site does — every request with headers and bodies, JavaScript files, WebSocket frames, console, navigations, cookies, and the user's own clicks/typing — into a session folder on the computer. Then browse (or let the owner browse) and call browser_record_stop.", {
    name: s.str("Session name (default timestamp)"),
    contextId: s.str("Context to record (default the main profile; tabs opened later are included)"),
    captureBodies: s.bool("Save response bodies (default true)"),
    maxBodyKB: s.int("Max KB per saved body (default 2048)"),
    captureUserActions: s.bool("Log the human's clicks/typing/navigation (default true)"),
  }],
  ["browser_record_stop", "Stops recording, saves page HTML snapshots, and returns an analysis: API endpoints grouped by pattern, auth mechanism, GraphQL operations, third-party domains, scripts, WebSockets, user actions.", { session: s.str("Session name (default the active one)") }],
  ["browser_record_list", "Lists saved recording sessions.", {}, [], true],
  ["browser_record_analyze", "Re-analyzes a saved session: endpoint map, auth, data flows.", { session: s.str("Session name"), revealSecrets: s.bool("Show token/cookie values") }, ["session"], true],
  ["browser_record_query", "Searches requests inside a recording session.", {
    session: s.str("Session name"), urlContains: s.str("URL substring"), method: s.str("Method"), resourceType: s.str("Type"), status: s.int("HTTP status"),
    bodyContains: s.str("Text inside request or response body"), limit: s.int("Default 50"), offset: s.int("Skip"),
  }, ["session"], true],
  ["browser_record_get", "Gets one recorded request (headers + bodies), or a captured JavaScript file (optionally grep it).", {
    session: s.str("Session name"), requestId: s.str("Request id"), script: s.str("Script file name or URL substring"),
    grep: s.str("Only lines matching this regex (scripts)"), maxChars: s.int("Default 30000"), offset: s.int("Char offset for long bodies"),
    revealSecrets: s.bool("Show cookie/authorization values"),
  }, ["session"], true],
];

export const browserTools: Tool[] = defs.map(([name, description, props, required = [], readOnly]) => ({
  name,
  description,
  inputSchema: schema(
    {
      ...props,
      computer: s.str("Which connected computer (only needed if more than one bridge is connected)"),
      timeoutSec: s.int("Max seconds to wait for the computer (default 90)"),
    },
    required,
  ),
  annotations: readOnly ? { readOnlyHint: true } : { openWorldHint: true },
  run: (args: any, env: Env) => {
    if (name === "browser_status") return browserStatus(env, args);
    return callBridge(env, name.replace(/^browser_/, ""), args);
  },
}));

async function browserStatus(env: Env, args: any) {
  const res = await hubFetch(env, "/status");
  const hub: any = await res.json();
  if (!hub.computers.length) {
    return { connected: false, note: "No computer is connected. Start the bridge on the computer (see bridge/README) and check its BRIDGE_TOKEN/URL." };
  }
  let browser: unknown;
  try {
    browser = await callBridge(env, "status", args);
  } catch (e) {
    browser = { error: (e as Error).message };
  }
  return { computers: hub.computers, browser };
}
