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

/**
 * Minimal formatting for text people type: escapes everything, turns
 * **bold** into <strong>, and line breaks into <br>. Blank lines start a paragraph.
 */
export function formatText(text: string): SafeHtml {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return raw(
    paragraphs
      .map(
        (p) =>
          `<p>${escapeHtml(p)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>")}</p>`,
      )
      .join(""),
  );
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
