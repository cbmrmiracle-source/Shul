import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsletterLayoutFields } from "@/components/newsletter-layout-fields";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { resolveLayout } from "@/lib/newsletter-layout";
import { renderPublication } from "@/lib/render/service";
import { TEMPLATES } from "@/lib/render/templates";
import { getOrganization, getWeekByDate } from "@/lib/weeks";
import { saveWeekLayout } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewsletterLayoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAuth();
  const { date } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();
  const { saved } = await searchParams;
  const org = await getOrganization();

  let warnings: string[] = [];
  let error: string | null = null;
  try {
    warnings = (await renderPublication(week, "newsletter", "png")).warnings;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const t = TEMPLATES.newsletter!;
  const base = `/weeks/${date}/outputs/newsletter`;
  const v = `${week.updatedAt.getTime()}-${saved ?? ""}`;
  const title = week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en;
  const changed = Object.keys(week.newsletterLayout).length > 0;

  return (
    <div className="space-y-4">
      <Link href={`/weeks/${date}/outputs`} className="text-sm text-navy hover:underline">
        ← Outputs for {title}
      </Link>
      <h1 className="text-xl font-semibold text-navy">Print newsletter layout for this week</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <form action={saveWeekLayout} className="card space-y-3 self-start p-4">
          <input type="hidden" name="weekDate" value={date} />
          <NewsletterLayoutFields values={week.newsletterLayout} inherited={resolveLayout(org.newsletterLayout)} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary">Save and preview</button>
            {changed && (
              <button name="reset" value="1" className="btn">
                Put everything back in its usual place
              </button>
            )}
          </div>
          {saved && <p className="text-sm text-green-800">Saved.</p>}
          <p className="text-xs text-stone-500">
            To change where boxes usually go every week, use{" "}
            <Link href="/settings#newsletter-layout" className="text-navy underline">
              Settings → Print newsletter layout
            </Link>
            .
          </p>
        </form>
        <div className="space-y-3">
          {error ? (
            <p className="rounded bg-red-50 p-3 text-sm text-red-800">Couldn&apos;t generate: {error}</p>
          ) : warnings.length > 0 ? (
            <ul className="space-y-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded bg-green-50 p-2 text-xs text-green-900">✓ Everything fits at full size.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((n) => (
              <a key={n} href={`${base}?format=png&page=${n}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${base}?format=png&page=${n}&v=${v}`}
                  alt={`Print newsletter, page ${n}`}
                  className="w-full rounded border border-stone-200 shadow-sm"
                  style={{ aspectRatio: `${t.width} / ${t.height}` }}
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
