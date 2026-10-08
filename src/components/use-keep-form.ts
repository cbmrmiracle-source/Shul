"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 clears a form after its action runs, which loses what the user typed
 * when the server returns a validation error. Submitting through this handler
 * runs the same action without the reset.
 */
export function keepFormOnSubmit(action: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  };
}
