// Runs inside the page: numbers interactive elements (data-cref) and collects visible text.
export function pageSnapshot({ viewportOnly = false, maxElements = 400 } = {}) {
  document.querySelectorAll("[data-cref]").forEach((el) => el.removeAttribute("data-cref"));
  const sel = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary", "label[for]",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]", "[role=menuitem]",
    "[role=option]", "[role=switch]", "[role=combobox]", "[role=textbox]", "[role=slider]", "[role=searchbox]",
    "[contenteditable=''],[contenteditable=true]", "[onclick]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
    const inView = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    if (viewportOnly && !inView) continue;
    if (out.length >= maxElements) break;
    const ref = String(++n);
    el.setAttribute("data-cref", ref);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "select" ? "select" : tag === "textarea" ? "textbox" : tag === "input" ? (el.type || "text") : tag);
    const labelText = el.labels?.[0]?.innerText;
    const name = (el.getAttribute("aria-label") || labelText || el.getAttribute("title") || el.getAttribute("alt") || el.innerText || el.getAttribute("placeholder") || el.value || el.getAttribute("name") || "")
      .replace(/\s+/g, " ").trim().slice(0, 80);
    const item = { ref, role, name, inView };
    if (tag === "input" || tag === "textarea") {
      if (el.type === "password") item.value = el.value ? "••••" : "";
      else if (el.type === "checkbox" || el.type === "radio") item.checked = el.checked;
      else item.value = String(el.value ?? "").slice(0, 60);
      if (el.placeholder) item.placeholder = el.placeholder.slice(0, 40);
    }
    if (tag === "select") item.value = el.options[el.selectedIndex]?.text?.slice(0, 60);
    if (tag === "a") item.href = el.getAttribute("href")?.slice(0, 120);
    if (el.disabled) item.disabled = true;
    out.push(item);
  }
  return {
    url: location.href,
    title: document.title,
    scroll: { x: Math.round(scrollX), y: Math.round(scrollY), maxY: Math.max(0, document.documentElement.scrollHeight - vh) },
    viewport: { width: vw, height: vh },
    elements: out,
    text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n"),
  };
}

// Records the human's own clicks / typing while record mode is on.
export const USER_ACTION_SCRIPT = `(() => {
  if (window.__claudeRecInstalled) return; window.__claudeRecInstalled = true;
  const send = (ev) => { try { window.__claudeRecord && window.__claudeRecord(ev); } catch {} };
  const describe = (el) => {
    if (!el || !el.tagName) return {};
    const path = []; let e = el;
    while (e && e.nodeType === 1 && path.length < 5) {
      let p = e.tagName.toLowerCase();
      if (e.id) { p += '#' + e.id; path.unshift(p); break; }
      const cls = (e.className && typeof e.className === 'string') ? e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      if (cls) p += '.' + cls;
      path.unshift(p); e = e.parentElement;
    }
    return { tag: el.tagName.toLowerCase(), id: el.id || undefined, name: el.getAttribute('name') || undefined,
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80) || undefined, path: path.join(' > ') };
  };
  addEventListener('click', (e) => send({ type: 'click', x: e.clientX, y: e.clientY, target: describe(e.target) }), true);
  addEventListener('change', (e) => { const t = e.target; send({ type: 'change', target: describe(t), value: t.type === 'password' ? '••••' : String(t.value ?? '').slice(0, 200) }); }, true);
  addEventListener('submit', (e) => send({ type: 'submit', target: describe(e.target), action: e.target.action }), true);
  addEventListener('keydown', (e) => { if (['Enter', 'Escape', 'Tab'].includes(e.key)) send({ type: 'key', key: e.key, target: describe(e.target) }); }, true);
})();`;
