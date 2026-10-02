export type Period = "month" | "quarter";

/** First day of the month or quarter that `date` falls in. */
export function periodStart(date: string, period: Period) {
  const [y, m] = date.split("-").map(Number);
  const month = period === "quarter" ? Math.floor((m - 1) / 3) * 3 + 1 : m;
  return `${y}-${String(month).padStart(2, "0")}-01`;
}

/** The period before or after (by = -1 or 1). */
export function shiftPeriod(start: string, period: Period, by: number) {
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by * (period === "quarter" ? 3 : 1), 1)).toISOString().slice(0, 10);
}

export function periodLabel(start: string, period: Period) {
  const [y, m] = start.split("-").map(Number);
  if (period === "quarter") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** How far along a goal is, 0 to 1. Done counts as finished; with no target, it's done or not. */
export function goalProgress(g: { target: number | null; progress: number; done: boolean }) {
  if (g.done) return 1;
  if (!g.target) return 0;
  return Math.max(0, Math.min(1, g.progress / g.target));
}
