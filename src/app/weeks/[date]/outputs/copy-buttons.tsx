"use client";

import { useState } from "react";

/** Copy a short piece of text (e.g. the subject line). */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** Fetch the current email HTML and put it on the clipboard for pasting into Mailchimp. */
export function CopyEmailHtml({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <button
      type="button"
      className="btn-primary"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          await navigator.clipboard.writeText(await res.text());
          setState("done");
          setTimeout(() => setState("idle"), 2000);
        } catch {
          setState("error");
        }
      }}
    >
      {state === "busy" ? "Copying…" : state === "done" ? "Copied ✓" : state === "error" ? "Copy failed – try Download" : "Copy HTML for Mailchimp"}
    </button>
  );
}
