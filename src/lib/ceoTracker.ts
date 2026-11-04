/**
 * The CEO tracker: a month-by-month scorecard (revenue, mindset, lead gen, sales,
 * delivery, team, budget, habits), plus a North Star vision. Everything typed in is
 * kept as JSON per month; the math here turns it into the same numbers the owner's
 * spreadsheet worked out.
 */

export type Rating = "green" | "yellow" | "red";
export type Goal = { action?: string; obstacle?: string; steps?: string };
export type IncomeRow = { id: string; label: string; clientId?: string | null; retainer: number; costs: Record<string, number> };
export type Expense = { id: string; label: string; amount: number };
export type BudgetKey = "opex" | "marketing" | "sales" | "salary" | "taxes" | "profit";

export type MonthData = {
  goal?: number; starting?: number; ending?: number;
  happiness?: number; routine?: number; identity?: number;
  inboundLeads?: number; inboundCalls?: number;
  clients?: number; upgraded?: number; cancellations?: number; teamMembers?: number;
  reflection?: string;
  magnet?: Record<string, Rating>;
  goals?: { good?: Goal; better?: Goal; best?: Goal };
  budget?: Partial<Record<BudgetKey, number>>;
  taxRate?: number; reinvestRate?: number;
  leadRows?: string[]; habitRows?: string[]; payees?: string[];
  income?: IncomeRow[]; expenses?: Expense[];
};

/** The MAGNET framework, rated green / yellow / red each month. */
export const MAGNET: { group: string; items: string[] }[] = [
  { group: "Magnetic Mindset", items: ["Daily mindset routine", "Leadership", "Health"] },
  { group: "Authentic Authority", items: ["Post consistency", "Thought leadership", "Inbound leads"] },
  { group: "Genuine Lead Generation", items: ["Consistent outreach", "Consistent booked calls", "Qualified leads"] },
  { group: "Next Level Client Delivery", items: ["Client satisfaction", "Upsells and renewals", "Referrals"] },
  { group: "Exceptional Systems", items: ["Team satisfaction", "Profit margins", "Systems"] },
  { group: "Trust Based Sales", items: ["Show ratio", "Close ratio"] },
];

export const DEFAULT_LEAD_ROWS = ["Upwork", "Indeed", "DMs", "Emails", "FB Groups"];
export const DEFAULT_HABIT_ROWS = ["Workout", "Drink 100 oz of water", "Mindset work", "Sleep on time", "Spent time outside"];

/** Daily rows that aren't outreach: content, then the sales funnel. */
export const CONTENT_ROWS = [{ key: "posts", label: "Posts" }, { key: "stories", label: "Stories" }];
export const FUNNEL_ROWS = [
  { key: "calls_offered", label: "Discovery calls offered" },
  { key: "calls_had", label: "Discovery calls had" },
  { key: "proposals_offered", label: "Proposal calls offered" },
  { key: "proposals_had", label: "Proposal calls had" },
  { key: "signed", label: "Clients signed" },
];

export const BUDGET: { key: BudgetKey; label: string; pct: number }[] = [
  { key: "opex", label: "Operating expenses", pct: 0.2 },
  { key: "marketing", label: "Marketing", pct: 0.15 },
  { key: "sales", label: "Sales", pct: 0 },
  { key: "salary", label: "Salary", pct: 0.3 },
  { key: "taxes", label: "Taxes", pct: 0.15 },
  { key: "profit", label: "Profit", pct: 0.2 },
];

export const LEAD_STATUSES = ["New", "Chatting in DMs", "Disco call scheduled", "Proposal sent", "Follow up later", "Not interested right now", "Signed", "Don't contact again"];
export const CLOSED_STATUSES = ["Signed", "Don't contact again"];

export const leadKey = (name: string) => `lead:${name}`;
export const habitKey = (name: string) => `habit:${name}`;

/** Daily values for one month: row key → day of month → value. */
export type Daily = Record<string, Record<number, number>>;

const sum = (xs: number[]) => xs.reduce((n, x) => n + (Number.isFinite(x) ? x : 0), 0);
const rowTotal = (daily: Daily, key: string) => sum(Object.values(daily[key] ?? {}));
/** a ÷ b, or null when there's nothing to divide by (shown as a dash, never "#DIV/0!"). */
export const ratio = (a: number, b: number) => (b ? a / b : null);

export function monthSummary(d: MonthData, daily: Daily) {
  const leadRows = d.leadRows ?? DEFAULT_LEAD_ROWS;
  const habitRows = d.habitRows ?? DEFAULT_HABIT_ROWS;
  const income = d.income ?? [];
  const incomeTotal = sum(income.map((r) => r.retainer));
  const payTotals = Object.fromEntries((d.payees ?? []).map((p) => [p, sum(income.map((r) => r.costs?.[p] ?? 0))]));
  const salary = sum(income.flatMap((r) => Object.values(r.costs ?? {})));
  const opex = sum((d.expenses ?? []).map((e) => e.amount));
  const profit = incomeTotal - salary - opex;
  const taxRate = d.taxRate ?? 0.15;
  const reinvestRate = d.reinvestRate ?? 0.3;
  const taxes = profit > 0 ? profit * taxRate : 0;
  const reinvest = profit > 0 ? (profit - taxes) * reinvestRate : 0;
  const takeHome = profit - taxes - reinvest;

  const posts = rowTotal(daily, "posts");
  const touchPoints = sum(leadRows.map((r) => rowTotal(daily, leadKey(r))));
  const callsOffered = rowTotal(daily, "calls_offered");
  const callsHad = rowTotal(daily, "calls_had");
  const signed = rowTotal(daily, "signed");
  const inboundLeads = d.inboundLeads ?? 0;
  const inboundCalls = d.inboundCalls ?? 0;
  const clients = d.clients ?? 0;
  const ending = d.ending ?? 0;

  return {
    goal: d.goal ?? 0, starting: d.starting ?? 0, ending,
    newNeeded: (d.goal ?? 0) - (d.starting ?? 0),
    projected: incomeTotal,
    incomeTotal, payTotals, salary, opex, profit, taxes, reinvest, takeHome, taxRate, reinvestRate,
    margin: ratio(profit, incomeTotal),
    posts, stories: rowTotal(daily, "stories"), inboundLeads, leadsPerPost: ratio(inboundLeads, posts),
    touchPoints, callsHad, touchPerCall: ratio(touchPoints, callsHad), inboundCalls, callsPerPost: ratio(inboundCalls, posts),
    callsOffered, showRate: ratio(callsHad, callsOffered),
    proposalsOffered: rowTotal(daily, "proposals_offered"), proposalsHad: rowTotal(daily, "proposals_had"),
    signed, closeRate: ratio(signed, callsHad),
    clients, upgraded: d.upgraded ?? 0, cancellations: d.cancellations ?? 0, churn: ratio(d.cancellations ?? 0, clients),
    teamMembers: d.teamMembers ?? 0, revenuePerMember: ratio(ending, d.teamMembers ?? 0),
    habits: habitRows.map((h) => ({ label: h, days: Object.values(daily[habitKey(h)] ?? {}).filter((v) => v > 0).length })),
    budget: BUDGET.map((b) => {
      const pct = d.budget?.[b.key] ?? b.pct;
      return { ...b, pct, amount: pct * incomeTotal };
    }),
  };
}
export type MonthSummary = ReturnType<typeof monthSummary>;

/** The year at a glance, worked out from each month the same way as the spreadsheet's overview. */
export function yearSummary(months: { data: MonthData; s: MonthSummary }[]) {
  const t = (f: (s: MonthSummary) => number) => sum(months.map((m) => f(m.s)));
  const avg = (f: (d: MonthData) => number | undefined) => {
    const xs = months.map((m) => f(m.data)).filter((x): x is number => typeof x === "number" && x > 0);
    return xs.length ? sum(xs) / xs.length : null;
  };
  const revenue = t((s) => s.ending);
  const salary = t((s) => s.salary);
  const opex = t((s) => s.opex);
  const posts = t((s) => s.posts);
  const callsHad = t((s) => s.callsHad);
  const callsOffered = t((s) => s.callsOffered);
  const signed = t((s) => s.signed);
  const clientsServed = Math.max(0, ...months.map((m) => m.s.clients));
  const cancellations = t((s) => s.cancellations);
  // Profit is each month's profit (income minus pay and expenses) added up, so the year matches its months.
  const profit = t((s) => (s.incomeTotal ? s.profit : 0));
  return {
    revenue, profit, margin: ratio(profit, t((s) => s.incomeTotal)), salary, opex, taxes: t((s) => s.taxes),
    happiness: avg((d) => d.happiness), routine: avg((d) => d.routine), identity: avg((d) => d.identity),
    posts, inboundLeads: t((s) => s.inboundLeads), leadsPerPost: ratio(t((s) => s.inboundLeads), posts),
    touchPoints: t((s) => s.touchPoints), callsHad, touchPerCall: ratio(t((s) => s.touchPoints), callsHad),
    inboundCalls: t((s) => s.inboundCalls), callsPerPost: ratio(t((s) => s.inboundCalls), posts),
    clientsServed, upgraded: t((s) => s.upgraded), cancellations, churn: ratio(cancellations, clientsServed),
    callsOffered, showRate: ratio(callsHad, callsOffered), signed, closeRate: ratio(signed, callsHad),
  };
}

// ---- North Star vision ----

export type VisionHorizon = { monthly?: number; current?: number; closeRate?: number; retainer?: number; showRate?: number };
export type LifeGoal = { id: string; label: string; price: number; years: number };
export type Milestone = { id: string; month: number; trigger: string; todo: string };
export type YearGoal = { revenue?: number; existing?: number; closeRate?: number; retainer?: number; showRate?: number };
export type VisionData = {
  why?: string;
  horizons?: { one?: VisionHorizon; five?: VisionHorizon; ten?: VisionHorizon };
  lifeGoals?: LifeGoal[];
  planner?: { current?: number; goal?: number; offer?: number; months?: number; closeRate?: number; leadToCall?: number; capacity?: number };
  milestones?: Milestone[];
  yearGoals?: { good?: YearGoal; better?: YearGoal; best?: YearGoal };
};

/** How many clients, calls and touch points a monthly revenue goal takes. */
export function horizonPlan(h: VisionHorizon) {
  if (!h.monthly) return { needed: null, clients: null, booked: null, live: null, touchPoints: null };
  const needed = (h.monthly ?? 0) - (h.current ?? 0);
  const clients = ratio(needed, h.retainer ?? 0);
  const booked = clients !== null && h.closeRate && h.showRate ? clients / h.closeRate / h.showRate : null;
  return { needed, clients, booked, live: booked !== null ? booked * (h.showRate ?? 0) : null, touchPoints: clients !== null ? clients * 100 : null };
}

/** What the life goals cost each year and month, and the monthly revenue that pays for them. */
export function lifePlan(goals: LifeGoal[]) {
  const rows = goals.map((g) => ({ ...g, annual: g.years ? g.price / g.years : g.price }));
  const annual = sum(rows.map((r) => r.annual));
  // You keep about 40% of revenue as take-home, so the business needs this much a month.
  return { rows, annual, monthly: annual / 12, dreamBudget: annual / 0.4 / 12 };
}

export function growthPlan(p: NonNullable<VisionData["planner"]>) {
  const gap = (p.goal ?? 0) - (p.current ?? 0);
  const clients = ratio(gap, p.offer ?? 0);
  const perMonth = clients !== null ? ratio(clients, p.months ?? 0) : null;
  const callsMonth = perMonth !== null ? ratio(perMonth, p.closeRate ?? 0) : null;
  const leadsMonth = callsMonth !== null ? ratio(callsMonth, p.leadToCall ?? 0) : null;
  return {
    gap, clients, perMonth, callsMonth, callsWeek: callsMonth !== null ? callsMonth / 4 : null,
    leadsMonth, leadsWeek: leadsMonth !== null ? leadsMonth / 4 : null,
    team: clients !== null ? ratio(clients, p.capacity ?? 0) : null,
    touchWeek: leadsMonth !== null ? leadsMonth / 4 / 0.1 : null,
  };
}

/** Next year's revenue goal, worked back to clients, calls, outreach and posts using this year's rates. */
export function yearGoalPlan(g: YearGoal, rates: { touchPerCall: number | null; callsPerPost: number | null }) {
  if (!g.revenue) return { needed: null, clients: null, booked: null, live: null, outreach: null, posts: null };
  const needed = (g.revenue ?? 0) / 12 - (g.existing ?? 0);
  const clients = ratio(needed, g.retainer ?? 0);
  const booked = clients !== null && g.closeRate && g.showRate ? clients / g.closeRate / g.showRate : null;
  return {
    needed, clients, booked, live: booked !== null ? booked * (g.showRate ?? 0) : null,
    outreach: booked !== null && rates.touchPerCall !== null ? booked * rates.touchPerCall : null,
    posts: booked !== null && rates.callsPerPost ? booked / rates.callsPerPost : null,
  };
}

// ---- Saving ----

const MONTH_KEYS = new Set(["goal", "starting", "ending", "happiness", "routine", "identity", "inboundLeads", "inboundCalls", "clients", "upgraded", "cancellations", "teamMembers",
  "reflection", "magnet", "goals", "budget", "taxRate", "reinvestRate", "leadRows", "habitRows", "payees", "income", "expenses"]);
const VISION_KEYS = new Set(["why", "horizons", "lifeGoals", "planner", "milestones", "yearGoals"]);

export const isSheetKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) || k === "vision";

/** Only known fields, and nothing huge, get saved. */
export function cleanPatch(key: string, patch: unknown): Record<string, unknown> | null {
  if (!isSheetKey(key) || !patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const allowed = key === "vision" ? VISION_KEYS : MONTH_KEYS;
  const out = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)));
  if (!Object.keys(out).length || JSON.stringify(out).length > 200_000) return null;
  return out;
}

// ---- Showing numbers ----

export const fmtMoney = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(n) < 1000 && n % 1 ? 2 : 0 });
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n * 1000) / 10}%`);
export const fmtNum = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
export const monthName = (m: string, style: "long" | "short" = "long") =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: style, year: "numeric" });
