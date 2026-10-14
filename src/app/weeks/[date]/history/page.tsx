import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { listWeekContent } from "@/lib/content/service";
import { getWeekByDate } from "@/lib/weeks";
import { HistoryPasteForm } from "./paste-form";

export const dynamic = "force-dynamic";

export default async function HistoryPastePage({ params }: { params: Promise<{ date: string }> }) {
  await requireAuth();
  const { date } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();
  const existing = (await listWeekContent(week)).filter(
    (i) => i.type === "jewish_history" && i.weekId === week.id,
  ).length;

  const title = week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en;
  return (
    <div className="space-y-4">
      <Link href={`/weeks/${date}#content`} className="text-sm text-navy hover:underline">
        ← {title}
      </Link>
      <h1 className="text-xl font-semibold text-navy">🕰️ Week in Jewish History</h1>
      <HistoryPasteForm weekDate={date} existing={existing} />
      <p className="text-xs text-stone-500">
        To add or fix a single event instead,{" "}
        <Link href={`/weeks/${date}/items/new?type=jewish_history`} className="text-navy underline">
          add one by hand
        </Link>{" "}
        or click an event on the week page.
      </p>
    </div>
  );
}
