/**
 * A tiny HTML templating helper. Interpolated values are escaped unless they
 * are themselves the result of `html` (or wrapped in `raw`). Arrays are joined.
 *
 *   html`<p>${name}</p>`                → name is escaped
 *   html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export type HtmlValue = SafeHtml | string | number | null | undefined | false | HtmlValue[];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(render).join("");
  if (value instanceof SafeHtml) return value.value;
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** Trusted markup, e.g. embedded CSS. Never pass user input. */
export function raw(s: string): SafeHtml {
  return new SafeHtml(s);
}

const HEBREW_RUN = /[\u0590-\u05FF][\u0590-\u05FF\s"'׳״\-.,]*[\u0590-\u05FF׳״"']|[\u0590-\u05FF]/g;

/** Escape, then apply **bold**, isolate Hebrew runs, and turn newlines into <br>. */
function inlineMarkup(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(HEBREW_RUN, (m) => `<bdi dir="rtl" lang="he" class="he">${m}</bdi>`)
    .replace(/\n/g, "<br>");
}

/**
 * Minimal formatting for text people type: escapes everything, turns
 * **bold** into <strong>, wraps Hebrew so it reads correctly inside English,
 * and keeps line breaks. Blank lines start a paragraph.
 */
export function formatText(text: string): SafeHtml {
  return raw(
    text
      .trim()
      .split(/\n\s*\n/)
      .map((p) => `<p>${inlineMarkup(p)}</p>`)
      .join(""),
  );
}

/** The same formatting without paragraph tags, for text inside a line. */
export function formatInline(text: string): SafeHtml {
  return raw(inlineMarkup(text.trim()));
}

/** Wrap right-to-left text so it doesn't scramble surrounding punctuation. */
export function he(text: string): SafeHtml {
  return html`<bdi dir="rtl" lang="he" class="he">${text}</bdi>`;
}

/** Wrap any Hebrew runs inside mixed text in <bdi>, escaping the rest. */
export function bidi(text: string): SafeHtml {
  return raw(
    escapeHtml(text).replace(
      /[֐-׿][֐-׿\s"'׳״\-.,]*[֐-׿׳״"']/g,
      (m) => `<bdi dir="rtl" lang="he" class="he">${m}</bdi>`,
    ),
  );
}
