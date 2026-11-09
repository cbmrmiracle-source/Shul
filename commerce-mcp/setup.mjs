// One-click setup: deploys the server to your Cloudflare account, creates and
// stores the two passwords, and configures the Chrome bridge on this computer.
// Run with SETUP.cmd (Windows) or ./setup.sh (Mac). Safe to run again.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(root, "worker");
const bridge = path.join(root, "bridge");
const secretsFile = path.join(root, "MY-SECRETS.json");

const say = (msg) => console.log(`\n=== ${msg}`);
function fail(msg) {
  console.log(`\n!!! ${msg}\n`);
  process.exit(1);
}
function run(cmd, cwd, { capture = false, input } = {}) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", input, stdio: capture || input !== undefined ? ["pipe", "pipe", "pipe"] : "inherit" });
  if (capture || input !== undefined) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
  }
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

say("1/6 Installing the server (first time takes a minute)…");
if (!run("npm install --no-audit --no-fund", worker).ok) fail("npm install failed for the server. Send Claude the error above.");

say("2/6 Connecting to your Cloudflare account…");
const who = run("npx wrangler whoami", worker, { capture: true });
if (!who.ok || /not authenticated|You are not logged in/i.test(who.out)) {
  console.log("A browser window will open — click ALLOW, then come back here.");
  if (!run("npx wrangler login", worker).ok) fail("Cloudflare login didn't finish. Run SETUP again.");
}

say("3/6 Deploying the server…");
const dep = run("npx wrangler deploy", worker, { capture: true });
if (!dep.ok) {
  if (/workers\.dev subdomain/i.test(dep.out)) {
    fail("Cloudflare needs a one-time workers.dev name first: in the Cloudflare dashboard open 'Workers & Pages', and pick a subdomain when it asks. Then run SETUP again.");
  }
  fail("Deploy failed. Send Claude the error above.");
}
const url = dep.out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
if (!url) fail("Deployed, but couldn't find the server address in the output. Send Claude the text above.");

say("4/6 Creating your passwords…");
let secrets = {};
try {
  secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
} catch {
  /* first run */
}
secrets.MCP_SECRET ??= crypto.randomBytes(32).toString("hex");
secrets.BRIDGE_TOKEN ??= crypto.randomBytes(32).toString("hex");
const tmp = path.join(os.tmpdir(), `commerce-secrets-${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify({ MCP_SECRET: secrets.MCP_SECRET, BRIDGE_TOKEN: secrets.BRIDGE_TOKEN }));
const put = run(`npx wrangler secret bulk "${tmp}"`, worker, { capture: true });
fs.rmSync(tmp, { force: true });
if (!put.ok) fail("Couldn't save the passwords to Cloudflare. Send Claude the error above.");
const mcpUrl = `${url}/mcp/${secrets.MCP_SECRET}`;
fs.writeFileSync(secretsFile, JSON.stringify({ ...secrets, serverUrl: url, mcpUrl, note: "Keep this file private. mcpUrl is what you paste into Claude / ChatGPT." }, null, 2));

say("5/6 Setting up the Chrome bridge on this computer…");
if (!run("npm install --no-audit --no-fund", bridge).ok) fail("npm install failed for the bridge. Send Claude the error above.");
const cfgPath = path.join(bridge, "config.json");
let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch {
  cfg = JSON.parse(fs.readFileSync(path.join(bridge, "config.example.json"), "utf8"));
}
cfg.serverUrl = url;
cfg.bridgeToken = secrets.BRIDGE_TOKEN;
if (!cfg.name || cfg.name === "home-pc") cfg.name = os.hostname();
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

say("6/6 Checking the server answers…");
try {
  const res = await fetch(url);
  const j = await res.json();
  console.log(j.ok ? `Server is up with ${j.tools} tools.` : "Server answered, but not as expected.");
} catch {
  console.log("Couldn't reach it yet (new servers can take a minute). That's usually fine.");
}

console.log(`
============================================================
 DONE!

 Your private MCP address (also saved in MY-SECRETS.json):

   ${mcpUrl}

 Paste it into:
   Claude  -> Settings -> Connectors -> Add custom connector
   ChatGPT -> Settings -> Apps & Connectors -> Developer mode -> Create

 Don't share that address — it works like a password.
============================================================
`);
