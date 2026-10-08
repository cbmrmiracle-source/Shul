import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth/server";
import { createProfile } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Davening Profiles" };

export default async function ProfilesPage() {
  await requireAuth();
  const profiles = await db.select().from(schema.scheduleProfile).orderBy(asc(schema.scheduleProfile.name));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">Davening Profiles</h1>
        <p className="mt-1 text-sm text-stone-600">
          A profile holds the rules for the weekly davening times (e.g. Summer, Winter). A new week uses the profile
          whose date range covers it, or the default.
        </p>
      </div>
      <section className="card">
        <ul className="divide-y divide-stone-100">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link href={`/profiles/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                <span className="font-medium">{p.name}</span>
                {p.isDefault && <span className="badge-auto">default</span>}
                <span className="ml-auto text-sm text-stone-500">
                  {p.activeFrom || p.activeTo ? `${p.activeFrom ?? "…"} → ${p.activeTo ?? "…"}` : "No date range"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-navy">New profile</h2>
        <form action={createProfile} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input name="name" required placeholder="Winter 5787" className="input mt-1 block w-56" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Copy rows from</span>
            <select name="copyFrom" className="input mt-1 block w-56">
              <option value="">(start empty)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary">Create</button>
        </form>
      </section>
    </div>
  );
}
