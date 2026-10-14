"use client";

import { useActionState } from "react";
import { keepFormOnSubmit } from "@/components/use-keep-form";
import { pushToMailchimp, sendMailchimpTest } from "./mailchimp-actions";

export function MailchimpPanel({
  weekDate,
  configured,
  audienceChosen,
  existingUrl,
  pushedAt,
}: {
  weekDate: string;
  configured: boolean;
  audienceChosen: boolean;
  existingUrl: string | null;
  pushedAt: string | null;
}) {
  const [push, pushAction, pushing] = useActionState(pushToMailchimp, null);
  const [test, testAction, testing] = useActionState(sendMailchimpTest, null);
  const url = push?.url ?? existingUrl;

  if (!configured || !audienceChosen) {
    return (
      <div className="rounded bg-stone-50 p-3 text-xs text-stone-600">
        <strong>Send straight to Mailchimp:</strong>{" "}
        {configured ? (
          <>
            choose your audience in <a href="/settings#mailchimp" className="text-navy underline">Settings → Mailchimp</a>.
          </>
        ) : (
          <>
            not connected yet. See <a href="/settings#mailchimp" className="text-navy underline">Settings → Mailchimp</a>.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-navy/20 bg-sky-50/40 p-3 text-sm">
      <form onSubmit={keepFormOnSubmit(pushAction)} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="weekDate" value={weekDate} />
        <button className="btn-primary" disabled={pushing}>
          {pushing ? "Sending to Mailchimp…" : existingUrl ? "Update Mailchimp draft" : "Send to Mailchimp (draft)"}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="btn">
            Open in Mailchimp ↗
          </a>
        )}
      </form>
      {push?.ok && <p className="text-green-800">{push.ok}</p>}
      {push?.error && <p className="text-red-700">{push.error}</p>}
      {!push && pushedAt && (
        <p className="text-xs text-stone-500">Last sent to Mailchimp {new Date(pushedAt).toLocaleString("en-US")}.</p>
      )}
      {url && (
        <form onSubmit={keepFormOnSubmit(testAction)} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="weekDate" value={weekDate} />
          <input name="emails" type="text" placeholder="Send a test to: you@example.com" className="input w-64" />
          <button className="btn btn-sm" disabled={testing}>
            {testing ? "Sending…" : "Send test"}
          </button>
          {test?.ok && <span className="text-green-800">{test.ok}</span>}
          {test?.error && <span className="text-red-700">{test.error}</span>}
        </form>
      )}
      <p className="text-xs text-stone-500">
        This makes a <strong>draft</strong> only. Nothing goes to your list until you click Send in Mailchimp.
        Click the button again after changes to update the same draft.
      </p>
    </div>
  );
}
