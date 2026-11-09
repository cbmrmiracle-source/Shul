import { handleMcp, type Env, type Tool } from "./mcp";
import { amazonTools } from "./tools/amazon";
import { channelTools } from "./tools/channels";
import { browserTools, hubFetch } from "./tools/browser";

export { BridgeHub } from "./bridge-hub";

const TOOLS = new Map<string, Tool>([...amazonTools, ...channelTools, ...browserTools].map((t) => [t.name, t]));

// Browser-based MCP clients (inspectors, web apps) need CORS; server-side clients ignore it.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function withCors(res: Response): Response {
  if (res.status === 101) return res; // WebSocket upgrade responses are immutable
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function authorizedForMcp(request: Request, url: URL, env: Env): boolean {
  const secret = env.MCP_SECRET;
  if (!secret || secret.length < 16) return false; // refuse to run open
  // Option 1: secret in the URL path — works in every client (Claude, ChatGPT, Cursor…), no OAuth needed.
  const parts = url.pathname.split("/").filter(Boolean); // ["mcp", "<secret>"]
  if (parts.length === 2 && safeEqual(parts[1], secret)) return true;
  // Option 2: Authorization: Bearer <secret> header.
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") && safeEqual(auth.slice(7), secret);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/") {
      return withCors(Response.json({ name: "commerce-mcp", ok: true, mcpEndpoint: "/mcp/<MCP_SECRET>", tools: TOOLS.size }));
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      if (!env.MCP_SECRET || env.MCP_SECRET.length < 16) {
        return withCors(new Response("Server not configured: set the MCP_SECRET secret (16+ characters).", { status: 503 }));
      }
      if (!authorizedForMcp(request, url, env)) return withCors(new Response("Unauthorized", { status: 401 }));
      return withCors(await handleMcp(request, TOOLS, env));
    }

    if (url.pathname === "/bridge/connect") {
      const token = url.searchParams.get("token") ?? "";
      if (!env.BRIDGE_TOKEN || env.BRIDGE_TOKEN.length < 16 || !safeEqual(token, env.BRIDGE_TOKEN)) {
        return new Response("Unauthorized", { status: 401 });
      }
      return hubFetch(env, `/connect?name=${encodeURIComponent(url.searchParams.get("name") ?? "computer")}`, { headers: request.headers });
    }

    return withCors(new Response("Not found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
