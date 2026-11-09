import { type Tool, type Env, s, schema, ToolError } from "../mcp";

// Other sales channels / business APIs, configured with the CHANNELS_JSON secret:
// {
//   "nineyard": {
//     "description": "9Yard marketplace",
//     "baseUrl": "https://api.example.com/v1",
//     "auth": { "type": "bearer", "token": "…" },
//     "headers": { "Accept": "application/json" },
//     "docsUrl": "https://…"
//   }
// }
// auth.type: bearer {token} | header {name, value} | basic {username, password}
//            | query {name, value} | oauth2_client_credentials {tokenUrl, clientId, clientSecret, scope?} | none

interface Channel {
  description?: string;
  baseUrl: string;
  auth?: { type: string; [k: string]: string };
  headers?: Record<string, string>;
  docsUrl?: string;
  notes?: string;
}

function loadChannels(env: Env): Record<string, Channel> {
  if (!env.CHANNELS_JSON) return {};
  try {
    return JSON.parse(env.CHANNELS_JSON);
  } catch {
    throw new ToolError("CHANNELS_JSON secret is not valid JSON.");
  }
}

const oauthCache = new Map<string, { token: string; expires: number }>();

async function authHeaders(name: string, ch: Channel, url: URL): Promise<Record<string, string>> {
  const a = ch.auth;
  if (!a || a.type === "none") return {};
  switch (a.type) {
    case "bearer":
      return { authorization: `Bearer ${a.token}` };
    case "header":
      return { [a.name]: a.value };
    case "basic":
      return { authorization: `Basic ${btoa(`${a.username}:${a.password}`)}` };
    case "query":
      url.searchParams.set(a.name, a.value);
      return {};
    case "oauth2_client_credentials": {
      const c = oauthCache.get(name);
      if (c && c.expires > Date.now() + 30_000) return { authorization: `Bearer ${c.token}` };
      const form = new URLSearchParams({ grant_type: "client_credentials", client_id: a.clientId, client_secret: a.clientSecret });
      if (a.scope) form.set("scope", a.scope);
      const res = await fetch(a.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
      const data: any = await res.json().catch(() => ({}));
      if (!data.access_token) throw new ToolError(`${name}: OAuth token request failed (HTTP ${res.status})`);
      oauthCache.set(name, { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 });
      return { authorization: `Bearer ${data.access_token}` };
    }
    default:
      throw new ToolError(`${name}: unknown auth type "${a.type}"`);
  }
}

export const channelTools: Tool[] = [
  {
    name: "channels_list",
    description: "Lists the other sales channels / business APIs connected to this server (e.g. 9Yard), with their base URLs and docs links. Credentials are never shown.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
    run: async (_args, env) => {
      const chans = loadChannels(env);
      const list = Object.entries(chans).map(([name, c]) => ({ name, description: c.description, baseUrl: c.baseUrl, auth: c.auth?.type ?? "none", docsUrl: c.docsUrl, notes: c.notes }));
      return list.length ? list : "No channels configured yet. Add them to the CHANNELS_JSON secret on the Worker (see README).";
    },
  },
  {
    name: "channel_request",
    description: "Calls a connected channel's API (authenticated automatically). The path is appended to the channel's baseUrl — requests can't go to other hosts. Writes (POST/PUT/PATCH/DELETE) change live data — confirm with the owner first.",
    inputSchema: schema({
      channel: s.str("Channel name from channels_list"),
      method: s.enum(["GET", "POST", "PUT", "PATCH", "DELETE"], "HTTP method"),
      path: s.str("Path relative to baseUrl, e.g. /orders"),
      query: s.obj("Query parameters"),
      body: { description: "JSON body (object or array)" },
      headers: s.obj("Extra headers"),
    }, ["channel", "method", "path"]),
    annotations: { openWorldHint: true },
    run: async ({ channel, method, path, query, body, headers }, env) => {
      const ch = loadChannels(env)[channel];
      if (!ch) throw new ToolError(`No channel "${channel}". Call channels_list.`);
      const base = new URL(ch.baseUrl);
      const url = new URL(base.toString().replace(/\/$/, "") + "/" + String(path).replace(/^\//, ""));
      if (url.origin !== base.origin) throw new ToolError("Path must stay on the channel's host.");
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
      const auth = await authHeaders(channel, ch, url);
      const res = await fetch(url, {
        method,
        headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...ch.headers, ...headers, ...auth },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: res.status, body: parsed };
    },
  },
];
