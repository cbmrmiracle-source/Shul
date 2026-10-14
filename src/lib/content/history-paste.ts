/**
 * Turns a pasted "This Week in Jewish History" (as copied from Chabad.org)
 * into separate events. Client-safe, so the paste screen can preview it live.
 *
 * Expected shape, with or without blank lines:
 *
 *   Sunday                      ← day heading (may add a date: "Sunday, Cheshvan 7")
 *   Passing of R. Meir Shapiro (1933)   ← event title
 *   Rabbi Meir Shapiro of Lublin …      ← text (one or more paragraphs)
 */

export interface PastedEvent {
  day: string;
  hebrewDate: string;
  title: string;
  body: string;
}

const DAYS: Record<string, string> = {
  shabbos: "Shabbos",
  shabbat: "Shabbos",
  saturday: "Shabbos",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

const DAY_LINE = new RegExp(`^(${Object.keys(DAYS).join("|")})\\b[\\s,:\\-–—]*(.*)$`, "i");

function dayHeading(line: string): { day: string; hebrewDate: string } | null {
  const m = DAY_LINE.exec(line);
  if (!m) return null;
  const rest = m[2].trim().replace(/[:.]$/, "");
  // "Sunday" or "Sunday, Cheshvan 7" — not a sentence that starts with a day name.
  if (rest && (rest.length > 30 || /[.!?]$/.test(m[2].trim()))) return null;
  return { day: DAYS[m[1].toLowerCase()], hebrewDate: rest };
}

/** A title is a short line that doesn't end like a sentence. */
function looksLikeTitle(line: string): boolean {
  return line.length <= 150 && !/[.!?:;,"”’']$/.test(line);
}

export function parseHistoryPaste(text: string): { events: PastedEvent[]; problems: string[] } {
  const events: PastedEvent[] = [];
  const problems: string[] = [];
  let day = "";
  let hebrewDate = "";
  let current: PastedEvent | null = null;
  let afterBreak = true; // start of text, blank line or day heading

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      afterBreak = true;
      continue;
    }
    const heading = dayHeading(line);
    if (heading) {
      ({ day, hebrewDate } = heading);
      current = null;
      afterBreak = true;
      continue;
    }

    // A title-like line right after another title is the start of its text.
    if (looksLikeTitle(line) && (!current || current.body !== "")) {
      current = { day, hebrewDate, title: line, body: "" };
      events.push(current);
    } else if (current) {
      current.body = current.body ? `${current.body}${afterBreak ? "\n\n" : " "}${line}` : line;
    } else {
      problems.push(`No title found before: “${line.length > 60 ? `${line.slice(0, 60)}…` : line}”`);
    }
    afterBreak = false;
  }

  for (const e of events) if (!e.body) problems.push(`“${e.title}” has no text under it.`);
  return { events, problems };
}
