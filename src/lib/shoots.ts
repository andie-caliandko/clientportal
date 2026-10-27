/** How often a content shoot repeats. */
export const SHOOT_REPEATS = [
  { key: "monthly", label: "Every month", months: 1 },
  { key: "every_2_months", label: "Every 2 months", months: 2 },
  { key: "quarterly", label: "Every 3 months (quarterly)", months: 3 },
  { key: "every_6_months", label: "Every 6 months", months: 6 },
  { key: "yearly", label: "Every year", months: 12 },
] as const;
export type ShootRepeat = (typeof SHOOT_REPEATS)[number]["key"];

export const shootRepeatLabel = (r: string | null | undefined) => SHOOT_REPEATS.find((x) => x.key === r)?.label ?? null;
export const isShootRepeat = (r: string): r is ShootRepeat => SHOOT_REPEATS.some((x) => x.key === r);

/** Repeating shoots are scheduled this far ahead, so their planning tasks start on time. */
export const SERIES_HORIZON_DAYS = 120;

/** The planning process for every shoot: days before the first day (negative is days after the last day). */
export const SHOOT_STEPS = [
  { days: 45, title: "Start planning the content shoot", note: "Goals for the shoot, what content we need, and ideas." },
  { days: 30, title: "Confirm shoot details with the client", note: "Location, time, who'll be there, and any products or spaces to feature." },
  { days: 21, title: "Send the shot list and mood board", note: "Share the plan so the client can prepare." },
  { days: 7, title: "Confirm the shoot with the client and the team", note: "Final check on time, place and the shot list." },
  { days: -3, title: "Upload and organize the shoot photos and video", note: "Add everything to their Google Drive folder." },
] as const;

/** Planning tasks appear on the board this many days before they're due. */
export const STEP_LEAD_DAYS = 7;

const DAY = 86_400_000;
const toDate = (s: string) => Date.parse(`${s}T00:00:00Z`);
const fromDate = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The next shoot date in a series (month ends clamp, e.g. Jan 31 → Feb 28). */
export function nextShootDate(date: string, repeat: ShootRepeat) {
  const months = SHOOT_REPEATS.find((r) => r.key === repeat)!.months;
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return fromDate(target.getTime());
}

/**
 * The planning tasks for a shoot from `shootDate` to `endDate` (one day if empty), given
 * today's date. Steps whose date has already passed are due today, unless the shoot has
 * already started (then the planning steps are skipped).
 */
export function planShootSteps(shootDate: string, today: string, endDate?: string | null) {
  const shoot = toDate(shootDate), end = toDate(endDate && endDate > shootDate ? endDate : shootDate), now = toDate(today);
  return SHOOT_STEPS.flatMap((s) => {
    const due = s.days >= 0 ? shoot - s.days * DAY : end - s.days * DAY;
    if (due < now && s.days > 0 && shoot < now) return [];
    const at = Math.max(due, now);
    const appears = at - STEP_LEAD_DAYS * DAY;
    return [{ title: s.title, note: s.note, due: fromDate(at), showFrom: appears > now ? fromDate(appears) : null }];
  });
}

/** "10:00" → "10 AM", "14:30" → "2:30 PM". */
export function timeLabel(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** Days between two dates (for keeping a series' shoots the same length). */
export const daysBetween = (a: string, b: string) => Math.round((toDate(b) - toDate(a)) / DAY);
export const addDays = (d: string, n: number) => fromDate(toDate(d) + n * DAY);

/** "Thu, Nov 12" or, for a multi-day shoot, "Thu, Nov 12 – Fri, Nov 13". */
export function shootDates(start: string, end?: string | null) {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  return end && end > start ? `${f(start)} – ${f(end)}` : f(start);
}
