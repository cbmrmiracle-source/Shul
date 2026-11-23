// Amazon SP-API client. Two ways in:
//  1. Through the owner's existing `commerce-mcp` Worker (service binding + its MCP secret) — default.
//  2. Directly with LWA app credentials (LWA_CLIENT_ID / LWA_CLIENT_SECRET / SP_REFRESH_TOKEN), if ever added.

export interface SpResult { status: number; body: any }

export class RateLimited extends Error {}

export class Amazon {
  calls = 0;
  private token: { v: string; exp: number } | null = null;
  constructor(private env: any, private getSecret: (k: string) => string | null) {}

  get marketplaceId(): string { return this.env.MARKETPLACE_ID || "ATVPDKIKX0DER"; }
  get sellerId(): string { return this.getSecret("SELLER_ID") || this.env.SELLER_ID; }

  mode(): "direct" | "commerce-mcp" | null {
    if (this.env.LWA_CLIENT_ID && this.env.LWA_CLIENT_SECRET && this.env.SP_REFRESH_TOKEN) return "direct";
    if (this.env.COMMERCE && this.getSecret("COMMERCE_MCP_SECRET")) return "commerce-mcp";
    return null;
  }

  async req(method: string, path: string, query?: Record<string, any> | null, body?: any): Promise<SpResult> {
    const m = this.mode();
    if (!m) throw new Error("Amazon is not connected yet — add the commerce-mcp secret in Settings → Connections.");
    this.calls++;
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null) continue;
      q[k] = Array.isArray(v) ? v.join(",") : String(v);
    }
    const r = m === "direct" ? await this.direct(method, path, q, body) : await this.viaMcp(method, path, q, body);
    if (r.status === 429) throw new RateLimited(`Amazon rate limit on ${path}`);
    return r;
  }

  /** Like req() but throws on non-2xx. */
  async ok(method: string, path: string, query?: Record<string, any> | null, body?: any): Promise<any> {
    const r = await this.req(method, path, query, body);
    if (r.status < 200 || r.status >= 300) {
      const msg = r.body?.errors?.map((e: any) => e.message || e.code).join("; ") || JSON.stringify(r.body).slice(0, 300);
      throw new Error(`Amazon ${method} ${path} → ${r.status}: ${msg}`);
    }
    return r.body;
  }

  private async direct(method: string, path: string, q: Record<string, string>, body?: any): Promise<SpResult> {
    if (!this.token || this.token.exp < Date.now() + 60_000) {
      const r = await fetch("https://api.amazon.com/auth/o2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token", refresh_token: this.env.SP_REFRESH_TOKEN,
          client_id: this.env.LWA_CLIENT_ID, client_secret: this.env.LWA_CLIENT_SECRET,
        }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(`Amazon login failed: ${j.error_description ?? j.error ?? r.status}`);
      this.token = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    }
    const qs = Object.keys(q).length ? "?" + new URLSearchParams(q) : "";
    const res = await fetch(`https://sellingpartnerapi-na.amazon.com${path}${qs}`, {
      method,
      headers: { "x-amz-access-token": this.token.v, "content-type": "application/json", "user-agent": "MrMiracleFBA/1.0 (Language=JavaScript)" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let b: any;
    try { b = txt ? JSON.parse(txt) : {}; } catch { b = { raw: txt }; }
    return { status: res.status, body: b };
  }

  private async viaMcp(method: string, path: string, q: Record<string, string>, body?: any): Promise<SpResult> {
    const secret = this.getSecret("COMMERCE_MCP_SECRET");
    const res = await this.env.COMMERCE.fetch(`https://commerce-mcp/mcp/${secret}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "amazon_raw_request", arguments: { method, path, query: Object.keys(q).length ? q : undefined, body: body ?? undefined } },
      }),
    });
    if (res.status === 401) throw new Error("The commerce-mcp secret was rejected — check Settings → Connections.");
    if (!res.ok) return { status: res.status, body: { errors: [{ message: `commerce-mcp HTTP ${res.status}` }] } };
    const j: any = await res.json();
    const text: string = j.result?.content?.[0]?.text ?? j.error?.message ?? "";
    if (j.result?.isError || j.error) {
      const code = Number((text.match(/\b(4\d\d|5\d\d)\b/) ?? [])[1]) || 500;
      return { status: code, body: { errors: [{ message: text.replace(/^Error:\s*/, "") }] } };
    }
    let out: any;
    try { out = JSON.parse(text); } catch { out = { raw: text }; }
    if (out && typeof out.status === "number" && "body" in out) return { status: out.status, body: out.body ?? {} };
    return { status: 200, body: out };
  }

  // ---------- reports ----------

  async createReport(reportType: string, start?: string, end?: string, options?: Record<string, string>): Promise<string> {
    const b = await this.ok("POST", "/reports/2021-06-30/reports", null, {
      reportType, marketplaceIds: [this.marketplaceId],
      ...(start ? { dataStartTime: start } : {}), ...(end ? { dataEndTime: end } : {}),
      ...(options ? { reportOptions: options } : {}),
    });
    return b.reportId;
  }

  async getReport(reportId: string): Promise<{ status: string; documentId?: string }> {
    const b = await this.ok("GET", `/reports/2021-06-30/reports/${reportId}`);
    return { status: b.processingStatus, documentId: b.reportDocumentId };
  }

  /** Returns a fetch Response for the report document (caller streams it). */
  async openDocument(documentId: string): Promise<{ res: Response; gzip: boolean }> {
    const d = await this.ok("GET", `/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`);
    const res = await fetch(d.url);
    this.calls++;
    return { res, gzip: d.compressionAlgorithm === "GZIP" };
  }

  // ---------- listings ----------

  async getListing(sku: string, includedData = "summaries,attributes") {
    return this.ok("GET", `/listings/2021-08-01/items/${this.sellerId}/${encodeURIComponent(sku)}`, {
      marketplaceIds: this.marketplaceId, includedData,
    });
  }

  async patchListing(sku: string, productType: string, patches: any[]) {
    return this.req("PATCH", `/listings/2021-08-01/items/${this.sellerId}/${encodeURIComponent(sku)}`,
      { marketplaceIds: this.marketplaceId, includedData: "issues" }, { productType, patches });
  }
}
