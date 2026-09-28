import { tierFor, type Kpi, type Tier } from "./health";

export type RangeKey = "month" | "last-month" | "30" | "60" | "90" | "custom";
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "30", label: "Past 30 days" },
  { key: "60", label: "Past 60 days" },
  { key: "90", label: "Past 90 days" },
  { key: "custom", label: "Custom" },
];

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** First and last day (yyyy-mm-dd, inclusive) for a report range, given today's date. */
export function rangeDates(key: RangeKey, today: string, custom?: { from?: string; to?: string }) {
  const [y, m] = today.split("-").map(Number);
  if (key === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === "last-month") {
    const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }
  if (key === "custom" && custom?.from && custom?.to && DATE.test(custom.from) && DATE.test(custom.to)) {
    return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
  }
  const days = key === "60" ? 60 : key === "90" ? 90 : 30;
  return { from: shift(today, -(days - 1)), to: today };
}

export type KpiReport = {
  points: { week: string; value: number }[];
  first: number | null;
  last: number | null;
  /** last − first */
  change: number | null;
  /** Relative change, e.g. 0.12 for +12%. Null when it can't be worked out. */
  pct: number | null;
  /** Did it move the right way (up when higher is better)? Null when flat or unknown. */
  better: boolean | null;
  tier: Tier | null;
  high: number | null;
  low: number | null;
  average: number | null;
};

/**
 * One KPI over a period. Weekly readings are keyed by the week's Monday; a
 * week counts when its Monday falls in the range, or the week began just
 * before it (so a range starting mid-week includes that week).
 */
export function kpiReport(kpi: Kpi, history: { week: string; value: number }[], from: string, to: string): KpiReport {
  const start = shift(from, -6);
  const points = history.filter((h) => h.week >= start && h.week <= to).sort((a, b) => a.week.localeCompare(b.week));
  if (!points.length) return { points, first: null, last: null, change: null, pct: null, better: null, tier: null, high: null, low: null, average: null };
  const values = points.map((p) => p.value);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const pct = first !== 0 ? change / Math.abs(first) : null;
  return {
    points,
    first,
    last,
    change,
    pct,
    better: change === 0 || points.length < 2 ? null : change > 0 === kpi.higher_is_better,
    tier: tierFor(last, kpi),
    high: Math.max(...values),
    low: Math.min(...values),
    average: values.reduce((a, b) => a + b, 0) / values.length,
  };
}
