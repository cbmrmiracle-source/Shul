import type { RenderItem } from "./data";

/**
 * Sponsors are listed before co-sponsors, each under its own heading.
 * Items saved before the Sponsor/Co-sponsor choice existed have no level:
 * several of them are treated as co-sponsors (the old wording), one as a sponsor.
 */
export interface SponsorGroup {
  level: "sponsor" | "co_sponsor";
  /** "Sponsored by" / "Co-Sponsored by" */
  heading: string;
  items: RenderItem[];
}

export function sponsorGroups(sponsors: RenderItem[]): SponsorGroup[] {
  const legacyDefault = sponsors.every((s) => !s.fields.level) && sponsors.length > 1 ? "co_sponsor" : "sponsor";
  const levelOf = (s: RenderItem) => (s.fields.level === "co_sponsor" || s.fields.level === "sponsor" ? s.fields.level : legacyDefault);
  const groups: SponsorGroup[] = [
    { level: "sponsor", heading: "Sponsored by", items: sponsors.filter((s) => levelOf(s) === "sponsor") },
    { level: "co_sponsor", heading: "Co-Sponsored by", items: sponsors.filter((s) => levelOf(s) === "co_sponsor") },
  ];
  return groups.filter((g) => g.items.length > 0);
}
