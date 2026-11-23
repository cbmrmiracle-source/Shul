// Shared helpers: dates/time zones, parsing, crypto.

export const SALES_TZ = "America/Los_Angeles"; // Amazon reports sales days in Pacific time
export const DAY_MS = 86_400_000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function tzParts(ts: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ts))) p[x.type] = x.value;
  return {
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second,
    wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** 'YYYY-MM-DD' of a timestamp in a time zone. */
export function dayOf(ts: number, tz = SALES_TZ): string {
  const p = tzParts(ts, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function tzOffset(ts: number, tz: string) {
  const p = tzParts(ts, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ts / 1000) * 1000;
}

/** UTC timestamp of local midnight starting `day` in `tz`. */
export function dayStart(day: string, tz = SALES_TZ): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
}

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const today = (tz = SALES_TZ) => dayOf(Date.now(), tz);

export function num(v: any): number {
  if (v === null || v === undefined || v === "" || v === "--") return 0;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
export function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "" || v === "--") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isMrMiracleText = (s: string | null | undefined) => /mr\.?\s*miracle/i.test(s || "");

// ---------- tabular report streaming ----------

/** Streams a TSV report (optionally gzip) line by line, calling onRow with an object per row. */
export async function streamTsv(res: Response, gzip: boolean, onRow: (row: Record<string, string>) => void, requiredColumn?: string) {
  if (!res.ok || !res.body) throw new Error(`Report download failed: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  let charset = (ct.match(/charset=([^;]+)/i)?.[1] || "utf-8").trim().toLowerCase();
  if (charset === "cp1252") charset = "windows-1252";
  let stream: ReadableStream<Uint8Array> = res.body;
  if (gzip) stream = stream.pipeThrough(new DecompressionStream("gzip"));
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder("utf-8"); }
  const reader = stream.getReader();
  let buf = "";
  let header: string[] | null = null;
  const handle = (line: string) => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) return;
    const cells = line.split("\t");
    if (!header) {
      header = cells.map((h) => h.trim());
      // Amazon sometimes returns an error message as the "document" (e.g. "Date range exceeded")
      if (requiredColumn && !header.includes(requiredColumn)) throw new Error(`Unexpected report content: ${line.slice(0, 200)}`);
      return;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = (cells[i] ?? "").trim();
    onRow(row);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  buf += decoder.decode();
  if (buf) handle(buf);
}

/** Minimal CSV parser (handles quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

// ---------- crypto ----------

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex || randomToken(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, key, 256);
  return { salt, hash: b64(bits) };
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
