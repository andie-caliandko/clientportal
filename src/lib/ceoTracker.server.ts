import "server-only";
import { monthKeyDate, startedBy } from "./ceo";
import { monthSummary, type Daily, type IncomeRow, type MonthData, type VisionData } from "./ceoTracker";
import { createClient } from "./supabase/server";

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
};

/** Daily rows for a range of days, grouped by month: month → row → day → value. */
async function dailyBetween(agencyId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("ceo_daily").select("day, row_key, value").eq("agency_id", agencyId).gte("day", from).lte("day", to);
  const out = new Map<string, Daily>();
  for (const r of data ?? []) {
    const month = String(r.day).slice(0, 7);
    const d = out.get(month) ?? {};
    (d[r.row_key] ??= {})[Number(String(r.day).slice(8, 10))] = Number(r.value);
    out.set(month, d);
  }
  return out;
}

/**
 * Income for each month, from the CEO dashboard: every client on a monthly retainer by then
 * (paid, or still to pay), plus any other payment logged that month and revenue imported there.
 */
async function portalIncomeFor(months: string[]) {
  const supabase = await createClient();
  const [{ data: clients }, { data: billing }, { data: contracts }, { data: invoices }, { data: imported }] = await Promise.all([
    supabase.from("clients").select("id, name, start_date, archived_at").order("name"),
    supabase.from("client_billing").select("client_id, monthly_fee"),
    supabase.from("client_contracts").select("client_id, kind, start_date").order("start_date", { ascending: false }),
    supabase.from("client_invoices").select("client_id, month, amount, status"),
    supabase.from("revenue_entries").select("id, paid_on, amount, client_name"),
  ]);
  const fee = new Map((billing ?? []).map((b) => [b.client_id, Number(b.monthly_fee)]));
  const name = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const isProject = (id: string) => (contracts ?? []).find((k) => k.client_id === id)?.kind === "project";
  const startOf = (c: { id: string; start_date: string | null }) =>
    (contracts ?? []).filter((k) => k.client_id === c.id).map((k) => k.start_date as string).sort()[0] ?? c.start_date ?? null;
  const out = new Map<string, IncomeRow[]>();
  for (const month of months) {
    const paid = (invoices ?? []).filter((i) => i.month === monthKeyDate(month) && i.status === "paid");
    const rows: IncomeRow[] = [];
    for (const c of clients ?? []) {
      const f = fee.get(c.id) ?? 0;
      const inv = paid.find((i) => i.client_id === c.id);
      const monthly = !isProject(c.id) && f > 0 && !c.archived_at && startedBy(startOf(c), month);
      if (inv) rows.push({ id: `c-${c.id}`, clientId: c.id, label: c.name, status: "paid", amount: Number(inv.amount ?? (isProject(c.id) ? 0 : f)) });
      else if (monthly) rows.push({ id: `c-${c.id}`, clientId: c.id, label: c.name, status: "projected", amount: f });
    }
    // A paid invoice for a client no longer listed (say, archived) still counts.
    for (const i of paid) if (!rows.some((r) => r.clientId === i.client_id)) rows.push({ id: `c-${i.client_id}`, clientId: i.client_id, label: name.get(i.client_id) ?? "Client", status: "paid", amount: Number(i.amount ?? 0) });
    for (const r of (imported ?? []).filter((x) => String(x.paid_on).startsWith(month))) {
      rows.push({ id: `r-${r.id}`, label: r.client_name || "Imported revenue", status: "paid", amount: Number(r.amount) });
    }
    out.set(month, rows.filter((r) => r.amount));
  }
  return out;
}

const CARRY = ["leadRows", "team", "expenses", "budget", "taxRate", "reinvestRate"] as const;
/** What usually stays the same month to month (team pay, expenses, lead sources, the budget) carries over until it's changed. */
function carry(data: MonthData, earlier: MonthData[]) {
  const out = { ...data };
  for (const k of CARRY) {
    if (out[k] === undefined) {
      const found = earlier.find((p) => p[k] !== undefined)?.[k];
      if (found !== undefined) (out as Record<string, unknown>)[k] = found;
    }
  }
  return out;
}

/** Every month from `from` to `to` ("2026-01" … "2026-12"), with its numbers worked out. */
export async function loadMonths(agencyId: string, from: string, to: string) {
  const supabase = await createClient();
  const list: string[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) list.push(m);
  const [{ data: sheets }, daily, income] = await Promise.all([
    supabase.from("ceo_sheets").select("key, data").eq("agency_id", agencyId).lte("key", to).gte("key", "2000-01").order("key", { ascending: false }),
    dailyBetween(agencyId, `${from}-01`, `${to}-${lastDay(to)}`),
    portalIncomeFor(list),
  ]);
  const saved = (sheets ?? []).filter((s) => /^\d{4}-\d{2}$/.test(s.key));
  const byKey = new Map(saved.map((s) => [s.key, s.data as MonthData]));
  return list.map((month) => {
    const data = carry(byKey.get(month) ?? {}, saved.filter((s) => s.key < month).map((s) => s.data as MonthData));
    const d = daily.get(month) ?? {};
    const rows = income.get(month) ?? [];
    return { month, saved: byKey.has(month), data, daily: d, income: rows, s: monthSummary(data, d, rows) };
  });
}

/** One month to edit, with the CEO dashboard's clients for it. */
export async function loadMonth(agencyId: string, month: string) {
  const [m] = await loadMonths(agencyId, month, month);
  const [y, mo] = month.split("-").map(Number);
  return { ...m, days: lastDay(month), year: y, monthIndex: mo };
}

export async function loadVision(agencyId: string) {
  const { data } = await (await createClient()).from("ceo_sheets").select("data").eq("agency_id", agencyId).eq("key", "vision").maybeSingle();
  return (data?.data ?? {}) as VisionData;
}
