import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { getItem, getItemPlacements, itemBelongsToWeek, listPublications } from "@/lib/content/service";
import { CONTENT_TYPES, isContentType } from "@/lib/content/types";
import { getWeekByDate } from "@/lib/weeks";
import { ItemForm } from "./item-form";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string; id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAuth();
  const { date, id } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();
  const pubs = await listPublications();

  const isNew = id === "new";
  const item = isNew ? null : await getItem(Number(id));
  if (!isNew && (!item || !(await itemBelongsToWeek(item.id, week)))) notFound();
  const typeKey = item?.type ?? (await searchParams).type ?? "";
  if (!isContentType(typeKey)) notFound();
  const type = CONTENT_TYPES[typeKey];

  const placements = item
    ? Object.fromEntries((await getItemPlacements(item.id)).map((p) => [p.publicationId, p.variant]))
    : Object.fromEntries(
        pubs.filter((p) => (type.defaultPlacements as string[]).includes(p.key)).map((p) => [p.id, {}]),
      );

  const title = week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en;
  return (
    <div className="space-y-4">
      <Link href={`/weeks/${date}#content`} className="text-sm text-navy hover:underline">
        ← {title}
      </Link>
      <h1 className="text-xl font-semibold text-navy">
        {type.icon} {isNew ? `New ${type.label}` : `Edit ${type.label}`}
      </h1>
      {item?.source === "import" && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          This came from the {type.label.toLowerCase()} list. Changes here apply to this week only. Fix the
          spreadsheet to correct it for future years.
        </p>
      )}
      <ItemForm
        weekDate={date}
        typeKey={typeKey}
        item={item}
        pubs={pubs.map(({ id, name, shortName }) => ({ id, name, shortName }))}
        placements={placements}
      />
    </div>
  );
}
