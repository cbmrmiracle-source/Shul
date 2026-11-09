// Bridge agent: keeps an outbound WebSocket to the commerce-mcp Worker and runs
// browser actions it receives. No ports to open; works behind any router.
//   node src/agent.mjs                (reads ../config.json)
//   BRIDGE_CONFIG=/path/config.json node src/agent.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { BrowserManager, actions } from "./browser.mjs";

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.env.BRIDGE_CONFIG || path.join(baseDir, "config.json");
if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}. Copy config.example.json to config.json and fill in serverUrl and bridgeToken.`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.serverUrl = process.env.BRIDGE_SERVER_URL || config.serverUrl;
config.bridgeToken = process.env.BRIDGE_TOKEN || config.bridgeToken;
config.name = process.env.BRIDGE_NAME || config.name || os.hostname();
if (!config.serverUrl || !config.bridgeToken || config.bridgeToken.startsWith("same value")) {
  console.error("Set serverUrl and bridgeToken in config.json.");
  process.exit(1);
}

const mgr = new BrowserManager(config, baseDir);
const log = (...a) => console.log(new Date().toISOString(), ...a);
const CHUNK = 512 * 1024;

function wsUrl() {
  const u = new URL("/bridge/connect", config.serverUrl.replace(/^http/, "ws"));
  u.searchParams.set("token", config.bridgeToken);
  u.searchParams.set("name", config.name);
  return u.toString();
}

function send(ws, msg) {
  const text = JSON.stringify(msg);
  if (text.length <= CHUNK * 1.5) return ws.send(text);
  const n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) ws.send(JSON.stringify({ type: "chunk", id: msg.id, i, n, data: text.slice(i * CHUNK, (i + 1) * CHUNK) }));
}

async function handle(ws, msg) {
  const fn = actions[msg.action];
  const started = Date.now();
  try {
    if (!fn) throw new Error(`Unknown action ${msg.action}`);
    const result = await fn(mgr, msg.args || {});
    send(ws, { type: "result", id: msg.id, ok: true, result });
    log(`✓ ${msg.action} (${Date.now() - started}ms)`);
  } catch (e) {
    const error = String(e?.message || e).split("\n").slice(0, 6).join("\n");
    send(ws, { type: "result", id: msg.id, ok: false, error });
    log(`✗ ${msg.action}: ${error.split("\n")[0]}`);
  }
}

let delay = 1000;
function connect() {
  const ws = new WebSocket(wsUrl());
  let pinger;
  ws.addEventListener("open", () => {
    delay = 1000;
    log(`Connected to ${config.serverUrl} as "${config.name}"`);
    ws.send(JSON.stringify({ type: "hello", agent: { name: config.name, platform: process.platform, node: process.version } }));
    pinger = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
  });
  ws.addEventListener("message", (ev) => {
    if (ev.data === "pong") return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "call") handle(ws, msg);
  });
  ws.addEventListener("close", (ev) => {
    clearInterval(pinger);
    if (ev.code === 4000) log("Another bridge with the same name connected; this one now reconnects.");
    log(`Disconnected (${ev.code}${ev.reason ? " " + ev.reason : ""}). Reconnecting in ${Math.round(delay / 1000)}s…`);
    setTimeout(connect, delay);
    delay = Math.min(delay * 2, 30_000);
  });
  ws.addEventListener("error", (e) => log("Connection error:", e.message || "see close reason"));
}

process.on("SIGINT", async () => { log("Shutting down…"); await mgr.shutdown(); process.exit(0); });
process.on("unhandledRejection", (e) => log("Unhandled:", e?.message || e));
connect();
