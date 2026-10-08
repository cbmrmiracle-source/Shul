import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import { GROUP_LABELS, SCHEDULE_GROUPS } from "@/lib/schedule/rules";
import { ProfileForm, SlotEditor, NewSlotForm } from "./slot-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profileId = Number((await params).id);
  if (!Number.isInteger(profileId)) notFound();
  const [profile] = await db.select().from(schema.scheduleProfile).where(eq(schema.scheduleProfile.id, profileId));
  if (!profile) notFound();
  const slots = await db
    .select()
    .from(schema.scheduleSlot)
    .where(eq(schema.scheduleSlot.profileId, profileId))
    .orderBy(asc(schema.scheduleSlot.sortOrder), asc(schema.scheduleSlot.id));
  const slotOptions = slots.map((s) => ({ key: s.key, label: `${GROUP_LABELS[s.group]}: ${s.label}` }));

  return (
    <div className="space-y-6">
      <Link href="/profiles" className="text-sm text-navy hover:underline">
        ← All profiles
      </Link>
      <ProfileForm profile={profile} />
      {SCHEDULE_GROUPS.map((group) => (
        <section key={group} className="card">
          <div className="card-header">
            <h2 className="font-semibold text-navy">{GROUP_LABELS[group]}</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {slots
              .filter((s) => s.group === group)
              .map((slot) => (
                <SlotEditor key={slot.id} slot={slot} slotOptions={slotOptions.filter((o) => o.key !== slot.key)} />
              ))}
          </div>
          <NewSlotForm profileId={profile.id} group={group} slotOptions={slotOptions} />
        </section>
      ))}
    </div>
  );
}
