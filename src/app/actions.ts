"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate, shabbosOnOrAfter } from "@/lib/calendar/dates";
import { createWeek } from "@/lib/weeks";

/** Start (or open) the week for the Shabbos on or after the chosen date. */
export async function startWeek(form: FormData): Promise<void> {
  await requireAuth();
  const date = String(form.get("date") ?? "");
  if (!isCivilDate(date)) throw new Error("Please choose a valid date.");
  const shabbos = shabbosOnOrAfter(date);
  await createWeek(shabbos);
  redirect(`/weeks/${shabbos}`);
}
