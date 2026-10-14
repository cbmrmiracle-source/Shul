import { requireAuth } from "@/lib/auth/server";
import { createClient, listAudiences, mailchimpConfigured, type Audience } from "@/lib/mailchimp";
import { getOrganization } from "@/lib/weeks";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAuth();
  const org = await getOrganization();
  const configured = mailchimpConfigured();
  let audiences: Audience[] = [];
  let mailchimpError: string | null = null;
  if (configured) {
    try {
      audiences = await listAudiences(createClient());
    } catch (e) {
      mailchimpError = e instanceof Error ? e.message : String(e);
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-navy">Settings</h1>
      <SettingsForm org={org} mailchimp={{ configured, audiences, error: mailchimpError }} />
    </div>
  );
}
