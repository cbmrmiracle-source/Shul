/**
 * Where each box goes in the print newsletter. Client-safe.
 *
 * Fixed: Weekly Schedule (page 1, top left), Farbrengen (page 1, top right)
 * and Week in Jewish History (page 2, right). Everything else can go in page
 * 1 left, page 1 right or page 2 left. Within a column, boxes keep the order
 * listed here.
 */

export const NEWSLETTER_SLOTS = ["p1-left", "p1-right", "p2-left"] as const;
export type NewsletterSlot = (typeof NEWSLETTER_SLOTS)[number];

export const SLOT_LABELS: Record<NewsletterSlot, string> = {
  "p1-left": "Page 1 – left",
  "p1-right": "Page 1 – right",
  "p2-left": "Page 2 – left",
};

export const NEWSLETTER_BLOCKS = [
  { key: "kids", label: "Kids Corner", default: "p1-left" },
  { key: "events", label: "Upcoming Events", default: "p1-right" },
  { key: "birthdays", label: "Happy Birthday", default: "p1-right" },
  { key: "mazalTov", label: "Mazal Tov", default: "p1-right" },
  { key: "yahrzeits", label: "Yartzeits", default: "p1-right" },
  { key: "condolences", label: "Condolences", default: "p1-right" },
  { key: "parsha", label: "Parsha in a Nutshell", default: "p2-left" },
  { key: "haftorah", label: "Haftorah in a Nutshell", default: "p2-left" },
  { key: "calendar", label: "This Week (Rosh Chodesh, fasts…)", default: "p2-left" },
  { key: "shiurim", label: "Shiurim", default: "p2-left" },
  { key: "riddle", label: "Parsha Riddle", default: "p2-left" },
  { key: "community", label: "Community Calendar", default: "p2-left" },
] as const satisfies readonly { key: string; label: string; default: NewsletterSlot }[];

export type NewsletterBlock = (typeof NEWSLETTER_BLOCKS)[number]["key"];
export type NewsletterLayout = Partial<Record<NewsletterBlock, NewsletterSlot>>;

export const isSlot = (s: unknown): s is NewsletterSlot => NEWSLETTER_SLOTS.includes(s as NewsletterSlot);

/** Built-in defaults, then the shul's settings, then this week's choices. */
export function resolveLayout(...layers: (NewsletterLayout | null | undefined)[]): Record<NewsletterBlock, NewsletterSlot> {
  const out = {} as Record<NewsletterBlock, NewsletterSlot>;
  for (const b of NEWSLETTER_BLOCKS) {
    out[b.key] = b.default;
    for (const layer of layers) {
      const s = layer?.[b.key];
      if (isSlot(s)) out[b.key] = s;
    }
  }
  return out;
}

/** Read the layout choices out of a submitted form (fields named layout_<block>). Blank = not set. */
export function layoutFromForm(form: FormData): NewsletterLayout {
  const out: NewsletterLayout = {};
  for (const b of NEWSLETTER_BLOCKS) {
    const v = form.get(`layout_${b.key}`);
    if (isSlot(v)) out[b.key] = v;
  }
  return out;
}
