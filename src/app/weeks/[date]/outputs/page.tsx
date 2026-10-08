import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { isCivilDate } from "@/lib/calendar/dates";
import { listPublications } from "@/lib/content/service";
import type { PublicationKey } from "@/lib/content/types";
import { headers } from "next/headers";
import { publicBaseUrl, renderEmailForWeek, renderPublication } from "@/lib/render/service";
import { CopyEmailHtml, CopyText } from "./copy-buttons";
import { TEMPLATES } from "@/lib/render/templates";
import { getWeekByDate } from "@/lib/weeks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outputs" };

export default async function OutputsPage({ params }: { params: Promise<{ date: string }> }) {
  await requireAuth();
  const { date } = await params;
  if (!isCivilDate(date)) notFound();
  const week = await getWeekByDate(date);
  if (!week) notFound();

  const pubs = await listPublications();
  // Render previews up front (cached), so warnings can be shown next to each image.
  const outputs = await Promise.all(
    pubs.map(async (p) => {
      const key = p.key as PublicationKey;
      const template = TEMPLATES[key];
      if (!template) return { pub: p, template: null, warnings: [] as string[], error: null as string | null };
      try {
        const r = await renderPublication(week, key, "png");
        return { pub: p, template, warnings: r.warnings, error: null };
      } catch (e) {
        return { pub: p, template, warnings: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const version = week.updatedAt.getTime() + "-" + Date.now();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const email = await renderEmailForWeek(week, publicBaseUrl(origin));
  const emailUrl = `/weeks/${date}/email`;

  return (
    <div className="space-y-6">
      <Link href={`/weeks/${date}`} className="text-sm text-navy hover:underline">
        ← {week.calendarOverrides.shabbosTitleEn || week.calendarAuto.shabbosTitle.en}
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-navy">Outputs</h1>
        <p className="mt-1 text-sm text-stone-600">
          Generated from this week&apos;s davening times and content. Change anything on the week screen and come back
          here to see it updated.
        </p>
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-semibold text-navy">Email Newsletter</h2>
          <div className="flex flex-wrap gap-2">
            <CopyEmailHtml url={emailUrl} />
            <a href={`${emailUrl}?download=1`} className="btn">
              Download .html
            </a>
            <a href={emailUrl} target="_blank" rel="noreferrer" className="btn">
              Open in new tab
            </a>
          </div>
        </div>
        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1fr_640px]">
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase">Subject</div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{email.subject}</span>
                <CopyText text={email.subject} />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase">Preview text</div>
              <div className="flex items-center gap-2">
                <span>{email.preheader}</span>
                <CopyText text={email.preheader} />
              </div>
            </div>
            {email.warnings.length > 0 && (
              <ul className="space-y-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
                {email.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <div className="rounded bg-stone-50 p-3 text-xs text-stone-600">
              <strong>To send with Mailchimp:</strong> click <em>Copy HTML for Mailchimp</em>, then in Mailchimp create the
              campaign, choose <em>Code your own → Paste in code</em>, select all and paste. Mailchimp adds its own
              unsubscribe footer.
            </div>
          </div>
          <iframe
            src={`${emailUrl}?v=${version}`}
            title="Email preview"
            sandbox=""
            className="h-[900px] w-full rounded border border-stone-200 bg-[#f2f2f2]"
          />
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {outputs
          .filter((o) => o.template)
          .map(({ pub, template, warnings, error }) => {
            const base = `/weeks/${date}/outputs/${pub.key}`;
            return (
              <section key={pub.id} className={`card overflow-hidden ${(template!.pages ?? 1) > 1 ? "md:col-span-2" : ""}`}>
                <div className="card-header">
                  <h2 className="font-semibold text-navy">{pub.name}</h2>
                </div>
                <div className="space-y-3 px-4 pb-4">
                  {error ? (
                    <p className="rounded bg-red-50 p-3 text-sm text-red-800">Couldn&apos;t generate: {error}</p>
                  ) : (
                    <div className={(template!.pages ?? 1) > 1 ? "grid grid-cols-2 gap-2" : ""}>
                      {Array.from({ length: template!.pages ?? 1 }, (_, i) => i + 1).map((n) => (
                        <a key={n} href={`${base}?format=png&page=${n}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${base}?format=png&page=${n}&v=${version}`}
                            alt={`${pub.name} preview${(template!.pages ?? 1) > 1 ? `, page ${n}` : ""}`}
                            className="w-full rounded border border-stone-200 shadow-sm"
                            style={{ aspectRatio: `${template!.width} / ${template!.height}` }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <ul className="space-y-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
                      {warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {template!.formats.flatMap((f) =>
                      f === "png" && (template!.pages ?? 1) > 1
                        ? Array.from({ length: template!.pages! }, (_, i) => (
                            <a key={`png${i}`} href={`${base}?format=png&page=${i + 1}&download=1`} className="btn btn-sm">
                              PNG page {i + 1}
                            </a>
                          ))
                        : [
                            <a key={f} href={`${base}?format=${f}&download=1`} className="btn btn-sm">
                              Download {f.toUpperCase()}
                            </a>,
                          ],
                    )}
                  </div>
                </div>
              </section>
            );
          })}
      </div>

      <section className="card p-5 text-sm text-stone-600">
        <h2 className="mb-1 font-semibold text-navy">Coming in later phases</h2>
        {outputs
          .filter((o) => !o.template && o.pub.key !== "email")
          .map((o) => o.pub.name)
          .join(" · ")}
      </section>
    </div>
  );
}
