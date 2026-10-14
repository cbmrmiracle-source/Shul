"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { parseHistoryPaste } from "@/lib/content/history-paste";
import { createItem, deleteItem, listWeekContent } from "@/lib/content/service";
import { getWeekByDate } from "@/lib/weeks";

export type HistoryPasteResult = { error: string } | null;

/** Save a pasted week of Jewish History as one item per event, in the pasted order. */
export async function saveHistoryPaste(_prev: HistoryPasteResult, form: FormData): Promise<HistoryPasteResult> {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  if (!isCivilDate(date)) return { error: "Bad week" };
  const week = await getWeekByDate(date);
  if (!week) return { error: "Week not found" };

  const text = String(form.get("text") ?? "");
  if (text.length > 50000) return { error: "That's too much text to paste at once" };
  const { events } = parseHistoryPaste(text);
  if (events.length === 0) return { error: "No events found. Paste the day names, titles and text." };

  if (form.get("replace") === "on") {
    for (const item of await listWeekContent(week)) {
      if (item.type === "jewish_history" && item.weekId === week.id) await deleteItem(item.id);
    }
  }
  for (const e of events) {
    await createItem(week, "jewish_history", {
      title: e.title.slice(0, 500),
      body: e.body.slice(0, 20000),
      fields: e.day ? { day: e.day } : {},
      imageAssetId: null,
      linkUrl: "",
      linkLabel: "",
      eventDate: null,
      eventTime: "",
      hebrewDate: e.hebrewDate.slice(0, 200),
      recurring: false,
      recurringUntil: null,
    });
  }
  revalidatePath(`/weeks/${date}`);
  redirect(`/weeks/${date}#content`);
}
