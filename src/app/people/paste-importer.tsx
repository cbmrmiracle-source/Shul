"use client";

import { useState, useTransition } from "react";
import type { PersonDateKind } from "@/db/schema";
import { PERSON_FIELDS, type ColumnMapping } from "@/lib/people/import-fields";
import { importPeople, previewPeople, type PreviewResponse } from "./actions";

export function PasteImporter({ kind }: { kind: PersonDateKind }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (mapping?: ColumnMapping, hasHeader?: boolean) =>
    start(async () => {
      setMessage(null);
      const res = await previewPeople({ kind, text, mapping, hasHeader });
      if ("error" in res) setMessage({ error: res.error });
      else setPreview(res);
    });

  const save = () =>
    start(async () => {
      if (!preview) return;
      const res = await importPeople({ kind, text, mapping: preview.mapping, hasHeader: preview.hasHeader });
      setMessage(res);
      if ("ok" in res) {
        setPreview(null);
        setText("");
      }
    });

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-navy">Paste from the spreadsheet</h2>
      <p className="mt-1 mb-3 text-sm text-stone-600">
        In Google Sheets, select all the rows (including the heading row), copy, and paste here. Pasting replaces the
        whole list, so always paste the full sheet.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={6}
        placeholder="Paste here…"
        className="input w-full font-mono text-xs"
        aria-label="Spreadsheet rows"
      />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn" disabled={!text.trim() || pending} onClick={() => run()}>
          {pending && !preview ? "Reading…" : "Preview"}
        </button>
        {message?.ok && <span className="text-sm text-green-700">{message.ok}</span>}
        {message?.error && <span className="text-sm text-red-700">{message.error}</span>}
      </div>

      {preview && (
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">What is in each column?</h3>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preview.hasHeader}
                onChange={(e) => run(undefined, e.target.checked)}
              />
              The first row is headings
            </label>
            <div className="mt-2 flex flex-wrap gap-3">
              {preview.headers.map((h, i) => (
                <label key={i} className="block text-sm">
                  <span className="block max-w-48 truncate text-xs text-stone-500" title={h}>
                    {h}
                  </span>
                  <select
                    value={preview.mapping[String(i)] ?? ""}
                    onChange={(e) => run({ ...preview.mapping, [String(i)]: e.target.value as ColumnMapping[string] }, preview.hasHeader)}
                    className="input mt-0.5"
                  >
                    <option value="">(ignore)</option>
                    {Object.entries(PERSON_FIELDS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={pending || preview.peopleCount === 0} onClick={save}>
              {pending ? "Saving…" : `Replace list with these ${preview.peopleCount}`}
            </button>
            {preview.errors.length > 0 && (
              <span className="text-sm text-amber-800">{preview.errors.length} rows will be skipped (see below)</span>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3">
              <h3 className="mb-1 text-sm font-semibold text-amber-900">Rows that can&apos;t be read</h3>
              <ul className="space-y-0.5 text-xs text-amber-900">
                {preview.errors.slice(0, 50).map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message} — <span className="text-stone-600">{e.cells.join(" | ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-stone-500">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Row</th>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Hebrew name</th>
                  <th className="px-3 py-1.5 font-medium">Read as</th>
                  <th className="px-3 py-1.5 font-medium">From</th>
                  {kind === "yahrzeit" && <th className="px-3 py-1.5 font-medium">Relation</th>}
                </tr>
              </thead>
              <tbody>
                {preview.people.map((p) => (
                  <tr key={p.row} className="border-t border-stone-100">
                    <td className="px-3 py-1 text-stone-400">{p.row}</td>
                    <td className="px-3 py-1">{p.nameEn}</td>
                    <td className="hebrew px-3 py-1 text-right">{p.nameHe}</td>
                    <td className="px-3 py-1 font-medium whitespace-nowrap">{p.date}</td>
                    <td className="px-3 py-1 text-stone-500">{p.dateText}</td>
                    {kind === "yahrzeit" && <td className="px-3 py-1">{p.relation}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.peopleCount > preview.people.length && (
              <p className="p-2 text-xs text-stone-500">…and {preview.peopleCount - preview.people.length} more</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
