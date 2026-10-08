import Link from "next/link";
import type { PersonDateKind } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { formatHebrewDateEn } from "@/lib/calendar/hebrew-dates";
import { lastImport, listPeople } from "@/lib/people/service";
import { PasteImporter } from "./paste-importer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yahrzeits & Birthdays" };

const TABS: { kind: PersonDateKind; label: string }[] = [
  { kind: "yahrzeit", label: "Yahrzeits" },
  { kind: "birthday", label: "Birthdays" },
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAuth();
  const kind: PersonDateKind = (await searchParams).kind === "birthday" ? "birthday" : "yahrzeit";
  const [people, last] = await Promise.all([listPeople(kind), lastImport(kind)]);
  const label = kind === "yahrzeit" ? "yahrzeit" : "birthday";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">Yahrzeits &amp; Birthdays</h1>
        <p className="mt-1 text-sm text-stone-600">
          Paste the list from your spreadsheet. Each week then picks the {label}s that fall from Shabbos through the
          following Friday and adds them to the week for you to review.
        </p>
      </div>

      <nav className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.kind}
            href={`/people?kind=${t.kind}`}
            className={t.kind === kind ? "btn-primary" : "btn"}
            aria-current={t.kind === kind ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <PasteImporter kind={kind} key={kind} />

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-navy">
            Current list <span className="font-normal text-stone-500">({people.length})</span>
          </h2>
          {last && (
            <span className="text-xs text-stone-500">
              Last pasted {last.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
            </span>
          )}
        </div>
        {people.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-stone-500">Nothing pasted yet.</p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Hebrew name</th>
                  <th className="px-4 py-2 font-medium">Hebrew date</th>
                  {kind === "yahrzeit" && <th className="px-4 py-2 font-medium">Relation</th>}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="px-4 py-1.5">{p.nameEn}</td>
                    <td className="hebrew px-4 py-1.5 text-right">{p.nameHe}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {formatHebrewDateEn({ day: p.hebrewDay, month: p.hebrewMonth, year: p.hebrewYear ?? undefined })}
                    </td>
                    {kind === "yahrzeit" && <td className="px-4 py-1.5">{p.relation}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
