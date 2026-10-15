"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { layoutFromForm } from "@/lib/newsletter-layout";
import { getWeekByDate } from "@/lib/weeks";

/** Save this week's print newsletter layout ("Usual place" leaves a box on the shul's default). */
export async function saveWeekLayout(form: FormData) {
  await requireAuth();
  const date = String(form.get("weekDate") ?? "");
  if (!isCivilDate(date)) throw new Error("Bad week");
  const week = await getWeekByDate(date);
  if (!week) throw new Error("Week not found");
  const layout = form.get("reset") ? {} : layoutFromForm(form);
  await db.update(schema.week).set({ newsletterLayout: layout }).where(eq(schema.week.id, week.id));
  revalidatePath(`/weeks/${date}`, "layout");
  redirect(`/weeks/${date}/layout?saved=${Date.now()}`);
}
