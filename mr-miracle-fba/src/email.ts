// Email delivery. Two providers, whichever is configured (Settings → Connections or Worker secrets):
//  - Gmail SMTP with an App Password (GMAIL_USER + GMAIL_APP_PASSWORD)
//  - Resend API (RESEND_API_KEY) — without a verified domain it can only send to the Resend account's own address.
import { connect } from "cloudflare:sockets";

export interface Mail { to: string[]; subject: string; html: string }

export function emailProvider(get: (k: string) => string | null): "gmail" | "resend" | null {
  if (get("GMAIL_USER") && get("GMAIL_APP_PASSWORD")) return "gmail";
  if (get("RESEND_API_KEY")) return "resend";
  return null;
}

export async function sendMail(get: (k: string) => string | null, mail: Mail): Promise<void> {
  const to = mail.to.map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new Error("No recipient email set (Settings → Connections → Alert email).");
  const p = emailProvider(get);
  if (p === "gmail") return gmailSmtp(get("GMAIL_USER")!, get("GMAIL_APP_PASSWORD")!.replace(/\s+/g, ""), { ...mail, to });
  if (p === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${get("RESEND_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ from: get("RESEND_FROM") || "Mr Miracle FBA <onboarding@resend.dev>", to, subject: mail.subject, html: mail.html }),
    });
    if (!r.ok) throw new Error(`Resend: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return;
  }
  throw new Error("Email is not set up yet (Settings → Connections).");
}

const b64utf8 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function gmailSmtp(user: string, pass: string, mail: Mail) {
  const socket = connect({ hostname: "smtp.gmail.com", port: 465 }, { secureTransport: "on", allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const readReply = async (): Promise<{ code: number; text: string }> => {
    for (;;) {
      const lines = buf.split("\r\n");
      // a complete reply ends with a line "NNN text" (space after code)
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const text = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP connection closed: " + buf);
      buf += dec.decode(value, { stream: true });
    }
  };
  const send = async (line: string, expect: number[]) => {
    await writer.write(new TextEncoder().encode(line + "\r\n"));
    const r = await readReply();
    if (!expect.includes(r.code)) throw new Error(`Gmail SMTP: ${r.text.replace(new RegExp(pass, "g"), "***")}`);
    return r;
  };
  try {
    const hello = await readReply();
    if (hello.code !== 220) throw new Error("Gmail SMTP: " + hello.text);
    await send("EHLO mr-miracle-fba", [250]);
    await send("AUTH LOGIN", [334]);
    await send(btoa(user), [334]);
    await send(btoa(pass), [235]);
    await send(`MAIL FROM:<${user}>`, [250]);
    for (const t of mail.to) await send(`RCPT TO:<${t}>`, [250, 251]);
    await send("DATA", [354]);
    const body = b64utf8(mail.html).replace(/.{1,76}/g, "$&\r\n");
    const msg = [
      `From: Mr Miracle FBA System <${user}>`,
      `To: ${mail.to.join(", ")}`,
      `Subject: =?UTF-8?B?${b64utf8(mail.subject)}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@mr-miracle-fba>`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      body,
    ].join("\r\n");
    await send(msg + "\r\n.", [250]);
    await send("QUIT", [221]).catch(() => {});
  } finally {
    try { await socket.close(); } catch { /* ignore */ }
  }
}

/** Wraps content in a simple branded email layout. */
export function emailLayout(title: string, inner: string, link?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c2330">
<div style="max-width:860px;margin:0 auto;padding:24px">
<div style="background:#0f3d63;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
<div style="font-size:12px;letter-spacing:.08em;opacity:.8;text-transform:uppercase">Mr Miracle FBA System</div>
<div style="font-size:20px;font-weight:600;margin-top:4px">${title}</div></div>
<div style="background:#fff;padding:20px;border-radius:0 0 10px 10px;border:1px solid #e3e6eb;border-top:0">${inner}
${link ? `<p style="margin-top:24px"><a href="${link}" style="background:#0f3d63;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open dashboard</a></p>` : ""}
</div></div></body></html>`;
}

export function emailTable(headers: string[], rows: (string | number)[][]) {
  const th = headers.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e3e6eb;font-size:12px;color:#5b6575;white-space:nowrap">${h}</th>`).join("");
  const tr = rows.map((r, i) => `<tr style="background:${i % 2 ? "#fafbfc" : "#fff"}">${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #eef0f3;font-size:13px;vertical-align:top">${c}</td>`).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%">${th ? `<thead><tr>${th}</tr></thead>` : ""}<tbody>${tr}</tbody></table>`;
}
