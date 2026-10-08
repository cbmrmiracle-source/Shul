import Link from "next/link";
import type { Publication } from "@/db/schema";
import type { WeekContentItem } from "@/lib/content/service";
import { CONTENT_TYPE_ORDER, CONTENT_TYPES } from "@/lib/content/types";
import { approveAllPending, approveItem, setItemHidden, toggleItemPlacement } from "./content-actions";

function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}

function ItemRow({ item, pubs, date }: { item: WeekContentItem; pubs: Publication[]; date: string }) {
  const type = CONTENT_TYPES[item.type];
  const off = item.hidden || item.skipped;
  const summary = type.summary(item);
  return (
    <div id={`item-${item.id}`} className={`scroll-mt-20 py-2 ${off ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{item.title || summary || type.label}</span>
            {item.source === "import" && <span className="badge-auto">from list</span>}
            {item.reviewStatus === "pending" && <span className="badge-override">needs review</span>}
            {item.recurring && (
              <span className="badge-manual" title={`From ${item.recurringFrom}${item.recurringUntil ? ` until ${item.recurringUntil}` : ""}`}>
                repeats weekly
              </span>
            )}
            {off && <span className="badge-manual">hidden this week</span>}
            {item.imageAssetId && <span className="badge-manual">image</span>}
          </div>
          {item.title && summary && <div className="truncate text-sm text-stone-500">{summary}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {item.reviewStatus === "pending" && (
            <form action={approveItem}>
              <Hidden name="weekDate" value={date} />
              <Hidden name="itemId" value={item.id} />
              <button className="btn btn-sm border-green-600 text-green-800">Approve</button>
            </form>
          )}
          <Link href={`/weeks/${date}/items/${item.id}`} className="btn btn-sm">
            Edit
          </Link>
          <form action={setItemHidden}>
            <Hidden name="weekDate" value={date} />
            <Hidden name="itemId" value={item.id} />
            <Hidden name="hidden" value={String(!off)} />
            <button className="btn btn-sm">{off ? "Show" : "Hide"}</button>
          </form>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1" aria-label="Where this appears">
        {pubs.map((p) => {
          const on = item.placements.has(p.id);
          const customized = on && Object.keys(item.placements.get(p.id) ?? {}).length > 0;
          return (
            <form key={p.id} action={toggleItemPlacement}>
              <Hidden name="weekDate" value={date} />
              <Hidden name="itemId" value={item.id} />
              <Hidden name="publicationId" value={p.id} />
              <Hidden name="on" value={String(!on)} />
              <button
                title={`${on ? "Remove from" : "Add to"} ${p.name}${customized ? " (customized)" : ""}`}
                aria-pressed={on}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  on ? "border-navy bg-navy text-white" : "border-stone-300 bg-white text-stone-400 hover:text-stone-700"
                }`}
              >
                {on ? "✓ " : ""}
                {p.shortName}
                {customized ? " ✎" : ""}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

export function ContentSection({ items, pubs, date }: { items: WeekContentItem[]; pubs: Publication[]; date: string }) {
  const pending = items.filter((i) => i.reviewStatus === "pending" && !i.hidden && !i.skipped);
  const typesPresent = CONTENT_TYPE_ORDER.filter((t) => items.some((i) => i.type === t));

  return (
    <section id="content" className="card scroll-mt-4">
      <div className="card-header">
        <h2 className="font-semibold text-navy">Content</h2>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <form action={approveAllPending} className="flex items-center gap-2">
              <Hidden name="weekDate" value={date} />
              <span className="text-sm text-amber-800">{pending.length} need review</span>
              <button className="btn btn-sm">Approve all</button>
            </form>
          )}
          <Link href={`/weeks/${date}/placements`} className="btn btn-sm">
            Placement grid
          </Link>
        </div>
      </div>

      <div className="border-t border-stone-100 px-4 py-3">
        <div className="mb-1 text-xs font-semibold text-stone-500 uppercase">Add</div>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_TYPE_ORDER.map((t) => (
            <Link key={t} href={`/weeks/${date}/items/new?type=${t}`} className="btn btn-sm">
              {CONTENT_TYPES[t].icon} {CONTENT_TYPES[t].label}
            </Link>
          ))}
        </div>
      </div>

      {typesPresent.length === 0 && (
        <p className="border-t border-stone-100 px-4 py-4 text-sm text-stone-500">
          Nothing added yet. Yahrzeits and birthdays appear here automatically once their lists are pasted in{" "}
          <Link href="/people" className="text-navy underline">
            Yahrzeits &amp; Birthdays
          </Link>
          .
        </p>
      )}

      {typesPresent.map((t) => {
        const type = CONTENT_TYPES[t];
        return (
          <div key={t} className="border-t border-stone-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">
                {type.icon} {type.section}
              </h3>
              <Link href={`/weeks/${date}/items/new?type=${t}`} className="text-xs text-navy hover:underline">
                + Add {type.label}
              </Link>
            </div>
            <div className="divide-y divide-stone-100">
              {items
                .filter((i) => i.type === t)
                .map((item) => (
                  <ItemRow key={item.id} item={item} pubs={pubs} date={date} />
                ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
