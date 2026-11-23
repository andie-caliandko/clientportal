// Internal account health: KPI goals (good / better / best), weekly scorecard
// values, and the red / yellow / green rating that comes out of them.

export type Kpi = {
  id: string;
  name: string;
  unit: "number" | "percent" | "currency";
  higher_is_better: boolean;
  good: number;
  better: number;
  best: number;
  benchmark: string | null;
  /** Set on the client health template KPIs every social client gets. */
  template_key?: string | null;
  category?: string | null;
  /** Pick-one KPIs: the Green, Yellow and Red answers, saved as 2, 1 and 0. */
  choices?: string[] | null;
  /** Weekly (on the weekly scorecard) or monthly (on the Monthly client check, saved on the 1st). */
  cadence?: "weekly" | "monthly" | null;
};

/** The client health template, in order. The KPIs themselves are added by the database (seed_health_template). */
export const HEALTH_TEMPLATE_KEYS = ["updates", "response", "checkin", "satisfaction", "contact", "deadlines", "assets", "invoices", "renewal"] as const;

export type Rating = "green" | "yellow" | "red";
export type Tier = "best" | "better" | "good" | "below";
export type Trend = "improving" | "steady" | "slipping";

/** Changes smaller than this (relative to the last value) count as steady. */
export const STEADY_BAND = 0.02;

const beats = (value: number, goal: number, higher: boolean) => (higher ? value >= goal : value <= goal);

/** Which goal a value reaches. */
export function tierFor(value: number, kpi: Kpi): Tier {
  const h = kpi.higher_is_better;
  if (beats(value, kpi.best, h)) return "best";
  if (beats(value, kpi.better, h)) return "better";
  if (beats(value, kpi.good, h)) return "good";
  return "below";
}

/** Below Good is red, Good is yellow, Better or Best is green. */
export function ratingFor(tier: Tier): Rating {
  return tier === "below" ? "red" : tier === "good" ? "yellow" : "green";
}

/** Direction of travel between two readings, in terms of performance. */
export function trendFor(previous: number | undefined, current: number, higherIsBetter: boolean): Trend | null {
  if (previous === undefined) return null;
  const base = Math.abs(previous) || 1;
  const change = (current - previous) / base;
  if (Math.abs(change) < STEADY_BAND) return "steady";
  return change > 0 === higherIsBetter ? "improving" : "slipping";
}

const POINTS: Record<Rating, number> = { green: 2, yellow: 1, red: 0 };
const TREND_POINTS: Record<Trend, number> = { improving: 0.5, steady: 0, slipping: -0.5 };

/**
 * Overall account health. Each KPI scores Green 2, Yellow 1, Red 0, plus half a
 * point if it's improving or minus half if it's slipping. The average decides:
 * 1.5 and up is green, 0.75 up to 1.5 is yellow, below 0.75 is red.
 */
export function accountHealth(kpis: { rating: Rating; trend: Trend | null }[]): { rating: Rating; score: number } | null {
  if (!kpis.length) return null;
  const score =
    kpis.reduce((sum, k) => sum + Math.max(0, Math.min(2.5, POINTS[k.rating] + (k.trend ? TREND_POINTS[k.trend] : 0))), 0) /
    kpis.length;
  return { rating: bandFor(score), score: Math.round(score * 100) / 100 };
}

/** How much Relationship counts toward Overall; Social performance is the rest. */
export const RELATIONSHIP_WEIGHT = 0.7;

const bandFor = (score: number): Rating => (score >= 1.5 ? "green" : score >= 0.75 ? "yellow" : "red");

/**
 * A client's health in three colors. Social performance comes from their own KPIs, Relationship from the
 * client health template, and Overall weighs Relationship 70% and Social performance 30% (clients leave over
 * the relationship more than the numbers). With only one of them scored, Overall is that one.
 */
export function clientHealth(kpis: { template_key?: string | null; summary: { rating: Rating; trend: Trend | null } | null }[]) {
  const rated = (list: typeof kpis) => list.filter((k) => k.summary).map((k) => ({ rating: k.summary!.rating, trend: k.summary!.trend }));
  const performance = accountHealth(rated(kpis.filter((k) => !k.template_key)));
  const relationship = accountHealth(rated(kpis.filter((k) => k.template_key)));
  const score = performance && relationship
    ? Math.round((RELATIONSHIP_WEIGHT * relationship.score + (1 - RELATIONSHIP_WEIGHT) * performance.score) * 100) / 100
    : relationship?.score ?? performance?.score ?? null;
  return { overall: score === null ? null : { rating: bandFor(score), score }, performance, relationship };
}

/** First day of the month a date falls in: where Monthly client check readings are saved. */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** Latest rating and trend for one KPI from its readings (oldest first). */
export function summarize(kpi: Kpi, readings: number[]) {
  if (!readings.length) return null;
  const latest = readings[readings.length - 1];
  const tier = tierFor(latest, kpi);
  return { latest, tier, rating: ratingFor(tier), trend: trendFor(readings[readings.length - 2], latest, kpi.higher_is_better) };
}

export function formatKpi(value: number, unit: Kpi["unit"]) {
  if (unit === "percent") return `${Number(value.toFixed(2))}%`;
  if (unit === "currency") return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** A reading as the team sees it: the answer for pick-one KPIs, the number otherwise. */
export function showKpi(kpi: Pick<Kpi, "unit" | "choices">, value: number) {
  if (kpi.choices?.length === 3) return kpi.choices[2 - Math.max(0, Math.min(2, Math.round(value)))];
  return formatKpi(value, kpi.unit);
}

/** What counts as Green, Yellow and Red for a KPI, in words. */
export function bands(kpi: Kpi): Record<Rating, string> {
  if (kpi.choices?.length === 3) return { green: kpi.choices[0], yellow: kpi.choices[1], red: kpi.choices[2] };
  const f = (n: number) => formatKpi(n, kpi.unit);
  return kpi.higher_is_better
    ? { green: `${f(kpi.better)} or more`, yellow: `${f(kpi.good)} or more`, red: `Below ${f(kpi.good)}` }
    : { green: `${f(kpi.better)} or less`, yellow: `${f(kpi.good)} or less`, red: `Over ${f(kpi.good)}` };
}

/** Monday of the week containing `date` (yyyy-mm-dd), as yyyy-mm-dd. */
export function weekStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}
