/**
 * Civil (Gregorian) dates are passed around as "YYYY-MM-DD" strings. This
 * matches Postgres `date` columns and avoids timezone drift from JS Dates.
 */

const CIVIL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): boolean {
  const m = CIVIL_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parts(civil: string): [number, number, number] {
  const m = CIVIL_RE.exec(civil);
  if (!m) throw new Error(`Invalid date "${civil}" (expected YYYY-MM-DD)`);
  return [+m[1], +m[2], +m[3]];
}

/** A Date at local noon on that civil day; what @hebcal/core expects. */
export function civilToLocalNoon(civil: string): Date {
  const [y, m, d] = parts(civil);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(civil: string, days: number): string {
  const [y, m, d] = parts(civil);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Shabbos */
export function weekday(civil: string): number {
  const [y, m, d] = parts(civil);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Shabbos on or after the given date. */
export function shabbosOnOrAfter(civil: string): string {
  return addDays(civil, (6 - weekday(civil) + 7) % 7);
}

export function todayCivil(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbos"];

/** "Aug 28" */
export function formatGregorianShort(civil: string): string {
  const [, m, d] = parts(civil);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "August 28, 2026" */
export function formatGregorianLong(civil: string): string {
  const [y, m, d] = parts(civil);
  const long = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${long} ${d}, ${y}`;
}

export function weekdayName(civil: string): string {
  return WEEKDAYS[weekday(civil)];
}
