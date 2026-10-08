"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PersonDateKind } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { formatHebrewDateEn } from "@/lib/calendar/hebrew-dates";
import { PERSON_FIELDS, previewPaste, type ColumnMapping } from "@/lib/people/import";
import { lastImport, mappingByHeader, replacePeople } from "@/lib/people/service";

const kindSchema = z.enum(["yahrzeit", "birthday"]);
const MAX_PASTE = 2_000_000;

const input = z.object({
  kind: kindSchema,
  text: z.string().max(MAX_PASTE, "That paste is too large"),
  mapping: z.record(z.string(), z.union([z.enum(Object.keys(PERSON_FIELDS) as [string, ...string[]]), z.literal("")])).optional(),
  hasHeader: z.boolean().optional(),
});

export interface PreviewResponse {
  headers: string[];
  hasHeader: boolean;
  mapping: ColumnMapping;
  people: { row: number; nameEn: string; nameHe: string; relation: string; date: string; dateText: string }[];
  peopleCount: number;
  errors: { row: number; message: string; cells: string[] }[];
}

async function preview(kind: PersonDateKind, text: string, mapping?: ColumnMapping, hasHeader?: boolean) {
  const remembered = (await lastImport(kind))?.mapping;
  return previewPaste(kind, text, { mapping, hasHeader, rememberedMapping: remembered });
}

export async function previewPeople(raw: z.input<typeof input>): Promise<PreviewResponse | { error: string }> {
  await requireAuth();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { kind, text, mapping, hasHeader } = parsed.data;
  const p = await preview(kind, text, mapping as ColumnMapping | undefined, hasHeader);
  return {
    headers: p.headers,
    hasHeader: p.hasHeader,
    mapping: p.mapping,
    peopleCount: p.result.people.length,
    people: p.result.people.slice(0, 300).map((x) => ({
      row: x.row,
      nameEn: x.nameEn,
      nameHe: x.nameHe,
      relation: x.relation,
      date: formatHebrewDateEn(x.date),
      dateText: x.dateText,
    })),
    errors: p.result.errors,
  };
}

export async function importPeople(raw: z.input<typeof input>): Promise<{ ok: string } | { error: string }> {
  await requireAuth();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { kind, text, mapping, hasHeader } = parsed.data;
  // Re-parse on the server; never trust rows sent from the browser.
  const p = await preview(kind, text, mapping as ColumnMapping | undefined, hasHeader);
  if (p.result.people.length === 0) return { error: "No rows could be read. Check the column choices." };
  const { weeksUpdated } = await replacePeople(
    kind,
    p.result.people,
    p.hasHeader ? mappingByHeader(p.headers, p.mapping) : {},
    p.result.errors.length,
  );
  revalidatePath("/people");
  revalidatePath("/weeks", "layout");
  return {
    ok: `Saved ${p.result.people.length} ${kind === "yahrzeit" ? "yahrzeits" : "birthdays"}${
      p.result.errors.length ? ` (${p.result.errors.length} rows skipped)` : ""
    }. ${weeksUpdated} open week${weeksUpdated === 1 ? "" : "s"} updated.`,
  };
}
