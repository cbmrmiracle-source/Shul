"use client";

import { keepFormOnSubmit } from "@/components/use-keep-form";
import { useActionState, useState } from "react";
import type { ContentItem, PlacementVariant } from "@/db/schema";
import { CONTENT_TYPES, type ContentTypeKey, type ExtraField } from "@/lib/content/types";
import { removeItem, saveItem } from "../../content-actions";

type Pub = { id: number; name: string; shortName: string };

function Label({ text, help, children }: { text: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{text}</span>
      <div className="mt-1">{children}</div>
      {help && <span className="mt-0.5 block text-xs text-stone-500">{help}</span>}
    </label>
  );
}

function Extra({ field, value }: { field: ExtraField; value?: string }) {
  const name = `f_${field.name}`;
  if (field.input === "select") {
    return (
      <Label text={field.label} help={field.help}>
        <select name={name} defaultValue={value ?? field.options?.[0]?.value} className="input w-full">
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
    );
  }
  if (field.input === "textarea") {
    return (
      <Label text={field.label} help={field.help}>
        <textarea name={name} defaultValue={value} rows={3} className="input w-full" />
      </Label>
    );
  }
  return (
    <Label text={field.label} help={field.help}>
      <input
        name={name}
        type={field.input === "url" ? "url" : "text"}
        dir={field.input === "hebrew" ? "rtl" : undefined}
        defaultValue={value}
        placeholder={field.placeholder}
        className={`input w-full ${field.input === "hebrew" ? "hebrew" : ""}`}
      />
    </Label>
  );
}

function PlacementRow({ pub, variant }: { pub: Pub; variant?: PlacementVariant }) {
  const [on, setOn] = useState(variant !== undefined);
  const customized = Boolean(variant && (variant.title || variant.body || variant.hideImage));
  return (
    <div className="py-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" name={`pub_${pub.id}`} checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="font-medium">{pub.name}</span>
      </label>
      {on && (
        <details className="mt-1 ml-6" open={customized}>
          <summary className="cursor-pointer text-xs text-navy">Customize for {pub.shortName}</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input
              name={`v_${pub.id}_title`}
              defaultValue={variant?.title}
              placeholder="Shorter title (optional)"
              className="input"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`v_${pub.id}_hideImage`} defaultChecked={variant?.hideImage} />
              Don&apos;t show the image here
            </label>
            <textarea
              name={`v_${pub.id}_body`}
              defaultValue={variant?.body}
              rows={2}
              placeholder="Shorter text (optional)"
              className="input md:col-span-2"
            />
          </div>
        </details>
      )}
    </div>
  );
}

export function ItemForm({
  weekDate,
  typeKey,
  item,
  pubs,
  placements,
}: {
  weekDate: string;
  typeKey: ContentTypeKey;
  item: ContentItem | null;
  pubs: Pub[];
  placements: Record<number, PlacementVariant>;
}) {
  const type = CONTENT_TYPES[typeKey];
  const c = type.common;
  const [state, action, pending] = useActionState(saveItem, null);
  const [recurring, setRecurring] = useState(item ? item.weekId === null : false);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form onSubmit={keepFormOnSubmit(action)} className="space-y-4">
        <input type="hidden" name="weekDate" value={weekDate} />
        <input type="hidden" name="type" value={typeKey} />
        <input type="hidden" name="itemId" value={item?.id ?? ""} />

        <section className="card space-y-4 p-5">
          {c.title && (
            <Label text={c.title.label} help={c.title.help}>
              <input
                name="title"
                defaultValue={item?.title}
                placeholder={c.title.placeholder}
                required={type.titleRequired}
                className="input w-full"
                autoFocus={!item}
              />
            </Label>
          )}
          {(c.eventDate || c.eventTime || c.hebrewDate) && (
            <div className="grid gap-4 md:grid-cols-3">
              {c.eventDate && (
                <Label text={c.eventDate.label} help={c.eventDate.help}>
                  <input name="eventDate" type="date" defaultValue={item?.eventDate ?? ""} className="input w-full" />
                </Label>
              )}
              {c.eventTime && (
                <Label text={c.eventTime.label} help={c.eventTime.help}>
                  <input name="eventTime" defaultValue={item?.eventTime} placeholder={c.eventTime.placeholder} className="input w-full" />
                </Label>
              )}
              {c.hebrewDate && (
                <Label text={c.hebrewDate.label} help={c.hebrewDate.help}>
                  <input name="hebrewDate" defaultValue={item?.hebrewDate} placeholder={c.hebrewDate.placeholder} className="input w-full" />
                </Label>
              )}
            </div>
          )}
          {type.extra.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {type.extra.map((f) => (
                <Extra key={f.name} field={f} value={item?.fields[f.name]} />
              ))}
            </div>
          )}
          {c.body && (
            <Label text={c.body.label} help={c.body.help ?? "Use **double asterisks** for bold."}>
              <textarea
                name="body"
                defaultValue={item?.body}
                placeholder={c.body.placeholder}
                rows={typeKey === "parsha_nutshell" || typeKey === "haftorah" ? 14 : 5}
                className="input w-full"
              />
            </Label>
          )}
          {c.link && (
            <div className="grid gap-4 md:grid-cols-2">
              <Label text={c.link.label}>
                <input name="linkUrl" type="url" defaultValue={item?.linkUrl} placeholder="https://" className="input w-full" />
              </Label>
              <Label text="Button text">
                <input name="linkLabel" defaultValue={item?.linkLabel} placeholder="Learn more" className="input w-full" />
              </Label>
            </div>
          )}
          {c.image && (
            <Label text={c.image.label}>
              <div className="flex flex-wrap items-start gap-4">
                {(preview || item?.imageAssetId) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview ?? `/files/${item!.imageAssetId}`}
                    alt=""
                    className="max-h-40 rounded border border-stone-200"
                  />
                )}
                <div className="space-y-2">
                  <input
                    name="image"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPreview(f ? URL.createObjectURL(f) : null);
                    }}
                    className="block text-sm"
                  />
                  {item?.imageAssetId && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="removeImage" /> Remove image
                    </label>
                  )}
                </div>
              </div>
            </Label>
          )}
          {type.recurring && (
            <div className="rounded-lg bg-stone-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Repeat every week
              </label>
              {recurring && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  until
                  <input name="recurringUntil" type="date" defaultValue={item?.recurringUntil ?? ""} className="input" />
                  <span className="text-xs text-stone-500">
                    (leave blank for no end). Edits apply to every week; use Hide to skip one week.
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-navy">Where should this appear?</h2>
          <div className="divide-y divide-stone-100">
            {pubs.map((p) => (
              <PlacementRow key={p.id} pub={p} variant={placements[p.id]} />
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : item?.reviewStatus === "pending" ? "Save & approve" : "Save"}
          </button>
          <a href={`/weeks/${weekDate}#content`} className="btn">
            Cancel
          </a>
          {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
        </div>
      </form>

      {/* Imported items would come back on the next sync; they are hidden instead. */}
      {item && item.source !== "import" && (
        <form
          action={removeItem}
          onSubmit={(e) => {
            const msg = item.weekId === null ? "Delete this from every week it repeats in?" : "Delete this item?";
            if (!confirm(msg)) e.preventDefault();
          }}
        >
          <input type="hidden" name="weekDate" value={weekDate} />
          <input type="hidden" name="itemId" value={item.id} />
          <button className="btn btn-sm text-red-700">Delete</button>
        </form>
      )}
    </div>
  );
}
