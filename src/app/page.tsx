import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { formatGregorianLong, todayCivil, shabbosOnOrAfter } from "@/lib/calendar/dates";
import { getOrganization, listWeeks } from "@/lib/weeks";
import { startWeek } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireAuth();
  const [org, weeks] = await Promise.all([getOrganization(), listWeeks()]);
  const today = todayCivil(org.zmanim.timezone);
  const upcoming = shabbosOnOrAfter(today);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-lg font-semibold text-navy">Start a week</h1>
        <p className="mt-1 text-sm text-stone-600">
          Pick any date. The week opens for the Shabbos on or after it, with the parsha, dates, zmanim and
          davening times filled in automatically.
        </p>
        <form action={startWeek} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium">Date</span>
            <input type="date" name="date" defaultValue={upcoming} required className="input mt-1 block" />
          </label>
          <button className="btn-primary">Open week</button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-navy">Weeks</h2>
        </div>
        {weeks.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-stone-500">No weeks yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {weeks.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/weeks/${w.shabbosDate}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50"
                >
                  <span className="w-40 text-sm text-stone-500">{formatGregorianLong(w.shabbosDate)}</span>
                  <span className="font-medium">
                    {w.calendarOverrides.shabbosTitleEn || w.calendarAuto.shabbosTitle.en}
                  </span>
                  <span className="hebrew text-stone-600">
                    {w.calendarOverrides.shabbosTitleHe || w.calendarAuto.shabbosTitle.he}
                  </span>
                  <span className="ml-auto badge-manual">{w.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
