import {
  NEWSLETTER_BLOCKS,
  NEWSLETTER_SLOTS,
  SLOT_LABELS,
  type NewsletterBlock,
  type NewsletterLayout,
  type NewsletterSlot,
} from "@/lib/newsletter-layout";

/**
 * One dropdown per print newsletter box (fields named layout_<block>). With
 * `inherited`, each dropdown also offers "Usual place", which saves nothing.
 */
export function NewsletterLayoutFields({
  values,
  inherited,
}: {
  values: NewsletterLayout;
  inherited?: Record<NewsletterBlock, NewsletterSlot>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        Always in place: Weekly Schedule (top of page 1 – left), Farbrengen (top of page 1 – right) and Week in Jewish
        History (page 2 – right). Boxes in the same column follow the order of this list, and boxes with nothing in them that
        week are left out.
      </p>
      <div className="divide-y divide-stone-100 rounded border border-stone-200">
        {NEWSLETTER_BLOCKS.map((b) => (
          <label key={b.key} className="grid grid-cols-[1fr_11rem] items-center gap-2 px-3 py-1.5 text-sm">
            <span>{b.label}</span>
            <select name={`layout_${b.key}`} defaultValue={values[b.key] ?? ""} className="input w-full py-1 text-sm">
              {inherited && <option value="">Usual ({SLOT_LABELS[inherited[b.key]]})</option>}
              {NEWSLETTER_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
