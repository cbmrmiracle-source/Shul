// Natural-looking input: curved mouse paths, jittered targets, uneven timing.

const rand = (a, b) => a + Math.random() * (b - a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A point inside the box, biased toward the centre, never on the edge. */
export function pointInBox(box) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x = clamp(box.x + box.width / 2 + gaussian() * box.width * 0.15, box.x + box.width * 0.15, box.x + box.width * 0.85);
  const y = clamp(box.y + box.height / 2 + gaussian() * box.height * 0.15, box.y + box.height * 0.2, box.y + box.height * 0.8);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/** Moves along a cubic Bézier with slight overshoot-free wobble. */
export async function humanMove(page, state, x, y, steps) {
  const from = state.mouse ?? { x: rand(100, 400), y: rand(100, 300) };
  const dist = Math.hypot(x - from.x, y - from.y);
  const n = steps ?? Math.max(12, Math.min(45, Math.round(dist / 14)));
  const spread = Math.min(120, dist * 0.3);
  const c1 = { x: from.x + (x - from.x) * 0.3 + rand(-spread, spread), y: from.y + (y - from.y) * 0.3 + rand(-spread, spread) };
  const c2 = { x: from.x + (x - from.x) * 0.7 + rand(-spread, spread), y: from.y + (y - from.y) * 0.7 + rand(-spread, spread) };
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    const mt = 1 - t;
    const px = mt ** 3 * from.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * x;
    const py = mt ** 3 * from.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * y;
    await page.mouse.move(px, py);
    await sleep(rand(4, 14));
  }
  state.mouse = { x, y };
}

export async function humanClick(page, state, x, y, { button = "left", clickCount = 1 } = {}) {
  await humanMove(page, state, x, y);
  await sleep(rand(40, 140));
  for (let i = 1; i <= clickCount; i++) {
    await page.mouse.down({ button, clickCount: i });
    await sleep(rand(45, 120));
    await page.mouse.up({ button, clickCount: i });
    if (i < clickCount) await sleep(rand(60, 110));
  }
}

export async function humanType(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === " " ? rand(60, 220) : rand(35, 140));
    if (Math.random() < 0.03) await sleep(rand(200, 450)); // occasional thinking pause
  }
}

export async function humanWheel(page, dx = 0, dy = 0) {
  const total = Math.max(Math.abs(dx), Math.abs(dy));
  const ticks = Math.max(1, Math.round(total / rand(80, 120)));
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(dx / ticks, dy / ticks);
    await sleep(rand(30, 90));
  }
}
