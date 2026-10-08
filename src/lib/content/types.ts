/**
 * Content types: what kinds of items exist, which form fields each one has,
 * and where new items go by default. Client-safe (no database imports).
 *
 * Common fields live in their own columns on content_item (title, body,
 * image, link, eventDate, eventTime, hebrewDate). Anything type-specific goes in
 * `fields` under the field's `name`.
 *
 * To add a new kind of block that needs no special layout, use "custom".
 * Only add a type here when a template needs to treat it differently.
 */

export const PUBLICATION_KEYS = [
  "email",
  "newsletter",
  "poster_davening",
  "poster_farbrengen",
  "poster_kids",
  "poster_sicha",
  "whatsapp_shabbos",
  "whatsapp_weekly",
] as const;
export type PublicationKey = (typeof PUBLICATION_KEYS)[number];

/** Seed data for the publications table. */
export const DEFAULT_PUBLICATIONS: {
  key: PublicationKey;
  name: string;
  shortName: string;
  format: "email" | "print" | "poster" | "whatsapp";
}[] = [
  { key: "email", name: "Email Newsletter", shortName: "Email", format: "email" },
  { key: "newsletter", name: "Print Newsletter", shortName: "Print", format: "print" },
  { key: "poster_davening", name: "Davening Poster", shortName: "Davening", format: "poster" },
  { key: "poster_farbrengen", name: "Farbrengen Poster", shortName: "Farbrengen", format: "poster" },
  { key: "poster_kids", name: "Children's Poster", shortName: "Kids", format: "poster" },
  { key: "poster_sicha", name: "Sicha Shiur Poster", shortName: "Sicha", format: "poster" },
  { key: "whatsapp_shabbos", name: "Shabbos WhatsApp", shortName: "WA Shabbos", format: "whatsapp" },
  { key: "whatsapp_weekly", name: "Weekly WhatsApp", shortName: "WA Weekly", format: "whatsapp" },
];

export type CommonField = "title" | "body" | "image" | "link" | "eventDate" | "eventTime" | "hebrewDate";

export interface ExtraField {
  name: string;
  label: string;
  input: "text" | "textarea" | "url" | "hebrew" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
}

export interface ContentTypeDef {
  key: string;
  label: string;
  /** Plural heading for the week screen section. */
  section: string;
  icon: string;
  /** Common fields shown on the form, with type-specific labels. */
  common: Partial<Record<CommonField, { label: string; placeholder?: string; help?: string }>>;
  extra: ExtraField[];
  defaultPlacements: PublicationKey[];
  /** The form refuses to save without a title. */
  titleRequired?: boolean;
  /** Offer "repeat every week" for this type. */
  recurring: boolean;
  /** One-line summary for lists. */
  summary: (item: SummaryInput) => string;
}

export interface SummaryInput {
  title: string;
  body: string;
  fields: Record<string, string>;
  eventDate: string | null;
  eventTime: string;
  hebrewDate: string;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const firstLine = (s: string, n = 90) => {
  const line = s.split("\n").find((l) => l.trim()) ?? "";
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
};

const types = {
  sponsor: {
    key: "sponsor",
    titleRequired: true,
    label: "Farbrengen Sponsor",
    section: "Farbrengen Sponsors",
    icon: "🍷",
    common: {
      title: { label: "Sponsor", placeholder: "Rabbi Ellie & Chaya Rochel Estrin" },
      body: { label: "Dedication", placeholder: "In honor of the upcoming wedding of their daughter…" },
      image: { label: "Sponsor image (optional)" },
    },
    extra: [
      { name: "dedicationHe", label: "Hebrew / Yiddish text", input: "hebrew", placeholder: "יוסף חיים בן חנוך העניך הכהן" },
    ],
    defaultPlacements: ["email", "newsletter", "poster_farbrengen"],
    recurring: false,
    summary: (i) => firstLine(i.body),
  },
  event: {
    key: "event",
    titleRequired: true,
    label: "Event",
    section: "Upcoming Events",
    icon: "🎉",
    common: {
      title: { label: "Event name", placeholder: "Chai Elul Farbrengen for men" },
      eventDate: { label: "Date" },
      eventTime: { label: "Time", placeholder: "8:30PM" },
      body: { label: "Description" },
      image: { label: "Image / flyer" },
      link: { label: "More info link" },
    },
    extra: [
      { name: "location", label: "Location", input: "text" },
      { name: "speaker", label: "Speaker / guest", input: "text", placeholder: "Rabbi Yossi Hodakov" },
      { name: "sponsoredBy", label: "Sponsored by", input: "text" },
      { name: "registrationUrl", label: "Registration link", input: "url" },
    ],
    defaultPlacements: ["email", "newsletter"],
    recurring: false,
    summary: (i) => join(i.eventDate, i.eventTime, i.fields.location),
  },
  mazal_tov: {
    key: "mazal_tov",
    titleRequired: true,
    label: "Mazal Tov",
    section: "Mazal Tov",
    icon: "🎊",
    common: {
      title: { label: "Person / family", placeholder: "Yitzi and Sara Leah Field" },
      body: { label: "Description (optional)", help: "Leave blank to print “Mazal tov to [family] [occasion]”." },
    },
    extra: [{ name: "occasion", label: "Occasion", input: "text", placeholder: "on the birth of a boy!" }],
    defaultPlacements: ["email", "newsletter"],
    recurring: false,
    summary: (i) => i.fields.occasion ?? firstLine(i.body),
  },
  shiur: {
    key: "shiur",
    titleRequired: true,
    label: "Shiur",
    section: "Shiurim",
    icon: "📚",
    common: {
      title: { label: "Shiur name", placeholder: "Shiur in Likutei Sichos" },
      eventDate: { label: "Date (for a one-time shiur)" },
      eventTime: { label: "Time", placeholder: "6:25PM", help: "Leave blank to use the time from the davening schedule." },
      body: { label: "Description" },
    },
    extra: [
      { name: "day", label: "Day", input: "text", placeholder: "Shabbos" },
      { name: "speaker", label: "Speaker", input: "text" },
      { name: "location", label: "Location", input: "text" },
      { name: "audience", label: "For", input: "text", placeholder: "For Men" },
    ],
    defaultPlacements: ["email", "newsletter"],
    recurring: true,
    summary: (i) => join(i.fields.day, i.eventTime, i.fields.speaker),
  },
  kids_program: {
    key: "kids_program",
    titleRequired: true,
    label: "Kids Program",
    section: "Kids Corner",
    icon: "👦",
    common: {
      title: { label: "Program", placeholder: "0-5 Year old program" },
      eventTime: { label: "Time", placeholder: "10:30-12:30PM" },
      body: { label: "Details (optional)" },
      image: { label: "Image (optional)" },
      link: { label: "Registration link (optional)" },
    },
    extra: [
      { name: "ages", label: "Ages", input: "text", placeholder: "Girls grades 5-8" },
      { name: "location", label: "Location", input: "text", placeholder: "EC3 Classroom" },
      {
        name: "status",
        label: "Status this week",
        input: "select",
        options: [
          { value: "running", label: "Running" },
          { value: "back", label: "We're back!" },
          { value: "no_program", label: "No program" },
        ],
      },
    ],
    defaultPlacements: ["newsletter", "poster_kids"],
    recurring: true,
    summary: (i) =>
      join(i.fields.ages, i.eventTime, i.fields.location, i.fields.status === "no_program" ? "NO PROGRAM" : null),
  },
  eruv: {
    key: "eruv",
    label: "Eruv Status",
    section: "Eruv",
    icon: "🕍",
    common: {
      body: { label: "Message (optional)", placeholder: "For a detailed map of the Inverrary Eruv…" },
      link: { label: "Eruv map link" },
    },
    extra: [
      {
        name: "status",
        label: "Status",
        input: "select",
        options: [
          { value: "kosher", label: "Kosher" },
          { value: "down", label: "Not up this Shabbos" },
          { value: "unknown", label: "Not yet checked" },
        ],
      },
    ],
    defaultPlacements: ["email", "whatsapp_shabbos"],
    recurring: true,
    summary: (i) => ({ kosher: "Kosher", down: "Not up", unknown: "Not yet checked" })[i.fields.status ?? ""] ?? "",
  },
  parsha_nutshell: {
    key: "parsha_nutshell",
    label: "Parsha in a Nutshell",
    section: "Parsha in a Nutshell",
    icon: "📜",
    common: { body: { label: "Text" } },
    extra: [],
    defaultPlacements: ["newsletter"],
    recurring: false,
    summary: (i) => firstLine(i.body),
  },
  haftorah: {
    key: "haftorah",
    label: "Haftorah in a Nutshell",
    section: "Haftorah in a Nutshell",
    icon: "📖",
    common: { body: { label: "Text" } },
    extra: [],
    defaultPlacements: ["newsletter"],
    recurring: false,
    summary: (i) => firstLine(i.body),
  },
  jewish_history: {
    key: "jewish_history",
    titleRequired: true,
    label: "Jewish History",
    section: "Week in Jewish History",
    icon: "🕰️",
    common: {
      title: { label: "Event", placeholder: "Birth of the Baal Shem Tov (1698)" },
      hebrewDate: { label: "Hebrew date", placeholder: "18 Elul" },
      body: { label: "Text" },
    },
    extra: [{ name: "day", label: "Day", input: "text", placeholder: "Monday" }],
    defaultPlacements: ["newsletter"],
    recurring: false,
    summary: (i) => join(i.fields.day, i.hebrewDate),
  },
  riddle: {
    key: "riddle",
    label: "Parsha Riddle",
    section: "Parsha Riddle",
    icon: "🧩",
    common: { body: { label: "Question" } },
    extra: [{ name: "answer", label: "Answer", input: "textarea", help: "Printed upside down at the bottom of the page." }],
    defaultPlacements: ["newsletter"],
    recurring: false,
    summary: (i) => firstLine(i.body),
  },
  birthday: {
    key: "birthday",
    titleRequired: true,
    label: "Birthday",
    section: "Birthdays",
    icon: "🎂",
    common: {
      title: { label: "Name" },
      hebrewDate: { label: "Hebrew date", placeholder: "16 Elul" },
    },
    extra: [],
    defaultPlacements: ["email", "newsletter"],
    recurring: false,
    summary: (i) => i.hebrewDate,
  },
  yahrzeit: {
    key: "yahrzeit",
    titleRequired: true,
    label: "Yahrzeit",
    section: "Yahrzeits",
    icon: "🕯️",
    common: {
      title: { label: "Name (English)", placeholder: "Avraham Bachar" },
      hebrewDate: { label: "Hebrew date", placeholder: 'כ"א אלול התשפ"ד' },
    },
    extra: [
      { name: "nameHe", label: "Name (Hebrew)", input: "hebrew", placeholder: "אברהם בן רחמים" },
      { name: "relation", label: "Relation", input: "text", placeholder: "Father of Roei Bachar" },
    ],
    defaultPlacements: ["email", "newsletter"],
    recurring: false,
    summary: (i) => join(i.fields.nameHe, i.hebrewDate, i.fields.relation),
  },
  custom: {
    key: "custom",
    label: "Custom Block",
    section: "Announcements & Custom Blocks",
    icon: "📣",
    common: {
      title: { label: "Title" },
      body: { label: "Content" },
      image: { label: "Image" },
      link: { label: "Button link" },
    },
    extra: [],
    defaultPlacements: ["email"],
    recurring: true,
    summary: (i) => firstLine(i.body),
  },
} satisfies Record<string, ContentTypeDef>;

export type ContentTypeKey = keyof typeof types;
export const CONTENT_TYPES: Record<ContentTypeKey, ContentTypeDef> = types;
/** Display order on the week screen (roughly the order of the newsletter). */
export const CONTENT_TYPE_ORDER = Object.keys(types) as ContentTypeKey[];

export function isContentType(value: string): value is ContentTypeKey {
  return Object.hasOwn(types, value);
}
