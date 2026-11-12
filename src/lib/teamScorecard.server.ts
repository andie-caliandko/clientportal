import "server-only";
import { isSocial } from "./services";
import { createClient } from "./supabase/server";
import type { ClientRow, KpiRow, PersonRow, ReportRow, TaskRow, Template } from "./teamScorecard";

/** Everything the scorecards page needs for one month. RLS limits scorecards to the owner and shared admins. */
export async function loadScorecards(agencyId: string, month: string) {
  const supabase = await createClient();
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const before = new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10);
  const [members, cards, months, clients, kpis, entries, tasks, reports, templates] = await Promise.all([
    supabase.from("agency_members").select("user_id, display_name, role, title, avatar_path").eq("agency_id", agencyId).order("display_name"),
    supabase.from("team_scorecards").select("user_id, role_title, mission, kpis, template_id, custom").eq("agency_id", agencyId),
    supabase.from("team_scorecard_months").select("user_id, values, note").eq("agency_id", agencyId).eq("month", month),
    supabase.from("clients").select("id, name, account_manager_id, archived_at, created_at, services, health_tracked").eq("agency_id", agencyId),
    supabase.from("kpis").select("*").eq("agency_id", agencyId),
    // Enough history to rate each account and compare with the month before.
    supabase.from("kpi_entries").select("kpi_id, week, value").gte("week", before).lt("week", to).order("week"),
    supabase.from("tasks").select("assignee_id, due_at, completed_at, status, title, client_id").eq("agency_id", agencyId).gte("due_at", from).lt("due_at", to),
    supabase.from("documents").select("client_id, created_at").eq("agency_id", agencyId).eq("kind", "report").gte("created_at", from).lt("created_at", to),
    supabase.from("team_scorecard_templates").select("id, title, mission, kpis, auto_role, auto_title").eq("agency_id", agencyId).order("created_at"),
  ]);
  const history = new Map<string, { week: string; value: number }[]>();
  for (const e of entries.data ?? []) history.set(e.kpi_id, [...(history.get(e.kpi_id) ?? []), { week: e.week, value: Number(e.value) }]);
  return {
    members: (members.data ?? []) as { user_id: string; display_name: string; role: string; title: string | null; avatar_path: string | null }[],
    rows: new Map((cards.data ?? []).map((c) => [c.user_id, c as PersonRow])),
    templates: (templates.data ?? []).map((t) => ({ ...t, role_title: t.title })) as Template[],
    months: new Map((months.data ?? []).map((r) => [r.user_id, { values: (r.values ?? {}) as Record<string, number | null>, note: r.note as string }])),
    clients: (clients.data ?? []).map((c) => ({
      id: c.id, name: c.name, account_manager_id: c.account_manager_id, archived_at: c.archived_at, created_at: c.created_at,
      tracked: c.health_tracked !== false && isSocial(c.services),
    })) as ClientRow[],
    kpis: (kpis.data ?? []).map((k) => ({ ...k, good: Number(k.good), better: Number(k.better), best: Number(k.best), history: history.get(k.id) ?? [] })) as KpiRow[],
    tasks: (tasks.data ?? []) as (TaskRow & { title: string; client_id: string | null })[],
    reports: (reports.data ?? []) as ReportRow[],
  };
}
