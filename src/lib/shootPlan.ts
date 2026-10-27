/** A content shoot plan: what we're going for, the shots we need, and how the day runs. */
export type Shot = { text: string };
export type TimelineItem = { time: string; text: string };
export type ShootPlan = { overview: string; shots: Shot[]; timeline: TimelineItem[] };

export const EMPTY_PLAN: ShootPlan = { overview: "", shots: [], timeline: [] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Tidy a plan from the form or the database: trims text, drops blank rows, caps sizes. */
export function cleanPlan(raw: unknown): ShootPlan {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  return {
    overview: str(p.overview, 4000),
    shots: list(p.shots).map((s) => ({ text: str(s?.text, 300) })).filter((s) => s.text).slice(0, 150),
    timeline: list(p.timeline).map((t) => ({ time: str(t?.time, 40), text: str(t?.text, 300) })).filter((t) => t.text).slice(0, 60),
  };
}

export const planIsEmpty = (p: ShootPlan) => !p.overview && !p.shots.length && !p.timeline.length;

export const samePlan = (a: ShootPlan, b: ShootPlan) => JSON.stringify(cleanPlan(a)) === JSON.stringify(cleanPlan(b));
