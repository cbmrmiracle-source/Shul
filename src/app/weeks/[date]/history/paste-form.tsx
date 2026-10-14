"use client";

import { useActionState, useState } from "react";
import { keepFormOnSubmit } from "@/components/use-keep-form";
import { parseHistoryPaste } from "@/lib/content/history-paste";
import { saveHistoryPaste } from "./actions";

export function HistoryPasteForm({ weekDate, existing }: { weekDate: string; existing: number }) {
  const [state, action, saving] = useActionState(saveHistoryPaste, null);
  const [text, setText] = useState("");
  const { events, problems } = parseHistoryPaste(text);

  return (
    <form onSubmit={keepFormOnSubmit(action)} className="space-y-4">
      <input type="hidden" name="weekDate" value={weekDate} />
      <div className="card space-y-3 p-4">
        <label className="block text-sm font-medium text-stone-700" htmlFor="text">
          Paste this week&apos;s Jewish History from Chabad.org
        </label>
        <textarea
          id="text"
          name="text"
          rows={16}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input w-full font-mono text-xs"
          placeholder={"Shabbos\n\nThe Rambam Visits Yerushalayim (1165)\nAfter leaving Morocco, the Rambam visited…\n\nSunday\n\nPassing of R. Meir Shapiro (1933)\nRabbi Meir Shapiro of Lublin…"}
        />
        <p className="text-xs text-stone-500">
          Day names on their own line (Shabbos, Sunday … Friday), then each event&apos;s title on one line and its text
          underneath. Check the preview below before saving.
        </p>
        {existing > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="replace" defaultChecked />
            Replace the {existing} Jewish History {existing === 1 ? "entry" : "entries"} already in this week
          </label>
        )}
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button className="btn-primary" disabled={saving || events.length === 0}>
          {saving ? "Saving…" : `Save ${events.length} ${events.length === 1 ? "event" : "events"}`}
        </button>
      </div>

      {text.trim() && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-navy">Preview</h2>
          {problems.length > 0 && (
            <ul className="mb-3 list-disc rounded bg-amber-50 py-2 pr-3 pl-6 text-xs text-amber-900">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <div className="space-y-3 text-sm">
            {events.map((e, i) => (
              <div key={i}>
                {(i === 0 || events[i - 1].day !== e.day) && (
                  <div className="mt-2 text-xs font-semibold text-stone-500 uppercase">
                    {e.day || "No day"}
                    {e.hebrewDate && ` · ${e.hebrewDate}`}
                  </div>
                )}
                <div className="font-semibold">{e.title}</div>
                <div className="whitespace-pre-line text-stone-700">{e.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
