import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PersonDateKind } from "@/db/schema";
import { resyncOpenWeeks } from "@/lib/weeks";
import type { ColumnMapping, ParsedPerson } from "./import";

export async function listPeople(kind: PersonDateKind) {
  return db
    .select()
    .from(schema.personDate)
    .where(eq(schema.personDate.kind, kind))
    .orderBy(schema.personDate.hebrewMonth, schema.personDate.hebrewDay, schema.personDate.nameEn);
}

export async function lastImport(kind: PersonDateKind) {
  const [row] = await db
    .select()
    .from(schema.personImport)
    .where(eq(schema.personImport.kind, kind))
    .orderBy(desc(schema.personImport.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Replace the whole list with a fresh paste (the spreadsheet is the source of
 * truth), remember the column choices, then refresh every open week.
 */
export async function replacePeople(
  kind: PersonDateKind,
  people: ParsedPerson[],
  rememberedMapping: Record<string, string>,
  skipped: number,
): Promise<{ weeksUpdated: number }> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.personDate).where(eq(schema.personDate.kind, kind));
    for (let i = 0; i < people.length; i += 500) {
      await tx.insert(schema.personDate).values(
        people.slice(i, i + 500).map((p) => ({
          kind,
          externalKey: p.externalKey,
          nameEn: p.nameEn,
          nameHe: p.nameHe,
          relation: p.relation,
          notes: p.notes,
          hebrewDay: p.date.day,
          hebrewMonth: p.date.month,
          hebrewYear: p.date.year ?? null,
          dateText: p.dateText,
        })),
      );
    }
    await tx.insert(schema.personImport).values({
      kind,
      mapping: rememberedMapping,
      rowsImported: people.length,
      rowsSkipped: skipped,
    });
  });
  return { weeksUpdated: await resyncOpenWeeks() };
}

/** Header text → chosen field, so the next paste of the same sheet is matched automatically. */
export function mappingByHeader(headers: string[], mapping: ColumnMapping): Record<string, string> {
  return Object.fromEntries(headers.map((h, i) => [h, mapping[String(i)] ?? ""]));
}
