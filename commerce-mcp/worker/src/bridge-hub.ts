import { DurableObject } from "cloudflare:workers";
import type { Env } from "./mcp";

// Relays tool calls to the bridge agent(s) on the owner's computer(s).
// The agent keeps an outbound WebSocket open to /bridge/connect; calls arrive
// on /call and are matched to responses by id. Uses the hibernation API so an
// idle connection costs nothing; ping/pong is answered without waking the DO.

interface Pending {
  resolve: (v: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  computer: string;
  chunks?: string[];
}

export class BridgeHub extends DurableObject<Env> {
  private pending = new Map<string, Pending>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private sockets(): { ws: WebSocket; name: string; info: any }[] {
    return this.ctx.getWebSockets().map((ws) => {
      const att = (ws.deserializeAttachment() as any) ?? {};
      return { ws, name: att.name ?? "computer", info: att };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const name = (url.searchParams.get("name") || "computer").slice(0, 64);
      // A reconnecting agent with the same name replaces its old socket.
      for (const s of this.sockets()) if (s.name === name) s.ws.close(4000, "replaced by new connection");
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [name]);
      pair[1].serializeAttachment({ name, connectedAt: new Date().toISOString() });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/status") {
      return Response.json({ computers: this.sockets().map((s) => ({ name: s.name, connectedAt: s.info.connectedAt, agent: s.info.agent })) });
    }
    if (url.pathname === "/call" && request.method === "POST") {
      const { computer, action, args, timeoutMs = 90_000 } = (await request.json()) as any;
      const all = this.sockets();
      if (!all.length) return Response.json({ ok: false, error: "No computer is connected to the browser bridge. Start the bridge agent on the computer." });
      const target = computer ? all.find((s) => s.name === computer) : all[0];
      if (!target) return Response.json({ ok: false, error: `Computer "${computer}" isn't connected. Connected: ${all.map((s) => s.name).join(", ")}` });
      const id = crypto.randomUUID();
      const result = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          resolve({ ok: false, error: `The computer didn't answer within ${Math.round(timeoutMs / 1000)}s (action ${action}). Raise timeoutSec for slow pages.` });
        }, timeoutMs);
        this.pending.set(id, { resolve, timer, computer: target.name });
        try {
          target.ws.send(JSON.stringify({ type: "call", id, action, args }));
        } catch (e) {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve({ ok: false, error: `Send failed: ${(e as Error).message}` });
        }
      });
      return Response.json(result);
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg.type === "hello") {
      const att = (ws.deserializeAttachment() as any) ?? {};
      ws.serializeAttachment({ ...att, agent: msg.agent });
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === "chunk") {
      // Large results (screenshots, bodies) arrive in pieces.
      p.chunks ??= [];
      p.chunks[msg.i] = msg.data;
      if (p.chunks.filter((c) => c !== undefined).length < msg.n) return;
      msg = JSON.parse(p.chunks.join(""));
    }
    if (msg.type === "result") {
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.resolve(msg.ok ? { ok: true, result: msg.result } : { ok: false, error: msg.error });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    const att = (ws.deserializeAttachment() as any) ?? {};
    for (const [id, p] of this.pending) {
      if (p.computer === att.name) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.resolve({ ok: false, error: `The computer disconnected (code ${code}) during the call.` });
      }
    }
    try {
      ws.close(1000, "closed");
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }
}
