/**
 * Team scorecards: each teammate's KPIs with a target for each quarter, filled in each month either
 * from the portal (account health, client growth, reports, tasks, retention) or by hand.
 */
import { accountHealth, summarize, type Kpi as ClientKpi, type Rating, type Trend } from "./health";

/** Where a KPI's number comes from. Everything but "manual" is worked out from the portal. */
export const SOURCES = [
  { id: "manual", label: "Entered each month" },
  { id: "health_green", label: "Accounts in GREEN (%)" },
  { id: "health_yellow", label: "Accounts in YELLOW (%)" },
  { id: "health_red", label: "Accounts in RED (%)" },
  { id: "health_updated", label: "Accounts with a scorecard this week or last (%)" },
  { id: "followers", label: "Follower growth this month (avg %)" },
  { id: "engagement", label: "Engagement growth this month (avg %)" },
  { id: "reports", label: "Monthly reports in by the 25th (%)" },
  { id: "tasks", label: "Their tasks done on time (%)" },
  { id: "retention", label: "Clients kept this month (%)" },
  { id: "accounts", label: "Accounts managed" },
] as const;
export type Source = (typeof SOURCES)[number]["id"];
export const sourceLabel = (s: string) => SOURCES.find((x) => x.id === s)?.label ?? s;

export type Unit = "pct" | "count" | "yesno";

export type TeamKpi = {
  id: string;
  label: string;
  /** A heading the KPI sits under, like "Transition" or "Ongoing". */
  group?: string;
  source: Source;
  /** Their own accounts (the ones they're account manager on), or every active account. */
  scope?: "own" | "all";
  unit: Unit;
  /** "min": hit it or beat it. "max": stay at or under it. */
  dir: "min" | "max";
  /** Q1 to Q4. Empty means no target that quarter (say, a baseline month). */
  targets: (number | null)[];
  note?: string;
};

export type Card = { role_title: string; mission: string; kpis: TeamKpi[] };

export const quarterOf = (month: string) => Math.ceil(Number(month.slice(5, 7)) / 3);
export const targetFor = (k: TeamKpi, month: string) => k.targets[quarterOf(month) - 1] ?? null;

export type Status = "hit" | "miss" | "open" | "none";

/** Whether this month's number meets this quarter's target. "open": no number yet. "none": no target. */
export function statusOf(k: TeamKpi, value: number | null | undefined, month: string): Status {
  const t = targetFor(k, month);
  if (t === null) return "none";
  if (value === null || value === undefined || !Number.isFinite(value)) return "open";
  return k.dir === "max" ? (value <= t ? "hit" : "miss") : value >= t ? "hit" : "miss";
}

export const fmtValue = (k: Pick<TeamKpi, "unit">, v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—"
    : k.unit === "yesno" ? (v >= 1 ? "Yes" : "No")
    : k.unit === "pct" ? `${Math.round(v * 10) / 10}%`
    : v.toLocaleString("en-US", { maximumFractionDigits: 1 });

export const fmtTarget = (k: TeamKpi, month: string) => {
  const t = targetFor(k, month);
  if (t === null) return "No target";
  if (k.unit === "yesno") return t >= 1 ? "Yes" : "No";
  return `${k.dir === "max" ? "≤ " : ""}${fmtValue(k, t)}`;
};

// ---- Worked out from the portal ----

export type ClientRow = { id: string; name: string; account_manager_id: string | null; archived_at: string | null; created_at: string; tracked: boolean };
export type KpiRow = ClientKpi & { id: string; client_id: string; name: string; history: { week: string; value: number }[] };
export type TaskRow = { assignee_id: string | null; due_at: string | null; completed_at: string | null; status: string };
export type ReportRow = { client_id: string; created_at: string };

const monthStart = (m: string) => `${m}-01`;
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

/** Each account's health as of the end of the month (readings after it are ignored). */
export function healthAsOf(kpis: KpiRow[], end: string) {
  const byClient = new Map<string, { rating: Rating; trend: Trend | null }[]>();
  for (const k of kpis) {
    const s = summarize(k, k.history.filter((h) => h.week < end).map((h) => h.value));
    if (!s) continue;
    byClient.set(k.client_id, [...(byClient.get(k.client_id) ?? []), { rating: s.rating, trend: s.trend }]);
  }
  return new Map([...byClient].map(([id, list]) => [id, accountHealth(list)?.rating ?? null]));
}

const isFollowers = (name: string) => /follower/i.test(name) && !/growth|gained|new|reach|non/i.test(name);
const isEngagement = (name: string) => /engagement|\ber\b/i.test(name);

/** Average month-over-month change (%) across accounts: followers by their last reading, engagement by the month's average. */
function growth(kpis: KpiRow[], month: string, pick: (n: string) => boolean, how: "last" | "avg") {
  const start = monthStart(month), end = monthStart(nextMonth(month)), before = monthStart(prevMonth(month));
  const changes: number[] = [];
  const seen = new Set<string>();
  for (const k of kpis) {
    if (!pick(k.name) || seen.has(k.client_id)) continue;
    const now = k.history.filter((h) => h.week >= start && h.week < end).map((h) => h.value);
    const then = k.history.filter((h) => h.week >= (how === "last" ? "0000" : before) && h.week < start).map((h) => h.value);
    const a = how === "last" ? then.at(-1) : avg(then);
    const b = how === "last" ? now.at(-1) : avg(now);
    if (a === undefined || a === null || b === undefined || b === null || a === 0) continue;
    seen.add(k.client_id);
    changes.push(((b - a) / Math.abs(a)) * 100);
  }
  return { value: avg(changes), detail: `${changes.length} account${changes.length === 1 ? "" : "s"} with data` };
}

export type Auto = { value: number | null; detail: string };

/** Every portal-worked-out number for one person and month, for their own accounts or everyone's. */
export function autoValues(input: {
  userId: string; month: string; today: string; scope: "own" | "all";
  clients: ClientRow[]; kpis: KpiRow[]; tasks: TaskRow[]; reports: ReportRow[];
}): Record<Exclude<Source, "manual">, Auto> {
  const { month, scope, userId } = input;
  const start = monthStart(month), end = monthStart(nextMonth(month));
  const mine = input.clients.filter((c) => scope === "all" || c.account_manager_id === userId);
  // Active at some point this month.
  const active = mine.filter((c) => c.created_at.slice(0, 10) < end && (!c.archived_at || c.archived_at.slice(0, 10) >= start));
  const tracked = active.filter((c) => c.tracked);
  const ids = new Set(tracked.map((c) => c.id));
  const kpis = input.kpis.filter((k) => ids.has(k.client_id));

  const health = healthAsOf(kpis, end);
  const rated = tracked.map((c) => health.get(c.id)).filter(Boolean) as Rating[];
  const share = (r: Rating): Auto => ({ value: pct(rated.filter((x) => x === r).length, rated.length), detail: `${rated.filter((x) => x === r).length} of ${rated.length} rated accounts` });

  // The week that counts as "this week": the current one, or the month's last week for past months.
  const lastDay = new Date(Date.parse(`${end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const asOf = input.today < lastDay ? input.today : lastDay;
  const d = new Date(`${asOf}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const week = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 7);
  const lastWeek = d.toISOString().slice(0, 10);
  // Entered this week or last, so a new week doesn't count against them on Monday.
  const updated = tracked.filter((c) => kpis.some((k) => k.client_id === c.id && k.history.some((h) => h.week === week || h.week === lastWeek)));

  const due25 = `${month}-26`;
  const reported = tracked.filter((c) => input.reports.some((r) => r.client_id === c.id && r.created_at.slice(0, 10) >= start && r.created_at.slice(0, 10) < due25));

  // Tasks due this month that are done, or past due: done by the end of their due day counts as on time.
  const theirs = input.tasks.filter((t) => t.assignee_id === userId && t.due_at && t.due_at.slice(0, 10) >= start && t.due_at.slice(0, 10) < end);
  const counted = theirs.filter((t) => t.status === "done" || t.due_at!.slice(0, 10) < input.today);
  const onTime = counted.filter((t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) <= t.due_at!.slice(0, 10));

  // Accounts active during the month that weren't archived by its end.
  const kept = active.filter((c) => !c.archived_at || c.archived_at.slice(0, 10) >= end);

  return {
    health_green: share("green"),
    health_yellow: share("yellow"),
    health_red: share("red"),
    health_updated: { value: pct(updated.length, tracked.length), detail: `${updated.length} of ${tracked.length} tracked accounts, this week or last` },
    followers: growth(kpis, month, isFollowers, "last"),
    engagement: growth(kpis, month, isEngagement, "avg"),
    reports: { value: pct(reported.length, tracked.length), detail: `${reported.length} of ${tracked.length} tracked accounts` },
    tasks: { value: pct(onTime.length, counted.length), detail: `${onTime.length} of ${counted.length} tasks due this month` },
    retention: { value: pct(kept.length, active.length), detail: `${kept.length} of ${active.length} accounts kept` },
    accounts: { value: active.filter((c) => !c.archived_at).length, detail: scope === "all" ? "All active accounts" : "As account manager" },
  };
}

// ---- Saving ----

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : null;
};

export function cleanCard(v: unknown): Card | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const kpis = Array.isArray(c.kpis) ? c.kpis.slice(0, 60).filter((k) => k && typeof k === "object").map((k) => {
    const x = k as Record<string, unknown>;
    const targets = Array.isArray(x.targets) ? x.targets : [];
    return {
      id: typeof x.id === "string" && /^[\w-]{1,40}$/.test(x.id) ? x.id : Math.random().toString(36).slice(2, 10),
      label: String(x.label ?? "").slice(0, 300) || "New KPI",
      ...(x.group ? { group: String(x.group).slice(0, 80) } : {}),
      source: SOURCES.some((s) => s.id === x.source) ? (x.source as Source) : "manual",
      scope: x.scope === "all" ? "all" : "own",
      unit: x.unit === "count" || x.unit === "yesno" ? x.unit : "pct",
      dir: x.dir === "max" ? "max" : "min",
      targets: [0, 1, 2, 3].map((i) => num(targets[i])),
      ...(x.note ? { note: String(x.note).slice(0, 1000) } : {}),
    } as TeamKpi;
  }) : [];
  return { role_title: String(c.role_title ?? "").slice(0, 120), mission: String(c.mission ?? "").slice(0, 4000), kpis };
}

export const cleanValues = (v: unknown): Record<string, number | null> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number | null> = {};
  for (const [k, x] of Object.entries(v).slice(0, 100)) if (/^[\w-]{1,40}$/.test(k)) out[k] = num(x);
  return out;
};

// ---- Positions ----

/** A position's scorecard that everyone in it gets, matched by team role or job title. */
export type Template = Card & { id: string; title: string; auto_role: string | null; auto_title: string | null };
/** What's saved for one person: a position picked for them, or a scorecard of their own. */
export type PersonRow = Card & { user_id: string; template_id: string | null; custom: boolean };

/**
 * The scorecard a person sees: their own if it's been customized, otherwise their position's.
 * The position is the one picked for them, else the first whose job title matches, else whose role matches.
 */
export function resolveCard(member: { role: string; title: string | null }, row: PersonRow | undefined, templates: Template[]) {
  const title = (member.title ?? "").toLowerCase();
  const template = (row?.template_id ? templates.find((t) => t.id === row.template_id) : undefined)
    ?? templates.find((t) => t.auto_title && title.includes(t.auto_title.toLowerCase()))
    ?? templates.find((t) => t.auto_role && t.auto_role === member.role)
    ?? null;
  if (row?.custom) return { card: { role_title: row.role_title, mission: row.mission, kpis: row.kpis } as Card, template, custom: true };
  return { card: template ? { role_title: template.title, mission: template.mission, kpis: template.kpis } as Card : null, template, custom: false };
}

// ---- Scores ----

/** The share of KPIs with a target that are on target (0 to 100). KPIs still to enter don't count yet. */
export function scorecardScore(statuses: Status[]) {
  const counted = statuses.filter((s) => s === "hit" || s === "miss");
  return counted.length ? (counted.filter((s) => s === "hit").length / counted.length) * 100 : null;
}

const RATING_POINTS: Record<Rating, number> = { green: 100, yellow: 50, red: 0 };

/** Average health of their accounts (green 100, yellow 50, red 0). Accounts without a rating don't count. */
export function accountsScore(ratings: (Rating | null | undefined)[]) {
  const rated = ratings.filter(Boolean) as Rating[];
  return rated.length ? rated.reduce((n, r) => n + RATING_POINTS[r], 0) / rated.length : null;
}

/** The overall score: the average of whichever of the scores they have. */
export const overallScore = (...scores: (number | null)[]) => {
  const have = scores.filter((s): s is number => s !== null);
  return have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
};

/** The months of a month's quarter, up to and including that month. */
export const quarterMonths = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const first = (quarterOf(month) - 1) * 3 + 1;
  return Array.from({ length: m - first + 1 }, (_, i) => `${y}-${String(first + i).padStart(2, "0")}`);
};

export const quarterLabel = (month: string) => `Q${quarterOf(month)} ${month.slice(0, 4)}`;
