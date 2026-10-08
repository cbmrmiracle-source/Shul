import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { formatGregorianLong, isCivilDate } from "@/lib/calendar/dates";
import { ZMAN_KEYS, ZMAN_LABELS, type ZmanKey } from "@/lib/calendar/zmanim";
import { GROUP_LABELS, SCHEDULE_GROUPS } from "@/lib/schedule/rules";
import { formatTime } from "@/lib/time";
import { effectiveCalendar, getOrganization, getWeekByDate, listEntries } from "@/lib/weeks";
import { resyncWeek, saveTitleOverrides, saveZmanOverride } from "./actions";
import { AddEntryForm, ScheduleRow } from "./schedule-row";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: `Week of ${date}` };
}

/** The zmanim worth showing (and overriding) on the dashboard, by day index (0 = Friday). */
const KEY_ZMANIM: { day: number; zman: ZmanKey; label: string }[] = [
  { day: 0, zman: "candleLighting", label: "Candle Lighting" },
  { day: 0, zman: "sunset", label: "Friday Shkiah" },
  { day: 1, zman: "sunset", label: "Shabbos Shkiah" },
  { day: 1, zman: "shabbosEnds", label: "Shabbos Ends" },
  { day: 2, zman: "tzeis", label: "Sunday Tzeis" },
];

export default async function WeekPage({ params }: { params: Promise<{ date: string }> }) {
  await requireAuth();
  const { date } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();

  const [entries, org] = await Promise.all([listEntries(week.id), getOrganization()]);
  const auto = week.calendarAuto;
  const cal = effectiveCalendar(auto, week.calendarOverrides);
  const first = cal.days[0];
  const last = cal.days[cal.days.length - 1];
  const dayForGroup = { friday: cal.days[0], shabbos: cal.days[1], sunday: cal.days[2], weekday: cal.days[3] };

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-navy hover:underline">
        ← All weeks
      </Link>

      {/* Header ------------------------------------------------------------ */}
      <section className="card overflow-hidden">
        <div className="bg-navy px-5 py-4 text-white">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-2xl font-semibold">{cal.shabbosTitle.en}</h1>
            <span className="hebrew text-2xl text-gold-light">
              {cal.shabbosTitle.he} {cal.hebrewYearHe}
            </span>
            {cal.titleOverridden && <span className="badge-override">override</span>}
          </div>
          <p className="mt-1 text-sm text-white/80">
            Shabbos {cal.days[1].hebrew.en} {cal.days[1].hebrew.year} · {formatGregorianLong(date)}
            <span className="mx-2">|</span>
            Week: {first.weekday} {first.hebrew.en} ({first.gregorianShort}) – {last.weekday} {last.hebrew.en} (
            {last.gregorianShort})
          </p>
        </div>
        <div className="h-1 bg-gradient-to-r from-gold via-gold-light to-gold" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-500 uppercase">This week</h2>
            {cal.events.length === 0 ? (
              <p className="text-sm text-stone-500">No special days.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {cal.events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-24 shrink-0 text-stone-500">
                      {cal.days.find((d) => d.date === e.date)?.weekday}
                    </span>
                    <span>{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-stone-500 uppercase">Correct the title</summary>
            <form action={saveTitleOverrides} className="mt-3 space-y-2">
              <input type="hidden" name="weekId" value={week.id} />
              <label className="block">
                English <span className="text-stone-400">(auto: {auto.shabbosTitle.en})</span>
                <input name="shabbosTitleEn" defaultValue={week.calendarOverrides.shabbosTitleEn ?? ""} className="input mt-1 w-full" />
              </label>
              <label className="block">
                Hebrew <span className="text-stone-400">(auto: {auto.shabbosTitle.he})</span>
                <input name="shabbosTitleHe" dir="rtl" defaultValue={week.calendarOverrides.shabbosTitleHe ?? ""} className="input mt-1 w-full" />
              </label>
              <label className="block">
                Year <span className="text-stone-400">(auto: {auto.hebrewYearHe})</span>
                <input name="hebrewYearHe" dir="rtl" defaultValue={week.calendarOverrides.hebrewYearHe ?? ""} className="input mt-1 w-full" />
              </label>
              <p className="text-xs text-stone-500">Leave a box empty to use the automatic value.</p>
              <button className="btn">Save</button>
            </form>
          </details>
        </div>
      </section>

      {/* Zmanim ------------------------------------------------------------ */}
      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-navy">Zmanim</h2>
          <form action={resyncWeek} className="flex items-center gap-2 text-xs text-stone-500">
            <input type="hidden" name="weekId" value={week.id} />
            Last calculated {week.syncedAt.toLocaleString("en-US", { timeZone: org.zmanim.timezone })}
            <button className="btn btn-sm">Recalculate</button>
          </form>
        </div>
        <div className="divide-y divide-stone-100">
          {KEY_ZMANIM.map(({ day, zman, label }) => {
            const d = cal.days[day];
            const autoVal = auto.days[day].zmanim[zman];
            const overridden = cal.overriddenZmanim[d.date]?.includes(zman);
            return (
              <form key={`${day}-${zman}`} action={saveZmanOverride} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <input type="hidden" name="weekId" value={week.id} />
                <input type="hidden" name="date" value={d.date} />
                <input type="hidden" name="zman" value={zman} />
                <span className="w-40 font-medium">{label}</span>
                <span className="w-28 text-sm text-stone-500">{d.weekday} {d.gregorianShort}</span>
                <span className={`flex items-center gap-1.5 text-sm ${overridden ? "text-stone-400 line-through" : ""}`}>
                  <span className="badge-auto">auto</span>
                  {autoVal === null ? "—" : formatTime(autoVal)}
                </span>
                {overridden && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="badge-override">override</span>
                    {formatTime(d.zmanim[zman]!)}
                  </span>
                )}
                <input
                  name="value"
                  placeholder="Override, e.g. 7:30 PM"
                  defaultValue={overridden ? formatTime(d.zmanim[zman]!) : ""}
                  className="input ml-auto w-44"
                />
                <button className="btn btn-sm">Save</button>
              </form>
            );
          })}
        </div>
        <details className="border-t border-stone-100 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-navy">All zmanim for the week</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 pr-3 font-medium" />
                  {cal.days.map((d) => (
                    <th key={d.date} className="px-2 py-1 font-medium whitespace-nowrap">
                      {d.weekday.slice(0, 3)} {d.gregorianShort}
                      <div className="text-xs font-normal">{d.hebrew.en}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ZMAN_KEYS.map((k) => (
                  <tr key={k} className="border-t border-stone-100">
                    <td className="py-1 pr-3 whitespace-nowrap text-stone-600">{ZMAN_LABELS[k]}</td>
                    {cal.days.map((d) => (
                      <td key={d.date} className="px-2 py-1 tabular-nums">
                        {d.zmanim[k] === null ? "—" : formatTime(d.zmanim[k]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-stone-500">
              Calculated for the shul&apos;s location using Chabad&apos;s opinions (Alter Rebbe zmanim, candle
              lighting {org.zmanim.candleLightingMinutes} minutes before shkiah, Shabbos ends at{" "}
              {org.zmanim.shabbosEndsDegrees}°). Compare with Chabad.org and override if needed.
            </p>
          </div>
        </details>
      </section>

      {/* Davening ---------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-navy">Davening Times</h2>
          <span className="text-xs text-stone-500">
            Type a new time to override. Blank = use the automatic value.
          </span>
        </div>
        {SCHEDULE_GROUPS.map((group) => {
          const rows = entries.filter((e) => e.group === group);
          const d = dayForGroup[group];
          return (
            <div key={group} className="border-t border-stone-100 px-4 py-3">
              <h3 className="mb-1 text-sm font-semibold text-navy underline underline-offset-2">
                {group === "weekday" ? GROUP_LABELS.weekday : `${d.weekday}, ${d.hebrew.month} ${d.hebrew.day} — ${d.gregorianShort}`}
              </h3>
              <div className="divide-y divide-stone-50">
                {rows.map((entry) => (
                  <ScheduleRow key={entry.id} entry={entry} />
                ))}
              </div>
              <AddEntryForm weekId={week.id} group={group} />
            </div>
          );
        })}
      </section>

      <section className="card p-5 text-sm text-stone-500">
        Content (sponsors, events, mazal tov, yahrzeits, birthdays…) and publication previews are coming in the next phases.
      </section>
    </div>
  );
}
