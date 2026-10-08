/**
 * Turning rows pasted from a spreadsheet into yahrzeit / birthday records.
 * Pure functions (no database) so they can be tested and previewed.
 */
import { createHash } from "node:crypto";
import {
  formatHebrewDateEn,
  hebrewFromGregorian,
  parseHebrewDate,
  type HebrewDateParts,
} from "@/lib/calendar/hebrew-dates";
import { isCivilDate } from "@/lib/calendar/dates";
import type { PersonDateKind } from "@/db/schema";

export { PERSON_FIELDS, type ColumnMapping, type PersonField } from "./import-fields";
import { PERSON_FIELDS, type ColumnMapping, type PersonField } from "./import-fields";

/**
 * Parse tab-separated text (what Google Sheets / Excel put on the clipboard),
 * falling back to CSV. Handles quoted cells containing tabs, commas or newlines.
 */
export function parseTable(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const firstLine = normalized.split("\n", 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (quoted) {
      if (c === '"' && normalized[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}

const HEADER_HINTS: [PersonField, RegExp][] = [
  ["afterSunset", /sunset|night|שקיעה/i],
  ["relation", /relation|observ|son of|daughter of|child|family|קרוב/i],
  ["nameHe", /hebrew\s*name|jewish\s*name|שם\s*עברי|עברית|^שם$/i],
  ["hebrewDay", /^(hebrew\s*)?day$|^יום$/i],
  ["hebrewMonth", /^(hebrew\s*)?month$|^חודש$/i],
  ["hebrewYear", /^(hebrew\s*)?year$|^שנה$/i],
  ["hebrewDate", /hebrew\s*date|jewish\s*date|תאריך\s*עברי|^תאריך$/i],
  // Any other date-ish heading; refineDateColumns() then checks whether the values are Hebrew or English.
  ["gregorianDate", /date|dob|passing|passed|died|death|born|birth|yahrzeit|yartzeit|פטירה|לידה|יארצייט/i],
  ["nameEn", /name|deceased|niftar|person|^שם/i],
  ["notes", /note|comment/i],
];

/** Guess column roles from header text. Each field is used at most once. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<PersonField>();
  headers.forEach((h, i) => {
    const hit = HEADER_HINTS.find(([field, re]) => !used.has(field) && re.test(h));
    mapping[String(i)] = hit ? hit[0] : "";
    if (hit) used.add(hit[0]);
  });
  return mapping;
}

/** A first row is a header row if it doesn't contain a readable date. */
export function looksLikeHeader(row: string[]): boolean {
  return !row.some((c) => parseHebrewDate(c) || parseGregorian(c));
}

/** "9/1/2024", "2024-09-01", "Sept 1, 2024", "1 September 2024" → "2024-09-01" */
export function parseGregorian(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (isCivilDate(s)) return s;
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (us) {
    let y = Number(us[3]);
    if (y < 100) y += y > 40 ? 1900 : 2000;
    const iso = `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    return isCivilDate(iso) ? iso : null;
  }
  if (!/[a-z]/i.test(s) || !/\d{4}/.test(s)) return null;
  const d = new Date(`${s} 12:00 UTC`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const YES = /^(y|yes|true|1|x|✓|after|night)$/i;

export interface ParsedPerson {
  externalKey: string;
  nameEn: string;
  nameHe: string;
  relation: string;
  notes: string;
  date: HebrewDateParts;
  dateText: string;
  /** Row number in the paste (1-based, counting the header). */
  row: number;
}

export interface ParseResult {
  people: ParsedPerson[];
  errors: { row: number; message: string; cells: string[] }[];
}

export function personKey(kind: PersonDateKind, p: { nameEn: string; nameHe: string; date: HebrewDateParts }) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha1")
    .update([kind, norm(p.nameEn), norm(p.nameHe), p.date.day, p.date.month, p.date.year ?? ""].join("|"))
    .digest("hex")
    .slice(0, 16);
}

/** Apply a column mapping to data rows. */
export function buildPeople(
  kind: PersonDateKind,
  rows: string[][],
  mapping: ColumnMapping,
  firstRowNumber: number,
): ParseResult {
  const people: ParsedPerson[] = [];
  const errors: ParseResult["errors"] = [];
  const seen = new Set<string>();

  rows.forEach((cells, i) => {
    const rowNumber = firstRowNumber + i;
    const get = (field: PersonField) =>
      Object.entries(mapping)
        .filter(([, f]) => f === field)
        .map(([col]) => cells[Number(col)] ?? "")
        .filter(Boolean)
        .join(" ")
        .trim();

    const nameEn = get("nameEn");
    const nameHe = get("nameHe");
    if (!nameEn && !nameHe) {
      errors.push({ row: rowNumber, message: "No name", cells });
      return;
    }

    let date: HebrewDateParts | null = null;
    let dateText = get("hebrewDate");
    if (dateText) date = parseHebrewDate(dateText);
    if (!date && (get("hebrewDay") || get("hebrewMonth"))) {
      dateText = [get("hebrewDay"), get("hebrewMonth"), get("hebrewYear")].filter(Boolean).join(" ");
      date = parseHebrewDate(dateText);
    }
    if (!date && get("gregorianDate")) {
      const greg = parseGregorian(get("gregorianDate"));
      if (greg) {
        date = hebrewFromGregorian(greg, YES.test(get("afterSunset")));
        dateText = get("gregorianDate");
      }
    }
    if (!date) {
      errors.push({
        row: rowNumber,
        message: dateText || get("gregorianDate") ? `Can't read the date “${dateText || get("gregorianDate")}”` : "No date",
        cells,
      });
      return;
    }

    const externalKey = personKey(kind, { nameEn, nameHe, date });
    if (seen.has(externalKey)) {
      errors.push({ row: rowNumber, message: "Duplicate of an earlier row", cells });
      return;
    }
    seen.add(externalKey);
    people.push({
      externalKey,
      nameEn,
      nameHe,
      relation: get("relation"),
      notes: get("notes"),
      date,
      dateText: dateText || formatHebrewDateEn(date),
      row: rowNumber,
    });
  });

  return { people, errors };
}

export interface PastePreview {
  headers: string[];
  hasHeader: boolean;
  mapping: ColumnMapping;
  result: ParseResult;
  columnCount: number;
}

/**
 * Parse a paste end to end. `mapping` and `hasHeader` override the guesses;
 * `rememberedMapping` (keyed by header text) restores the last paste's choices.
 */
export function previewPaste(
  kind: PersonDateKind,
  text: string,
  options: { mapping?: ColumnMapping; hasHeader?: boolean; rememberedMapping?: Record<string, string> } = {},
): PastePreview {
  const table = parseTable(text);
  const columnCount = Math.max(0, ...table.map((r) => r.length));
  const hasHeader = options.hasHeader ?? (table.length > 0 && looksLikeHeader(table[0]));
  const headers = hasHeader
    ? Array.from({ length: columnCount }, (_, i) => table[0][i] || `Column ${i + 1}`)
    : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

  let mapping = options.mapping;
  if (!mapping) {
    mapping = hasHeader ? refineDateColumns(guessMapping(headers), table.slice(1)) : guessFromData(table);
    if (hasHeader && !Object.values(mapping).some((f) => f === "hebrewDate" || f === "gregorianDate")) {
      // No heading looked like a date: find the date column from its contents.
      const fromData = guessFromData(table.slice(1));
      for (const [col, field] of Object.entries(fromData)) {
        if ((field === "hebrewDate" || field === "gregorianDate") && !mapping[col]) mapping[col] = field;
      }
    }
    if (options.rememberedMapping && hasHeader) {
      headers.forEach((h, i) => {
        const remembered = options.rememberedMapping![h];
        if (remembered !== undefined && (remembered === "" || remembered in PERSON_FIELDS)) {
          mapping![String(i)] = remembered as PersonField | "";
        }
      });
    }
  }
  const dataRows = hasHeader ? table.slice(1) : table;
  return {
    headers,
    hasHeader,
    mapping,
    columnCount,
    result: buildPeople(kind, dataRows, mapping, hasHeader ? 2 : 1),
  };
}

/** Without headers: the column that parses as a date is the date; Hebrew text is the Hebrew name. */
function guessFromData(table: string[][]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const sample = table.slice(0, 20);
  const cols = Math.max(0, ...sample.map((r) => r.length));
  let haveName = false;
  let haveHe = false;
  let haveDate = false;
  for (let c = 0; c < cols; c++) {
    const values = sample.map((r) => r[c] ?? "").filter(Boolean);
    const share = (pred: (v: string) => unknown) => values.filter(pred).length / Math.max(1, values.length);
    let field: PersonField | "" = "";
    if (!haveDate && share((v) => parseHebrewDate(v)) > 0.6) {
      field = "hebrewDate";
      haveDate = true;
    } else if (!haveDate && share((v) => parseGregorian(v)) > 0.6) {
      field = "gregorianDate";
      haveDate = true;
    } else if (!haveHe && share((v) => /[א-ת]/.test(v)) > 0.6) {
      field = "nameHe";
      haveHe = true;
    } else if (!haveName && share((v) => /[a-z]/i.test(v)) > 0.6) {
      field = "nameEn";
      haveName = true;
    }
    mapping[String(c)] = field;
  }
  return mapping;
}

/** A column headed just "Date" may hold Hebrew dates; check the data and correct the guess. */
function refineDateColumns(mapping: ColumnMapping, rows: string[][]): ColumnMapping {
  const out = { ...mapping };
  for (const [col, field] of Object.entries(out)) {
    if (field !== "gregorianDate" && field !== "hebrewDate") continue;
    const values = rows.slice(0, 20).map((r) => r[Number(col)] ?? "").filter(Boolean);
    if (values.length === 0) continue;
    const hebrew = values.filter((v) => parseHebrewDate(v)).length;
    const greg = values.filter((v) => parseGregorian(v)).length;
    if (field === "gregorianDate" && hebrew > greg) out[col] = "hebrewDate";
    if (field === "hebrewDate" && greg > hebrew) out[col] = "gregorianDate";
  }
  return out;
}
