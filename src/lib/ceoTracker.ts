/**
 * The CEO tracker: a month-by-month scorecard (revenue, mindset, lead gen, sales,
 * delivery, team, what the owner can pay themselves), plus a North Star vision.
 * Everything typed in is kept as JSON per month; income comes from the CEO dashboard.
 * The math here turns it into the same numbers the owner's spreadsheet worked out.
 */

export type Rating = "green" | "yellow" | "red";
/** One line of income: a client from the CEO dashboard, or a payment added by hand. */
export type IncomeRow = { id: string; label: string; amount: number; clientId?: string | null; status: "paid" | "projected" | "added" };
/** A line with a name and an amount: an extra payment, an expense, or what a team member was paid. */
export type Line = { id: string; label: string; amount: number };
export type Expense = Line;
export type BudgetKey = "opex" | "marketing" | "sales" | "salary" | "taxes" | "profit";

export type MonthData = {
  goal?: number; starting?: number; ending?: number;
  happiness?: number; routine?: number; identity?: number;
  inboundLeads?: number; inboundCalls?: number;
  clients?: number; upgraded?: number; cancellations?: number; teamMembers?: number;
  reflection?: string;
  magnet?: Record<string, Rating>;
  budget?: Partial<Record<BudgetKey, number>>;
  taxRate?: number; reinvestRate?: number;
  leadRows?: string[];
  /** Income added by hand, on top of the clients from the CEO dashboard. */
  extraIncome?: Line[];
  /** What each team member or contractor was paid this month. */
  team?: Line[];
  expenses?: Expense[];
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

/** Daily rows that aren't outreach: the sales funnel. */
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
  { key: "salary", label: "Team pay", pct: 0.3 },
  { key: "taxes", label: "Taxes", pct: 0.15 },
  { key: "profit", label: "Profit", pct: 0.2 },
];

export const LEAD_STATUSES = ["New", "Chatting in DMs", "Disco call scheduled", "Proposal sent", "Follow up later", "Not interested right now", "Signed", "Don't contact again"];
export const CLOSED_STATUSES = ["Signed", "Don't contact again"];

export const leadKey = (name: string) => `lead:${name}`;

/** Daily values for one month: row key → day of month → value. */
export type Daily = Record<string, Record<number, number>>;

const sum = (xs: number[]) => xs.reduce((n, x) => n + (Number.isFinite(x) ? x : 0), 0);
const rowTotal = (daily: Daily, key: string) => sum(Object.values(daily[key] ?? {}));
/** a ÷ b, or null when there's nothing to divide by (shown as a dash, never "#DIV/0!"). */
export const ratio = (a: number, b: number) => (b ? a / b : null);
/** Clients signed out of the proposal calls had (the step right before signing), or out of discovery calls when no proposal calls were logged. */
const closeRate = (signed: number, proposalsHad: number, callsHad: number) => ratio(signed, proposalsHad || callsHad);

/** `clients` is the month's income from the CEO dashboard; payments added by hand come from the month itself. */
export function monthSummary(d: MonthData, daily: Daily, clients: IncomeRow[] = []) {
  const leadRows = d.leadRows ?? DEFAULT_LEAD_ROWS;
  const income: IncomeRow[] = [...clients, ...(d.extraIncome ?? []).map((x) => ({ ...x, status: "added" as const }))];
  const incomeTotal = sum(income.map((r) => r.amount));
  const paid = sum(income.filter((r) => r.status !== "projected").map((r) => r.amount));
  const salary = sum((d.team ?? []).map((t) => t.amount));
  const opex = sum((d.expenses ?? []).map((e) => e.amount));
  const profit = incomeTotal - salary - opex;
  const taxRate = d.taxRate ?? 0.15;
  const reinvestRate = d.reinvestRate ?? 0.3;
  const taxes = profit > 0 ? profit * taxRate : 0;
  const reinvest = profit > 0 ? (profit - taxes) * reinvestRate : 0;
  // What's left for the owner once the team, expenses, taxes and reinvesting are covered.
  const takeHome = profit - taxes - reinvest;

  const touchPoints = sum(leadRows.map((r) => rowTotal(daily, leadKey(r))));
  const callsOffered = rowTotal(daily, "calls_offered");
  const callsHad = rowTotal(daily, "calls_had");
  const signed = rowTotal(daily, "signed");
  const proposalsOffered = rowTotal(daily, "proposals_offered");
  const proposalsHad = rowTotal(daily, "proposals_had");
  const clientCount = d.clients ?? 0;
  const ending = d.ending ?? 0;

  return {
    goal: d.goal ?? 0, starting: d.starting ?? 0, ending,
    newNeeded: (d.goal ?? 0) - (d.starting ?? 0),
    projected: incomeTotal, income, incomeTotal, paid,
    salary, opex, profit, taxes, reinvest, takeHome, taxRate, reinvestRate,
    margin: ratio(profit, incomeTotal),
    inboundLeads: d.inboundLeads ?? 0,
    touchPoints, callsHad, touchPerCall: ratio(touchPoints, callsHad), inboundCalls: d.inboundCalls ?? 0,
    callsOffered, showRate: ratio(callsHad, callsOffered),
    proposalsOffered, proposalsHad, proposalShowRate: ratio(proposalsHad, proposalsOffered),
    signed, closeRate: closeRate(signed, proposalsHad, callsHad),
    clients: clientCount, upgraded: d.upgraded ?? 0, cancellations: d.cancellations ?? 0, churn: ratio(d.cancellations ?? 0, clientCount),
    teamMembers: d.teamMembers ?? 0, revenuePerMember: ratio(ending, d.teamMembers ?? 0),
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
  const callsHad = t((s) => s.callsHad);
  const callsOffered = t((s) => s.callsOffered);
  const signed = t((s) => s.signed);
  const proposalsOffered = t((s) => s.proposalsOffered);
  const proposalsHad = t((s) => s.proposalsHad);
  const clientsServed = Math.max(0, ...months.map((m) => m.s.clients));
  const cancellations = t((s) => s.cancellations);
  // Profit is each month's profit (income minus pay and expenses) added up, so the year matches its months.
  const profit = t((s) => (s.incomeTotal ? s.profit : 0));
  return {
    revenue: t((s) => s.ending), income: t((s) => s.incomeTotal), profit, margin: ratio(profit, t((s) => s.incomeTotal)),
    salary: t((s) => s.salary), opex: t((s) => s.opex), taxes: t((s) => s.taxes), takeHome: t((s) => (s.incomeTotal ? s.takeHome : 0)),
    happiness: avg((d) => d.happiness), routine: avg((d) => d.routine), identity: avg((d) => d.identity),
    inboundLeads: t((s) => s.inboundLeads),
    touchPoints: t((s) => s.touchPoints), callsHad, touchPerCall: ratio(t((s) => s.touchPoints), callsHad),
    inboundCalls: t((s) => s.inboundCalls),
    clientsServed, upgraded: t((s) => s.upgraded), cancellations, churn: ratio(cancellations, clientsServed),
    callsOffered, showRate: ratio(callsHad, callsOffered),
    proposalsOffered, proposalsHad, proposalShowRate: ratio(proposalsHad, proposalsOffered),
    signed, closeRate: closeRate(signed, proposalsHad, callsHad),
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

/** Next year's revenue goal, worked back to clients, calls and outreach using this year's rates. */
export function yearGoalPlan(g: YearGoal, rates: { touchPerCall: number | null }) {
  if (!g.revenue) return { needed: null, clients: null, booked: null, live: null, outreach: null };
  const needed = (g.revenue ?? 0) / 12 - (g.existing ?? 0);
  const clients = ratio(needed, g.retainer ?? 0);
  const booked = clients !== null && g.closeRate && g.showRate ? clients / g.closeRate / g.showRate : null;
  return {
    needed, clients, booked, live: booked !== null ? booked * (g.showRate ?? 0) : null,
    outreach: booked !== null && rates.touchPerCall !== null ? booked * rates.touchPerCall : null,
  };
}

// ---- Saving ----

const MONTH_KEYS = new Set(["goal", "starting", "ending", "happiness", "routine", "identity", "inboundLeads", "inboundCalls", "clients", "upgraded", "cancellations", "teamMembers",
  "reflection", "magnet", "budget", "taxRate", "reinvestRate", "leadRows", "extraIncome", "team", "expenses"]);
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
