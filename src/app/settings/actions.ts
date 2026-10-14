"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import type { ZmanimSettings } from "@/lib/calendar/zmanim";
import { saveDocument, saveImage } from "@/lib/storage/images";
import { getOrganization, resyncOpenWeeks } from "@/lib/weeks";

const roundMode = z.enum(["nearest", "floor", "ceil"]);

const settingsSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim(),
  zip: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim(),
  website: z.string().trim(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  candleLightingMinutes: z.coerce.number().int().min(0).max(60),
  shabbosEndsDegrees: z.coerce.number().min(0).max(20),
  tzeisDegrees: z.coerce.number().min(0).max(20),
  roundCandleLighting: roundMode,
  roundShabbosEnds: roundMode,
  houseSpellings: z.string(),
  newsletterName: z.string().trim().max(200),
  sponsorNote: z.string().trim().max(1000),
  footerNote: z.string().trim().max(1000),
  eruvMapUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => u === "" || /^https?:\/\//i.test(u), "The Eruv map link must start with https://"),
  resourcesText: z.string().trim().max(1000),
  scheduleLabel: z.string().trim().max(200),
  mailchimpAudienceId: z.string().trim().max(100).optional(),
});

/** "Bereshis = Bereishis" per line → { Bereshis: "Bereishis" } */
function parseSpellings(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [from, to] = line.split("=").map((s) => s?.trim());
    if (from && to) out[from] = to;
  }
  return out;
}

export async function saveSettings(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAuth();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  const s = parsed.data;
  const org = await getOrganization();
  let logoAssetId = org.logoAssetId;
  if (form.get("removeLogo") === "on") logoAssetId = null;
  let scheduleAssetId = org.emailSettings.scheduleAssetId ?? null;
  if (form.get("removeSchedule") === "on") scheduleAssetId = null;
  const scheduleFile = form.get("scheduleFile");
  if (scheduleFile instanceof File && scheduleFile.size > 0) {
    try {
      scheduleAssetId = (await saveDocument(scheduleFile)).id;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      logoAssetId = (await saveImage(logo)).id;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  const zmanim: ZmanimSettings = {
    ...org.zmanim,
    latitude: s.latitude,
    longitude: s.longitude,
    timezone: s.timezone,
    candleLightingMinutes: s.candleLightingMinutes,
    shabbosEndsDegrees: s.shabbosEndsDegrees,
    tzeisDegrees: s.tzeisDegrees,
    rounding: { ...org.zmanim.rounding, candleLighting: s.roundCandleLighting, shabbosEnds: s.roundShabbosEnds },
  };
  await db
    .update(schema.organization)
    .set({
      name: s.name,
      address: s.address,
      zip: s.zip,
      phone: s.phone,
      email: s.email,
      website: s.website,
      zmanim,
      houseSpellings: parseSpellings(s.houseSpellings),
      logoAssetId,
      emailSettings: {
        newsletterName: s.newsletterName,
        sponsorNote: s.sponsorNote,
        footerNote: s.footerNote,
        eruvMapUrl: s.eruvMapUrl,
        resourcesText: s.resourcesText,
        scheduleLabel: s.scheduleLabel,
        scheduleAssetId,
        // Keep the saved audience when the Mailchimp section isn't shown (not connected).
        mailchimpAudienceId: s.mailchimpAudienceId ?? org.emailSettings.mailchimpAudienceId,
      },
    })
    .where(eq(schema.organization.id, org.id));
  const n = await resyncOpenWeeks();
  revalidatePath("/", "layout");
  return `Saved. Recalculated ${n} open week${n === 1 ? "" : "s"}.`;
}
