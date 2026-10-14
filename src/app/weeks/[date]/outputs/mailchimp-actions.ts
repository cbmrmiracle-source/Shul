"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { createClient, MailchimpError, pushCampaign, sendTestEmail } from "@/lib/mailchimp";
import { publicBaseUrl, renderEmailForWeek } from "@/lib/render/service";
import { getOrganization, getWeekByDate } from "@/lib/weeks";

export type MailchimpState = { ok?: string; error?: string; url?: string } | null;

async function loadWeek(date: string) {
  if (!isCivilDate(date)) throw new Error("Bad week");
  const week = await getWeekByDate(date);
  if (!week) throw new Error("Week not found");
  return week;
}

/** Create or update this week's Mailchimp draft campaign with the current email. */
export async function pushToMailchimp(_prev: MailchimpState, form: FormData): Promise<MailchimpState> {
  await requireAuth();
  try {
    const week = await loadWeek(String(form.get("weekDate") ?? ""));
    const org = await getOrganization();
    const audienceId = org.emailSettings.mailchimpAudienceId;
    if (!audienceId) return { error: "Choose the Mailchimp audience first (Settings → Mailchimp)." };

    const h = await headers();
    const base = publicBaseUrl(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`);
    if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(base)) {
      return { error: "Images would point to this computer. Set PUBLIC_BASE_URL to the app's web address first." };
    }

    const email = await renderEmailForWeek(week, base);
    const client = createClient();
    const result = await pushCampaign(client, {
      audienceId,
      title: `${email.subject} (${week.shabbosDate})`,
      subject: email.subject,
      previewText: email.preheader,
      html: email.html,
      existingCampaignId: week.mailchimp?.campaignId,
    });
    await db
      .update(schema.week)
      .set({ mailchimp: { campaignId: result.campaignId, webId: result.webId, pushedAt: new Date().toISOString() } })
      .where(eq(schema.week.id, week.id));
    revalidatePath(`/weeks/${week.shabbosDate}/outputs`);
    return {
      ok: result.created
        ? "Draft campaign created in Mailchimp. Review it there and click Send when ready."
        : "Mailchimp draft updated with the latest email.",
      url: result.editUrl,
    };
  } catch (e) {
    return { error: e instanceof MailchimpError || e instanceof Error ? e.message : String(e) };
  }
}

/** Send a test of this week's draft to one or more addresses. */
export async function sendMailchimpTest(_prev: MailchimpState, form: FormData): Promise<MailchimpState> {
  await requireAuth();
  try {
    const week = await loadWeek(String(form.get("weekDate") ?? ""));
    if (!week.mailchimp) return { error: "Send the email to Mailchimp first." };
    const emails = String(form.get("emails") ?? "")
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!emails.length || !emails.every((e) => z.string().email().safeParse(e).success)) {
      return { error: "Enter a valid email address." };
    }
    await sendTestEmail(createClient(), week.mailchimp.campaignId, emails);
    return { ok: `Test sent to ${emails.join(", ")}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
