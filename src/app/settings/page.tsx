import { requireAuth } from "@/lib/auth/server";
import { getOrganization } from "@/lib/weeks";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAuth();
  const org = await getOrganization();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-navy">Settings</h1>
      <SettingsForm org={org} />
    </div>
  );
}
