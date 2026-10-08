import { describe, expect, it } from "vitest";
import { bidi, formatText, html, raw } from "@/lib/render/html";

describe("html", () => {
  it("escapes interpolated values", () => {
    expect(html`<p>${'<script>alert("x")</script>'}</p>`.value).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });
  it("nests and joins arrays without double escaping", () => {
    const items = ["a&b", "c"];
    expect(html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`.value).toBe("<ul><li>a&amp;b</li><li>c</li></ul>");
  });
  it("skips empty values", () => {
    expect(html`${null}${undefined}${false}${0}`.value).toBe("0");
    expect(html`${raw("<b>")}`.value).toBe("<b>");
  });
  it("formats typed text", () => {
    expect(formatText("Hello **world** <i>\nline two\n\nPara 2").value).toBe(
      "<p>Hello <strong>world</strong> &lt;i&gt;<br>line two</p><p>Para 2</p>",
    );
  });
  it("isolates Hebrew runs", () => {
    expect(bidi('In honor of יוסף חיים בן חנוך, father').value).toBe(
      'In honor of <bdi dir="rtl" lang="he" class="he">יוסף חיים בן חנוך</bdi>, father',
    );
  });
});
