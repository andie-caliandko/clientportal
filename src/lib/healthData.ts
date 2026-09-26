import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountHealth, summarize, type Kpi } from "./health";

export type KpiWithHistory = Kpi & {
  client_id: string;
  history: { week: string; value: number }[];
  summary: ReturnType<typeof summarize>;
};

/** KPIs, their weekly readings and each account's overall rating. RLS keeps this team-only. */
export async function loadHealth(supabase: SupabaseClient, clientIds?: string[]) {
  let kq = supabase.from("kpis").select("*").order("position");
  let eq = supabase.from("kpi_entries").select("kpi_id, week, value").order("week");
  if (clientIds) {
    kq = kq.in("client_id", clientIds);
    eq = eq.in("client_id", clientIds);
  }
  const [{ data: kpis }, { data: entries }] = await Promise.all([kq, eq]);

  const byKpi = new Map<string, { week: string; value: number }[]>();
  (entries ?? []).forEach((e) => {
    const list = byKpi.get(e.kpi_id) ?? [];
    list.push({ week: e.week, value: Number(e.value) });
    byKpi.set(e.kpi_id, list);
  });

  const withHistory: KpiWithHistory[] = (kpis ?? []).map((k) => {
    const kpi = { ...k, good: Number(k.good), better: Number(k.better), best: Number(k.best) } as Kpi & { client_id: string };
    const history = byKpi.get(k.id) ?? [];
    return { ...kpi, history, summary: summarize(kpi, history.map((h) => h.value)) };
  });

  const byClient = new Map<string, KpiWithHistory[]>();
  withHistory.forEach((k) => byClient.set(k.client_id, [...(byClient.get(k.client_id) ?? []), k]));
  const health = new Map(
    [...byClient].map(([id, list]) => [
      id,
      accountHealth(list.filter((k) => k.summary).map((k) => ({ rating: k.summary!.rating, trend: k.summary!.trend }))),
    ]),
  );
  return { byClient, health };
}
