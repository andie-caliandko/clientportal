/**
 * The owner's pricing calculator: an hourly rate from the salary goal and hours (like their pricing
 * spreadsheet), a full-cost rate that also covers team pay, expenses and profit, the offer suite
 * priced by the hours it takes, capacity, and quotes for prospects. Saved in ceo_sheets (owner-only)
 * under the keys "pricing", "offers" and "quote:<id>".
 */

/** A task and the hours it takes each month (or once, for a one-time offer). `cost` is money spent on it, like a photographer. */
export type Item = { id: string; label: string; hours: number; cost?: number };

export type Offer = {
  id: string;
  name: string;
  kind: "monthly" | "one_time";
  /** What you charge. Empty for custom pricing. */
  price: number | null;
  note?: string;
  items: Item[];
};

export type PricingSettings = {
  /** Yearly salary goal (gross). */
  salary?: number;
  /** Your hours a week. */
  myHours?: number;
  /** Profit kept on top of costs, as 0.2 for 20%. */
  margin?: number;
  /** Billable hours a week for each person on the team, by their name in the CEO tracker's Team pay. */
  teamHours?: Record<string, number>;
  /** How many clients are on each monthly offer, for the capacity check. */
  clients?: Record<string, number>;
};

export type QuoteLine = Item & { group?: string; once?: boolean };
export type QuoteOption = { id: string; label: string; lines: QuoteLine[]; monthly?: number | null; oneTime?: number | null };
export type Quote = { id: string; name: string; business?: string; notes?: string; created: string; options: QuoteOption[] };

export type Line = { id: string; label: string; amount: number };

/** Weeks in a month, the way the spreadsheet counts them. */
export const WEEKS = 4;
export const DEFAULT_MARGIN = 0.2;

const sum = (xs: number[]) => xs.reduce((n, x) => n + (Number.isFinite(x) ? x : 0), 0);
const per = (a: number, b: number) => (b > 0 ? a / b : null);

/** Both hourly rates, and what they're made of. Team pay and expenses come from the CEO tracker. */
export function rates(s: PricingSettings, team: Line[] = [], expenses: Line[] = []) {
  const salaryMonth = (s.salary ?? 0) / 12;
  const myMonth = (s.myHours ?? 0) * WEEKS;
  const margin = Math.min(Math.max(s.margin ?? DEFAULT_MARGIN, 0), 0.9);
  const people = team.map((t) => ({ ...t, hours: s.teamHours?.[t.label] ?? 0 }));
  const teamPay = sum(team.map((t) => t.amount));
  const opex = sum(expenses.map((e) => e.amount));
  const costs = salaryMonth + teamPay + opex;
  const needed = costs / (1 - margin);
  const billable = myMonth + sum(people.map((p) => p.hours)) * WEEKS;
  return {
    salaryMonth, myMonth, margin, people, teamPay, opex, costs, needed, billable,
    /** The spreadsheet's rate: your salary over your own hours. */
    sheetRate: per(salaryMonth, myMonth),
    /** Covers salary, team pay, expenses and profit over everyone's billable hours. */
    fullRate: per(needed, billable),
  };
}
export type Rates = ReturnType<typeof rates>;

const hoursOf = (items: Item[]) => sum(items.map((i) => i.hours));
const costOf = (items: Item[]) => sum(items.map((i) => i.cost ?? 0));
const at = (rate: number | null, hours: number, cost: number) => (rate === null ? null : hours * rate + cost);

/** A price rounded up to the next $50, the way a quote would say it. */
export const roundPrice = (n: number | null) => (n === null ? null : Math.ceil(n / 50) * 50);

export type Verdict = "both" | "cost" | "salary" | "below" | "custom";

/** An offer's hours, what it should cost at each rate, and how its price stacks up. */
export function offerSummary(o: Offer, r: Rates) {
  const hours = hoursOf(o.items);
  const cost = costOf(o.items);
  const sheetPrice = at(r.sheetRate, hours, cost);
  const fullPrice = at(r.fullRate, hours, cost);
  const covers = (p: number | null) => p !== null && o.price !== null && o.price >= p - 0.5;
  const verdict: Verdict = o.price === null ? "custom"
    : covers(fullPrice) && covers(sheetPrice) ? "both"
    : covers(fullPrice) ? "cost"
    : covers(sheetPrice) ? "salary"
    : "below";
  return { hours, cost, sheetPrice, fullPrice, verdict, effectiveRate: o.price === null ? null : per(o.price - cost, hours) };
}

/** The hourly budget: hours your monthly clients take against the hours you and your team have. */
export function capacity(offers: Offer[], clients: Record<string, number> = {}, r: Rates) {
  const rows = offers.filter((o) => o.kind === "monthly").map((o) => ({ offer: o, count: clients[o.id] ?? 0, hours: hoursOf(o.items) }));
  const used = sum(rows.map((x) => x.count * x.hours));
  const left = r.billable - used;
  return {
    used, available: r.billable, left,
    share: per(used, r.billable),
    rows: rows.map((x) => ({ ...x, total: x.count * x.hours, room: x.hours > 0 ? Math.max(0, Math.floor(left / x.hours)) : null })),
  };
}

/** One option on a quote: monthly and one-time hours and costs, suggested prices, and the price you settled on. */
export function optionSummary(o: QuoteOption, r: Rates) {
  const part = (lines: QuoteLine[]) => {
    const hours = hoursOf(lines);
    const cost = costOf(lines);
    const full = at(r.fullRate, hours, cost);
    return { hours, cost, sheet: at(r.sheetRate, hours, cost), full, suggested: roundPrice(full) };
  };
  const monthly = part(o.lines.filter((l) => !l.once));
  const once = part(o.lines.filter((l) => l.once));
  return {
    monthly: { ...monthly, price: o.monthly ?? monthly.suggested ?? 0 },
    once: { ...once, price: o.oneTime ?? once.suggested ?? 0 },
  };
}

// ---- Saving: only known fields, sensible numbers, nothing huge ----

const num = (v: unknown, max = 10_000_000) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : undefined;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : Math.random().toString(36).slice(2, 10));
const numMap = (v: unknown, max: number) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v).slice(0, 200)) { const n = num(x, max); if (n !== undefined) out[k.slice(0, 120)] = n; }
  return out;
};

function cleanItem(v: unknown): QuoteLine | null {
  if (!v || typeof v !== "object") return null;
  const i = v as Record<string, unknown>;
  const out: QuoteLine = { id: id(i.id), label: str(i.label, 300), hours: num(i.hours, 10_000) ?? 0 };
  const cost = num(i.cost);
  if (cost) out.cost = cost;
  if (typeof i.group === "string" && i.group) out.group = str(i.group, 120);
  if (i.once === true) out.once = true;
  return out;
}
const cleanItems = (v: unknown) => (Array.isArray(v) ? v.slice(0, 200).map(cleanItem).filter((x): x is QuoteLine => !!x) : []);

export function cleanSettings(v: unknown): PricingSettings | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>;
  const out: PricingSettings = {};
  if ("salary" in s) out.salary = num(s.salary);
  if ("myHours" in s) out.myHours = num(s.myHours, 168);
  if ("margin" in s) { const m = num(s.margin, 0.9); out.margin = m; }
  if ("teamHours" in s) out.teamHours = numMap(s.teamHours, 168);
  if ("clients" in s) out.clients = numMap(s.clients, 1000);
  return Object.keys(out).length ? out : null;
}

export function cleanOffers(v: unknown): Offer[] | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  return v.filter((o) => o && typeof o === "object").map((o) => {
    const x = o as Record<string, unknown>;
    return {
      id: id(x.id),
      name: str(x.name, 120) || "Untitled offer",
      kind: x.kind === "one_time" ? "one_time" : "monthly",
      price: x.price === null || x.price === undefined || x.price === "" ? null : num(x.price) ?? null,
      ...(typeof x.note === "string" && x.note ? { note: str(x.note, 1000) } : {}),
      items: cleanItems(x.items).map(({ id: i, label, hours, cost }) => ({ id: i, label, hours, ...(cost ? { cost } : {}) })),
    };
  });
}

export function cleanQuote(v: unknown): Quote | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const q = v as Record<string, unknown>;
  const options = Array.isArray(q.options) ? q.options.slice(0, 5).filter((o) => o && typeof o === "object").map((o) => {
    const x = o as Record<string, unknown>;
    const price = (p: unknown) => (p === null || p === undefined || p === "" ? null : num(p) ?? null);
    return { id: id(x.id), label: str(x.label, 60) || "Option", lines: cleanItems(x.lines), monthly: price(x.monthly), oneTime: price(x.oneTime) };
  }) : [];
  const quote: Quote = {
    id: id(q.id),
    name: str(q.name, 160) || "New quote",
    created: typeof q.created === "string" && /^\d{4}-\d{2}-\d{2}/.test(q.created) ? q.created.slice(0, 10) : new Date().toISOString().slice(0, 10),
    options: options.length ? options : [{ id: id(null), label: "Option 1", lines: [], monthly: null, oneTime: null }],
  };
  if (typeof q.business === "string" && q.business) quote.business = str(q.business, 160);
  if (typeof q.notes === "string" && q.notes) quote.notes = str(q.notes, 4000);
  return JSON.stringify(quote).length > 200_000 ? null : quote;
}

/** What an offer adds to a quote: its items, labelled with the offer they came from. */
export const offerLines = (o: Offer): QuoteLine[] =>
  o.items.map((i) => ({ ...i, id: Math.random().toString(36).slice(2, 10), group: o.name, ...(o.kind === "one_time" ? { once: true } : {}) }));
