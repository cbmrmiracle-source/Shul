import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { listPublications, listWeekContent } from "@/lib/content/service";
import { CONTENT_TYPES } from "@/lib/content/types";
import { getWeekByDate } from "@/lib/weeks";
import { savePlacementGrid } from "../content-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Placement grid" };

export default async function PlacementGridPage({ params }: { params: Promise<{ date: string }> }) {
  await requireAuth();
  const { date } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();
  const [items, pubs] = await Promise.all([listWeekContent(week), listPublications()]);
  const visible = items.filter((i) => !i.hidden && !i.skipped);

  return (
    <div className="space-y-4">
      <Link href={`/weeks/${date}#content`} className="text-sm text-navy hover:underline">
        ← {week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en}
      </Link>
      <h1 className="text-xl font-semibold text-navy">Where does everything appear?</h1>
      {visible.length === 0 ? (
        <p className="text-sm text-stone-500">No content this week yet.</p>
      ) : (
        <form action={savePlacementGrid} className="card overflow-x-auto">
          <input type="hidden" name="weekDate" value={date} />
          <input type="hidden" name="itemIds" value={visible.map((i) => i.id).join(",")} />
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-stone-200 text-left">
                <th className="px-3 py-2 font-medium">Item</th>
                {pubs.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-center font-medium whitespace-nowrap" title={p.name}>
                    {p.shortName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-3 py-1.5">
                    <span className="mr-1">{CONTENT_TYPES[item.type].icon}</span>
                    {item.title || CONTENT_TYPES[item.type].summary(item) || CONTENT_TYPES[item.type].label}
                  </td>
                  {pubs.map((p) => (
                    <td key={p.id} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        name={`p_${item.id}_${p.id}`}
                        defaultChecked={item.placements.has(p.id)}
                        aria-label={`${item.title} in ${p.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 p-3">
            <button className="btn-primary">Save</button>
            <span className="text-xs text-stone-500">Per-publication wording is kept when a box stays ticked.</span>
          </div>
        </form>
      )}
    </div>
  );
}
