import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShootItem } from "@/app/team/shoots/ShootList";

/** Scheduled shoots from `from` on (optionally one client's), with their planning progress. RLS limits what the viewer sees. */
export async function loadShoots(supabase: SupabaseClient, from: string, clientId?: string): Promise<ShootItem[]> {
  let q = supabase.from("content_shoots").select("id, client_id, shoot_date, end_date, start_time, location, details, repeat, series_id, clients!inner(name, archived_at, account_manager_id)")
    .eq("status", "scheduled").or(`shoot_date.gte.${from},end_date.gte.${from}`).is("clients.archived_at", null).order("shoot_date").order("start_time");
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as (ShootItem & { clients: { name: string; account_manager_id: string | null } })[];
  const ids = rows.map((r) => r.id);
  const none = { data: [] as { shoot_id: string }[] };
  const [{ data: tasks }, { data: drafts }, { data: shares }] = ids.length
    ? await Promise.all([
      supabase.from("tasks").select("shoot_id, title, status, due_at").in("shoot_id", ids).order("due_at"),
      supabase.from("shoot_plans").select("shoot_id").in("shoot_id", ids),
      supabase.from("shoot_plan_shares").select("shoot_id").in("shoot_id", ids),
    ])
    : [{ data: [] as { shoot_id: string; title: string; status: string; due_at: string }[] }, none, none];
  const has = (list: { shoot_id: string }[] | null, id: string) => (list ?? []).some((x) => x.shoot_id === id);
  return rows.map(({ clients, ...r }) => {
    const mine = (tasks ?? []).filter((t) => t.shoot_id === r.id);
    const next = mine.find((t) => t.status !== "done");
    return { ...r, clientName: clients.name, managerId: clients.account_manager_id, tasksTotal: mine.length, tasksDone: mine.filter((t) => t.status === "done").length, nextTask: next ? { title: next.title, due: next.due_at } : null,
      plan: has(shares, r.id) ? "sent" : has(drafts, r.id) ? "draft" : "none" };
  });
}
