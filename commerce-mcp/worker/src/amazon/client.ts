import type { Env } from "../mcp";
import { ToolError } from "../mcp";

// SP-API no longer needs AWS SigV4 signing: an LWA access token in
// x-amz-access-token is enough (since Oct 2023).

const HOSTS: Record<string, string> = {
  na: "sellingpartnerapi-na.amazon.com",
  eu: "sellingpartnerapi-eu.amazon.com",
  fe: "sellingpartnerapi-fe.amazon.com",
};

export const MARKETPLACES: Record<string, { id: string; region: string; country: string }> = {
  US: { id: "ATVPDKIKX0DER", region: "na", country: "United States" },
  CA: { id: "A2EUQ1WTGCTBG2", region: "na", country: "Canada" },
  MX: { id: "A1AM78C64UM0Y8", region: "na", country: "Mexico" },
  BR: { id: "A2Q3Y263D00KWC", region: "na", country: "Brazil" },
  UK: { id: "A1F83G8C2ARO7P", region: "eu", country: "United Kingdom" },
  DE: { id: "A1PA6795UKMFR9", region: "eu", country: "Germany" },
  FR: { id: "A13V1IB3VIYZZH", region: "eu", country: "France" },
  IT: { id: "APJ6JRA9NG5V4", region: "eu", country: "Italy" },
  ES: { id: "A1RKKUPIHCS9HS", region: "eu", country: "Spain" },
  NL: { id: "A1805IZSGTT6HS", region: "eu", country: "Netherlands" },
  SE: { id: "A2NODRKZP88ZB9", region: "eu", country: "Sweden" },
  PL: { id: "A1C3SOZRARQ6R3", region: "eu", country: "Poland" },
  BE: { id: "AMEN7PMS3EDWL", region: "eu", country: "Belgium" },
  IE: { id: "A28R8C7NBKEWEA", region: "eu", country: "Ireland" },
  TR: { id: "A33AVAJ2PDY3EV", region: "eu", country: "Turkey" },
  AE: { id: "A2VIGQ35RCS4UG", region: "eu", country: "United Arab Emirates" },
  SA: { id: "A17E79C6D8DWNP", region: "eu", country: "Saudi Arabia" },
  EG: { id: "ARBP9OOSHTCHU", region: "eu", country: "Egypt" },
  IN: { id: "A21TJRUUN4KGV", region: "eu", country: "India" },
  ZA: { id: "AE08WJ6YKNBMC", region: "eu", country: "South Africa" },
  JP: { id: "A1VC38T7YXB528", region: "fe", country: "Japan" },
  AU: { id: "A39IBJ37TRP1C6", region: "fe", country: "Australia" },
  SG: { id: "A19VAU5U5O7RUS", region: "fe", country: "Singapore" },
};

/** Accepts a marketplace id or a country code like "US"/"UK". */
export function resolveMarketplace(env: Env, value?: string): string {
  if (!value) return env.SP_MARKETPLACE_ID || MARKETPLACES.US.id;
  const byCode = MARKETPLACES[value.toUpperCase()];
  return byCode ? byCode.id : value;
}

const tokenCache = new Map<string, { token: string; expires: number }>();

async function getAccessToken(env: Env, grantlessScope?: string): Promise<string> {
  const { LWA_CLIENT_ID, LWA_CLIENT_SECRET, SP_REFRESH_TOKEN } = env;
  if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET) {
    throw new ToolError("Amazon is not configured: set the LWA_CLIENT_ID and LWA_CLIENT_SECRET secrets on the Worker.");
  }
  if (!grantlessScope && !SP_REFRESH_TOKEN) {
    throw new ToolError("Amazon is not configured: set the SP_REFRESH_TOKEN secret on the Worker.");
  }
  const key = grantlessScope ?? "seller";
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const form = new URLSearchParams({ client_id: LWA_CLIENT_ID, client_secret: LWA_CLIENT_SECRET });
  if (grantlessScope) {
    form.set("grant_type", "client_credentials");
    form.set("scope", grantlessScope);
  } else {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", SP_REFRESH_TOKEN!);
  }
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new ToolError(
      `Amazon login (LWA) failed (${res.status}): ${data.error_description || data.error || "no access token returned"}. ` +
        "Check the client id/secret and that the refresh token belongs to this app.",
    );
  }
  tokenCache.set(key, { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

export interface SpRequest {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  grantlessScope?: string;
  headers?: Record<string, string>;
}

export interface SpResponse {
  status: number;
  requestId?: string | null;
  rateLimit?: string | null;
  body: any;
}

function buildQuery(query: Record<string, unknown> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    // SP-API array params are comma-separated (style: form, explode: false).
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function spRequest(env: Env, req: SpRequest): Promise<SpResponse> {
  const region = (env.SP_REGION || "na").toLowerCase();
  const host = HOSTS[region];
  if (!host) throw new ToolError(`SP_REGION must be na, eu or fe (got "${region}")`);
  const base = env.SP_SANDBOX === "true" ? `https://sandbox.${host}` : `https://${host}`;
  if (!req.path.startsWith("/")) throw new ToolError("path must start with /");
  const url = base + req.path + buildQuery(req.query);

  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(env, req.grantlessScope);
    const res = await fetch(url, {
      method: req.method.toUpperCase(),
      headers: {
        "x-amz-access-token": token,
        "user-agent": "commerce-mcp/1.0 (Language=TypeScript; Platform=Cloudflare-Workers)",
        accept: "application/json",
        ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
        ...req.headers,
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });
    // Retry throttling and transient errors with backoff (1s, 2s, 4s).
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 403 && attempt === 0) tokenCache.delete(req.grantlessScope ?? "seller");
    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return {
      status: res.status,
      requestId: res.headers.get("x-amzn-RequestId"),
      rateLimit: res.headers.get("x-amzn-RateLimit-Limit"),
      body,
    };
  }
}

/** Like spRequest but throws a readable error on non-2xx. */
export async function sp(env: Env, req: SpRequest): Promise<any> {
  const res = await spRequest(env, req);
  if (res.status >= 300) {
    const errs = res.body?.errors;
    const msg = Array.isArray(errs)
      ? errs.map((e: any) => `${e.code}: ${e.message}${e.details ? ` (${e.details})` : ""}`).join("; ")
      : typeof res.body === "string"
        ? res.body.slice(0, 500)
        : JSON.stringify(res.body).slice(0, 500);
    throw new ToolError(`Amazon ${req.method} ${req.path} → HTTP ${res.status}: ${msg}`);
  }
  return res.body;
}

/** Downloads a report / Data Kiosk / feed-result document, un-gzipping if needed. */
export async function downloadDocument(url: string, compression?: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new ToolError(`Document download failed: HTTP ${res.status}`);
  if (compression === "GZIP") {
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return await res.text();
}

/** Turns tab-separated report text into rows; falls back to raw text for JSON/XML. */
export function parseDocument(text: string, maxRows = 200, offset = 0) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { format: "json", data: JSON.parse(trimmed) };
    } catch {
      // JSON Lines (Data Kiosk)
      const lines = trimmed.split("\n").filter(Boolean);
      try {
        const rows = lines.map((l) => JSON.parse(l));
        return { format: "jsonl", totalRows: rows.length, offset, rows: rows.slice(offset, offset + maxRows) };
      } catch {
        /* fall through */
      }
    }
  }
  if (trimmed.startsWith("<")) return { format: "xml", text: trimmed };
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length > 1 && lines[0].includes("\t")) {
    const headers = lines[0].split("\t");
    const rows = lines.slice(1 + offset, 1 + offset + maxRows).map((l) => {
      const cells = l.split("\t");
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    });
    return { format: "tsv", columns: headers, totalRows: lines.length - 1, offset, rows };
  }
  return { format: "text", text };
}

export async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  { waitSeconds = 120, intervalSeconds = 8 } = {},
): Promise<{ value: T; finished: boolean }> {
  const deadline = Date.now() + waitSeconds * 1000;
  let value = await fn();
  while (!done(value) && Date.now() < deadline) {
    await sleep(intervalSeconds * 1000);
    value = await fn();
  }
  return { value, finished: done(value) };
}
