export const REPEATS = [
  { key: "weekly", label: "Every week" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Every month" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "yearly", label: "Every year" },
] as const;
export type Repeat = (typeof REPEATS)[number]["key"];

/** How many days before it's due the next one shows up on the board. */
const LEAD_DAYS: Record<Repeat, number> = { weekly: 1, biweekly: 3, monthly: 7, quarterly: 14, yearly: 30 };

/** The next due date after `from` (keeps the time of day; month ends clamp, e.g. Jan 31 → Feb 28). */
export function nextDue(from: Date, repeat: Repeat): Date {
  const d = new Date(from);
  if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else {
    const months = repeat === "monthly" ? 1 : repeat === "quarterly" ? 3 : 12;
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d;
}

/** When the next one appears on the board. */
export function showFrom(due: Date, repeat: Repeat): Date {
  return new Date(due.getTime() - LEAD_DAYS[repeat] * 86_400_000);
}

export const repeatLabel = (r: string | null | undefined) => REPEATS.find((x) => x.key === r)?.label ?? null;
