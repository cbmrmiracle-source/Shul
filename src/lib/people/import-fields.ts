// Client-safe: shared by the paste screen and the server-side parser.

/** What a column can hold. "" = ignore the column. */
export const PERSON_FIELDS = {
  nameEn: "Name (English)",
  nameHe: "Name (Hebrew)",
  hebrewDate: "Hebrew date",
  hebrewDay: "Hebrew day",
  hebrewMonth: "Hebrew month",
  hebrewYear: "Hebrew year",
  gregorianDate: "English date",
  afterSunset: "After sunset?",
  relation: "Relation / observed by",
  notes: "Notes",
} as const;
export type PersonField = keyof typeof PERSON_FIELDS;
/** Column index (as a string, for form values) → field. */
export type ColumnMapping = Record<string, PersonField | "">;
