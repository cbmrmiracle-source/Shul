// Mr Miracle FBA System — Worker entry.
//  /api/*  → the Store Durable Object (auth + data + API)
//  /img/*  → uploaded images (public, so Amazon can download them for image updates)
//  else    → static dashboard (public/)
export { Store } from "./store";
import { STATIC } from "./static.gen";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
};

function stub(env: any) {
  return env.STORE.get(env.STORE.idFromName("main"));
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      // CSRF guard: state-changing requests must come from our own pages
      if (request.method !== "GET" && request.method !== "HEAD") {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) return new Response("Bad origin", { status: 403 });
      }
      const res = await stub(env).fetch(request);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
      out.headers.set("cache-control", "no-store");
      return out;
    }
    if (url.pathname.startsWith("/img/")) {
      const key = url.pathname.slice(5);
      if (!/^[a-f0-9]{24}\.(jpg|png|tif|gif)$/.test(key)) return new Response("Not found", { status: 404 });
      const obj = await env.IMAGES.getWithMetadata(key, "arrayBuffer");
      if (!obj.value) return new Response("Not found", { status: 404 });
      return new Response(obj.value, { headers: { "content-type": (obj.metadata as any)?.type || "image/jpeg", "cache-control": "public, max-age=86400" } });
    }
    // static dashboard (single-page app: unknown paths get index.html)
    const file = STATIC[url.pathname] || STATIC["/index.html"];
    const headers: Record<string, string> = { "content-type": file.type, ...SECURITY_HEADERS,
      "cache-control": url.pathname.endsWith(".html") || !STATIC[url.pathname] || url.pathname === "/" ? "no-cache" : "public, max-age=300" };
    return new Response(file.body, { headers });
  },

  // Cron keeps the scheduler alive (the Durable Object alarm does the actual work).
  async scheduled(_event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    ctx.waitUntil(stub(env).fetch("https://internal/internal/cron"));
  },
};
