/** The kinds of engagement logged each day, in the order they show. */
export const ENGAGEMENT_ACTIONS = ["Liked", "Commented", "Followed", "Shared", "DM'd", "Replied to stories"] as const;
export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

/** One color per action (see .eg-* in globals.css). */
export const ACTION_CLASS: Record<string, string> = {
  Liked: "eg-liked",
  Commented: "eg-commented",
  Followed: "eg-followed",
  Shared: "eg-shared",
  "DM'd": "eg-dm",
  "Replied to stories": "eg-story",
};

/** Links pasted one per line (or separated by spaces or commas); only real web addresses kept. */
export function parseLinks(text: string) {
  return [...new Set(text.split(/[\s,]+/).map((l) => l.trim()).filter((l) => /^https?:\/\/\S+\.\S+/.test(l)))];
}

/** Every day of a month ("2026-09") as yyyy-mm-dd. */
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
