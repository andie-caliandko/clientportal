import "server-only";
import { startedBy } from "./ceo";
import { monthSummary, type Daily, type MonthData, type VisionData } from "./ceoTracker";
import { createClient } from "./supabase/server";

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
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

/** Every saved month from `from` to `to` ("2026-01" … "2026-12"), with its numbers worked out. */
export async function loadMonths(agencyId: string, from: string, to: string) {
  const supabase = await createClient();
  const [{ data: sheets }, daily] = await Promise.all([
    supabase.from("ceo_sheets").select("key, data").eq("agency_id", agencyId).gte("key", from).lte("key", to).neq("key", "vision"),
    dailyBetween(agencyId, `${from}-01`, `${to}-${lastDay(to)}`),
  ]);
  const byKey = new Map((sheets ?? []).filter((s) => /^\d{4}-\d{2}$/.test(s.key)).map((s) => [s.key, s.data as MonthData]));
  const months: { month: string; data: MonthData; daily: Daily }[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) months.push({ month: m, data: byKey.get(m) ?? {}, daily: daily.get(m) ?? {} });
  return months.map((m) => ({ ...m, saved: byKey.has(m.month), s: monthSummary(m.data, m.daily) }));
}

export const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
};

/**
 * One month to edit. Lists that usually stay the same (lead sources, habits, who gets paid,
 * the budget split) carry over from the latest earlier month until they're changed.
 */
export async function loadMonth(agencyId: string, month: string) {
  const supabase = await createClient();
  const [{ data: row }, { data: earlier }, daily] = await Promise.all([
    supabase.from("ceo_sheets").select("data").eq("agency_id", agencyId).eq("key", month).maybeSingle(),
    supabase.from("ceo_sheets").select("key, data").eq("agency_id", agencyId).lt("key", month).gte("key", "2000-01").order("key", { ascending: false }).limit(12),
    dailyBetween(agencyId, `${month}-01`, `${month}-${lastDay(month)}`),
  ]);
  const data = { ...((row?.data ?? {}) as MonthData) };
  const prev = (earlier ?? []).filter((e) => /^\d{4}-\d{2}$/.test(e.key)).map((e) => e.data as MonthData);
  for (const k of ["leadRows", "habitRows", "payees", "budget", "taxRate", "reinvestRate"] as const) {
    if (data[k] === undefined) {
      const found = prev.find((p) => p[k] !== undefined)?.[k];
      if (found !== undefined) (data as Record<string, unknown>)[k] = found;
    }
  }
  const lastExpenses = prev.find((p) => p.expenses?.length)?.expenses ?? [];
  const lastIncome = prev.find((p) => p.income?.length)?.income ?? [];
  return { data, daily: daily.get(month) ?? {}, lastExpenses, lastIncome, days: lastDay(month) };
}

/** What the portal knows for a month: each client's retainer (to start the income table) and the total. */
export async function portalIncome(month: string) {
  const supabase = await createClient();
  const [{ data: clients }, { data: billing }, { data: contracts }] = await Promise.all([
    supabase.from("clients").select("id, name, start_date, archived_at").is("archived_at", null).order("name"),
    supabase.from("client_billing").select("client_id, monthly_fee"),
    supabase.from("client_contracts").select("client_id, kind, start_date").order("start_date", { ascending: false }),
  ]);
  const fee = new Map((billing ?? []).map((b) => [b.client_id, Number(b.monthly_fee)]));
  const rows = (clients ?? []).flatMap((c) => {
    const terms = (contracts ?? []).filter((k) => k.client_id === c.id);
    if (terms[0]?.kind === "project") return [];
    const start = terms.map((k) => k.start_date as string).sort()[0] ?? c.start_date ?? null;
    const f = fee.get(c.id) ?? 0;
    return startedBy(start, month) && f > 0 ? [{ clientId: c.id as string, label: c.name as string, retainer: f }] : [];
  });
  return { rows, total: rows.reduce((n, r) => n + r.retainer, 0), clients: rows.length };
}

export async function loadVision(agencyId: string) {
  const { data } = await (await createClient()).from("ceo_sheets").select("data").eq("agency_id", agencyId).eq("key", "vision").maybeSingle();
  return (data?.data ?? {}) as VisionData;
}
