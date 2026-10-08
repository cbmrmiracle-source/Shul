/**
 * The weekly email newsletter, rebuilt from the Mailchimp HTML the shul
 * already sends: 600px table layout, black header with gold divider, white and
 * light-grey sections, gold pill buttons, emoji section titles.
 *
 * Styles are written inline (Gmail and Outlook drop or limit <style> blocks);
 * the <style> block only adds mobile padding. Images must be public URLs, so
 * the caller supplies `imageUrl` to turn storage keys into links.
 */
import type { RenderData, RenderItem, ScheduleRow } from "./data";
import { bidi, formatInline, formatText, html, raw, type HtmlValue, type SafeHtml } from "./html";

export interface EmailOptions {
  /** Public URL for an uploaded file's storage key. */
  imageUrl: (storageKey: string) => string;
  /** Public URL of the placeholder logo, used when no logo has been uploaded. */
  placeholderLogoUrl: string;
}

const C = {
  bg: "#f2f2f2",
  gold: "#c6a43c",
  goldLight: "#f0d57a",
  cream: "#fff8e6",
  alt: "#fafafa",
  text: "#222222",
  muted: "#555555",
};
const FONT = "Arial, Helvetica, sans-serif";

interface Section {
  title: string;
  body: HtmlValue;
  /** Fixed background; otherwise sections alternate white / light grey like the original. */
  bg?: string;
}

function section(title: string, body: HtmlValue, opts: { bg?: string } = {}): Section {
  return { title, body, bg: opts.bg };
}

function renderSections(list: Section[]): SafeHtml {
  return html`${list.map((s, i) => {
    const bg = s.bg ?? (i % 2 === 0 ? "#ffffff" : C.alt);
    return html`<tr><td class="section" style="padding:30px;background-color:${bg};font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};">
<div style="font-size:20px;font-weight:bold;margin:0 0 15px 0;">${s.title}</div>
${s.body}
</td></tr>`;
  })}`;
}

function button(url: string, label: string): SafeHtml {
  return html`<a href="${url}" target="_blank" style="display:inline-block;padding:12px 22px;background:${C.gold};color:#ffffff;text-decoration:none;border-radius:25px;font-weight:bold;font-family:${FONT};margin-top:15px;">${label}</a>`;
}

function image(src: string | null, alt: string): SafeHtml {
  if (!src) return html``;
  return html`<img src="${src}" alt="${alt}" width="540" style="display:block;width:100%;max-width:540px;height:auto;border:0;border-radius:8px;margin:0 0 15px 0;">`;
}

function text(body: string): SafeHtml {
  return raw(formatText(body).value.replace(/<p>/g, '<p style="margin:0 0 12px 0;">'));
}

function scheduleLines(rows: ScheduleRow[], sep = " – "): SafeHtml {
  return html`${rows.map(
    (r) => html`${r.label}${r.display ? `${sep}${r.display}` : ""}<br>${r.note ? html`<span style="color:${C.muted};">${r.note}</span><br>` : ""}`,
  )}`;
}

const isMorning = (r: ScheduleRow) => Boolean(r.value && "times" in r.value && r.value.times[0] < 12 * 60);

function longDate(item: RenderItem): string {
  if (!item.eventDate) return "";
  const [y, m, d] = item.eventDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const by = (items: RenderItem[] | undefined, type: RenderItem["type"]) => (items ?? []).filter((i) => i.type === type);

export function emailSubject(d: RenderData): string {
  const name = d.org.emailSettings.newsletterName || d.org.name;
  return `${name} – ${d.titleEn}`;
}

/** Inbox preview line (hidden in the email body). */
export function emailPreheader(d: RenderData): string {
  return [d.candleLighting && `Candle Lighting ${d.candleLighting}`, d.shabbosEnds && `Shabbos Ends ${d.shabbosEnds}`]
    .filter(Boolean)
    .join(" · ");
}

export function renderEmail(d: RenderData, opts: EmailOptions): string {
  const items = d.items.email ?? [];
  const img = (i: RenderItem) => (i.imageKey ? opts.imageUrl(i.imageKey) : null);
  const logoUrl = d.logoKey ? opts.imageUrl(d.logoKey) : opts.placeholderLogoUrl;
  const sections: Section[] = [];

  // Shabbos schedule
  const friday = d.schedule.friday.filter((r) => r.key !== "candle_lighting" && !isMorning(r));
  const shabbos = d.schedule.shabbos;
  if (friday.length || shabbos.length) {
    sections.push(
      section(
        "📖 Shabbos Schedule",
        html`${friday.length ? html`<strong>Friday Night</strong><br>${scheduleLines(friday)}<br>` : ""}
${shabbos.length ? html`<strong>Shabbos Day</strong><br>${scheduleLines(shabbos)}` : ""}`,
      ),
    );
  }

  // Weekday schedule
  const fridayMorning = d.schedule.friday.filter(isMorning);
  if (d.schedule.sunday.length || d.schedule.weekday.length) {
    sections.push(
      section(
        "📅 Weekday Schedule",
        html`${d.schedule.sunday.length ? html`<strong>Sunday:</strong><br>${scheduleLines(d.schedule.sunday, ": ")}<br>` : ""}
${d.schedule.weekday.length ? html`<strong>Monday - Thursday:</strong><br>${scheduleLines(d.schedule.weekday, ": ")}` : ""}
${fridayMorning.length ? html`<br><strong>Friday:</strong><br>${scheduleLines(fridayMorning, ": ")}` : ""}`,
      ),
    );
  }

  // Eruv
  for (const e of by(items, "eruv")) {
    const status = e.fields.status;
    const headline =
      status === "kosher"
        ? html`<div style="font-size:18px;font-weight:bold;color:#2e7d32;margin-bottom:10px;">✅ The Eruv has been checked and is Kosher for this Shabbos.</div>`
        : status === "down"
          ? html`<div style="font-size:18px;font-weight:bold;color:#b3261e;margin-bottom:10px;">⚠️ The Eruv is NOT up this Shabbos.</div>`
          : html`<div style="font-size:18px;font-weight:bold;margin-bottom:10px;">The Eruv status will be updated before Shabbos.</div>`;
    sections.push(
      section(
        "🕍 Eruv Status",
        html`<div style="background:${C.cream};padding:18px;border-left:5px solid ${C.gold};border-radius:6px;">
${headline}${e.body ? text(e.body) : ""}${e.linkUrl ? button(e.linkUrl, e.linkLabel || "🗺️ View Eruv Map & Status") : ""}
</div>`,
      ),
    );
  }

  // Farbrengen sponsors
  const sponsors = by(items, "sponsor");
  if (sponsors.length) {
    sections.push(
      section(
        "🍷 Farbrengen Sponsors",
        html`<div style="background:#ffffff;color:#111111;padding:22px;border-radius:10px;border:1px solid ${C.goldLight};">
<strong style="color:${C.gold};font-size:14px;text-transform:uppercase;letter-spacing:1px;">${sponsors.length > 1 ? "Co-Sponsored By" : "Sponsored By"}</strong><br><br>
${sponsors.map(
  (s) => html`${image(img(s), s.title)}<strong>${s.title}</strong><br>
${s.body ? formatInline(s.body) : ""}${s.fields.dedicationHe ? html` <bdi dir="rtl" lang="he">${s.fields.dedicationHe}</bdi>` : ""}<br><br>`,
)}
${d.org.emailSettings.sponsorNote ? html`<span style="color:${C.muted};">${d.org.emailSettings.sponsorNote}</span>` : ""}
</div>`,
        { bg: C.cream },
      ),
    );
  }

  // Kids
  const kids = by(items, "kids_program");
  if (kids.length) {
    sections.push(
      section(
        "👦👧 Kids Program",
        html`${kids.map((k) => {
          const details = [k.fields.ages, k.eventTime, k.fields.location && `Location: ${k.fields.location}`].filter(Boolean).join(" | ");
          const status = k.fields.status === "no_program" ? " – NO PROGRAM this week" : k.fields.status === "back" ? " – We're back!" : "";
          return html`${image(img(k), k.title)}<p style="margin:0 0 12px 0;"><strong>${k.title}${status}</strong>${details ? html`<br>${details}` : ""}</p>
${k.body ? text(k.body) : ""}${k.linkUrl ? button(k.linkUrl, k.linkLabel || "Register") : ""}`;
        })}`,
      ),
    );
  }

  // Events
  const events = by(items, "event");
  if (events.length) {
    sections.push(
      section(
        "🎉 Upcoming Events",
        html`${events.map((e, i) => {
          const when = [longDate(e), e.eventTime].filter(Boolean).join(" · ");
          return html`${i > 0 ? html`<hr style="border:none;border-top:1px solid #e6e6e6;margin:25px 0;">` : ""}
${image(img(e), e.title)}
<div style="font-size:17px;font-weight:bold;">${e.title}</div>
${when ? html`<div style="color:${C.muted};">${when}${e.fields.location ? ` · ${e.fields.location}` : ""}</div>` : ""}
${e.fields.speaker ? html`<div><em>${e.fields.speaker}</em></div>` : ""}
${e.fields.sponsoredBy ? html`<div>Sponsored by ${e.fields.sponsoredBy}</div>` : ""}
${e.body ? html`<div style="margin-top:10px;">${text(e.body)}</div>` : ""}
${e.fields.registrationUrl ? button(e.fields.registrationUrl, "Register") : ""}
${e.linkUrl ? html` ${button(e.linkUrl, e.linkLabel || "More Info")}` : ""}`;
        })}`,
      ),
    );
  }

  // Shiurim
  const shiurim = by(items, "shiur");
  if (shiurim.length) {
    sections.push(
      section(
        "📚 Shiurim",
        html`${shiurim.map(
          (s) => html`<p style="margin:0 0 12px 0;"><strong>${s.title}</strong><br>
${[s.fields.day, s.eventTime].filter(Boolean).join(" | ")}${s.fields.speaker ? html`<br>${s.fields.speaker}` : ""}${s.fields.location ? html`<br>${s.fields.location}` : ""}${s.fields.audience ? html`<br><em>${s.fields.audience}</em>` : ""}</p>
${s.body ? text(s.body) : ""}`,
        )}`,
      ),
    );
  }

  // Custom blocks: each its own section, titled by the item
  for (const c of by(items, "custom")) {
    sections.push(
      section(
        c.title || "📣 Announcement",
        html`${image(img(c), c.title)}${c.body ? text(c.body) : ""}${c.linkUrl ? button(c.linkUrl, c.linkLabel || "Learn More") : ""}`,
      ),
    );
  }

  // Long-form sections, if placed in the email
  for (const [type, title] of [
    ["parsha_nutshell", "📜 Parsha in a Nutshell"],
    ["haftorah", "📖 Haftorah in a Nutshell"],
  ] as const) {
    for (const p of by(items, type)) sections.push(section(title, text(p.body)));
  }
  const history = by(items, "jewish_history");
  if (history.length) {
    sections.push(
      section(
        "🕰️ This Week in Jewish History",
        html`${history.map(
          (h) => html`<p style="margin:0 0 4px 0;"><strong>${h.title}</strong>${h.fields.day || h.hebrewDate ? html` <span style="color:${C.muted};">(${[h.fields.day, h.hebrewDate].filter(Boolean).join(", ")})</span>` : ""}</p>${text(h.body)}`,
        )}`,
      ),
    );
  }
  for (const r of by(items, "riddle")) {
    sections.push(
      section(
        "🧩 Parsha Riddle",
        html`${text(r.body)}${r.fields.answer ? html`<p style="margin:12px 0 0 0;color:${C.muted};"><em>Answer: ${r.fields.answer}</em></p>` : ""}`,
      ),
    );
  }

  // Mazal Tov
  const mazalTov = by(items, "mazal_tov");
  if (mazalTov.length) {
    sections.push(
      section(
        "🎊 Mazal Tov",
        html`${mazalTov.map(
          (m, i) => html`${i > 0 ? html`<br><br>` : ""}${
            m.body ? text(m.body) : html`Mazal tov to <strong>${m.title}</strong> ${m.fields.occasion ?? ""}`
          }`,
        )}`,
      ),
    );
  }

  // Birthdays, grouped by Hebrew date
  const birthdays = by(items, "birthday");
  if (birthdays.length) {
    const groups = new Map<string, string[]>();
    for (const b of birthdays) {
      const key = b.hebrewDate || "";
      groups.set(key, [...(groups.get(key) ?? []), b.title]);
    }
    sections.push(
      section(
        "🎂 Birthdays",
        html`${[...groups].map(([date, names]) => html`🎉${date ? `${date} - ` : ""}${names.join(", ")}<br>`)}`,
      ),
    );
  }

  // Yahrzeits
  const yahrzeits = by(items, "yahrzeit");
  if (yahrzeits.length) {
    sections.push(
      section(
        "🕯 Yahrzeits",
        html`${yahrzeits.map((y) => {
          const name = y.fields.nameHe ? html`<bdi dir="rtl" lang="he">${y.fields.nameHe}</bdi>` : html`${y.title}`;
          const date = y.hebrewDate ? html` - ${bidi(y.hebrewDate)}` : "";
          return html`🕯 ${name}${date}${y.fields.relation ? `, ${y.fields.relation}` : ""}<br>`;
        })}`,
      ),
    );
  }

  const footerLines = [d.org.name, d.org.address, d.org.phone, d.org.email].filter(Boolean);
  const year = d.days[1].date.slice(0, 4);

  return html`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${emailSubject(d)}</title>
<style type="text/css">
@media screen and (max-width:600px) {
  .section { padding:20px !important; }
  .hdr h1 { font-size:22px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${emailPreheader(d)}</div>
<center style="width:100%;background-color:${C.bg};padding-bottom:40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border-collapse:collapse;">

<tr><td align="center" style="padding:30px 20px;"><img src="${logoUrl}" width="180" alt="${d.org.name}" style="display:block;border:0;width:180px;max-width:100%;height:auto;"></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${C.gold};background-image:linear-gradient(to right, ${C.gold}, ${C.goldLight}, ${C.gold});">&nbsp;</td></tr>

<tr><td class="hdr" align="center" style="background:#111111;background-image:linear-gradient(135deg, #000000, #222222);color:#ffffff;text-align:center;padding:30px 20px;font-family:${FONT};">
<h1 style="margin:0;font-size:26px;font-weight:bold;"><bdi dir="rtl" lang="he">${d.titleHe}</bdi></h1>
<div style="margin-top:6px;font-size:15px;color:#dddddd;">${d.titleEn}</div>
<p style="margin:12px 0 0 0;font-size:16px;">${d.candleLighting ? html`🕯 Candle Lighting: ${d.candleLighting}<br>` : ""}${d.shabbosEnds ? html`⭐ Shabbos Ends: ${d.shabbosEnds}` : ""}</p>
</td></tr>

${renderSections(sections)}

<tr><td align="center" style="background:#111111;color:#cccccc;text-align:center;padding:25px;font-size:12px;font-family:${FONT};">
${footerLines.map((l) => html`${l}<br>`)}
${d.org.emailSettings.footerNote ? html`<br>${text(d.org.emailSettings.footerNote)}` : ""}
<br>© ${year} All Rights Reserved
</td></tr>

</table>
</center>
</body>
</html>`.value;
}
