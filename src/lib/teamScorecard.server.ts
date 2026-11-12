import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSocial } from "./services";
import { createClient } from "./supabase/server";
import { accountsScore, autoValues, healthAsOf, overallScore, quarterLabel, quarterMonths, resolveCard, scorecardScore, statusOf, type ClientRow, type KpiRow, type PersonRow, type ReportRow, type TaskRow, type Template } from "./teamScorecard";

/** Everything the scorecards page needs for one month. RLS limits scorecards to the owner and shared admins. */
export async function loadScorecards(agencyId: string, month: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
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

/** One person's scores for a month: the scorecard, their client accounts, and both averaged. */
export function scoresFor(d: Awaited<ReturnType<typeof loadScorecards>>, member: { user_id: string; role: string; title: string | null }, month: string, today: string) {
  const { card, template, custom } = resolveCard(member, d.rows.get(member.user_id), d.templates);
  const end = nextMonthStart(month);
  const autos = { own: autoValues({ userId: member.user_id, month, today, scope: "own", ...d }), all: autoValues({ userId: member.user_id, month, today, scope: "all", ...d }) };
  const entered = d.months.get(member.user_id)?.values ?? {};
  const rows = (card?.kpis ?? []).map((k) => {
    const auto = k.source === "manual" ? null : autos[k.scope ?? "own"][k.source];
    const value = auto ? auto.value : entered[k.id] ?? null;
    return { kpi: k, value, detail: auto?.detail ?? null, status: statusOf(k, value, month) };
  });
  const health = healthAsOf(d.kpis, end);
  const accounts = d.clients.filter((c) => c.account_manager_id === member.user_id && !c.archived_at && c.created_at.slice(0, 10) < end);
  const scorecard = scorecardScore(rows.map((r) => r.status));
  const accountsHealth = accountsScore(accounts.filter((c) => c.tracked).map((c) => health.get(c.id)));
  return { card, template, custom, rows, accounts, health, scorecard, accountsHealth, overall: overallScore(scorecard, accountsHealth) };
}

const nextMonthStart = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
};

/** The quarter that just ended, when today is in the first week of a new one (yyyy-mm months, and its label). */
export function reviewDue(today: string): { months: string[]; label: string; dueDate: string } | null {
  const [y, m, day] = today.split("-").map(Number);
  if (![1, 4, 7, 10].includes(m) || day > 7) return null;
  const last = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const due = new Date(Date.UTC(y, m - 1, 8)).toISOString().slice(0, 10);
  return { months: quarterMonths(last), label: quarterLabel(last), dueDate: due };
}

/**
 * Daily, in the first week of each quarter: a "Quarterly review with <name>" task for the owner for each
 * teammate with a scorecard, with their scores for the quarter that just ended. Sent once per person per quarter.
 */
export async function quarterlyReviewTasks(now = new Date()) {
  const { createAdminClient } = await import("./supabase/server");
  const { dateAtHour } = await import("./approval");
  const { notifyUser } = await import("./notifications");
  const admin = createAdminClient();
  const { data: agencies } = await admin.from("agencies").select("id, timezone, owner_id").not("owner_id", "is", null);
  let created = 0;
  for (const a of agencies ?? []) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: a.timezone }).format(now);
    const due = reviewDue(today);
    if (!due) continue;
    const loaded = await Promise.all(due.months.map((m) => loadScorecards(a.id, m, admin)));
    const last = loaded[loaded.length - 1];
    for (const member of last.members.filter((m) => m.user_id !== a.owner_id)) {
      const each = loaded.map((d, i) => scoresFor(d, member, due.months[i], today));
      if (!each[each.length - 1].card) continue;
      const first = member.display_name.split(" ")[0];
      const title = `Quarterly review with ${first} (${due.label})`;
      const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("agency_id", a.id).eq("assignee_id", a.owner_id).eq("title", title);
      if (count) continue;
      const scorecard = overallScore(...each.map((e) => e.scorecard));
      const accounts = overallScore(...each.map((e) => e.accountsHealth));
      const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
      const link = `/team/ceo/scorecards?person=${member.user_id}&month=${due.months[due.months.length - 1]}`;
      const { error } = await admin.from("tasks").insert({
        agency_id: a.id, assignee_id: a.owner_id, title, auto: true, source: "manual", created_by: a.owner_id,
        note: `${due.label}: scorecard ${pct(scorecard)} · client accounts ${pct(accounts)} · overall ${pct(overallScore(scorecard, accounts))}.\n\nGo over each KPI on their scorecard and add notes for the quarter:\n${process.env.NEXT_PUBLIC_SITE_URL}${link}`,
        due_at: dateAtHour(due.dueDate, 17, a.timezone).toISOString(),
      });
      if (error) continue;
      created++;
      await notifyUser(a.id, null, a.owner_id, { kind: "task", title: `Time for ${first}'s ${due.label} review`, body: `Overall ${pct(overallScore(scorecard, accounts))} for the quarter.`, link });
    }
  }
  return created;
}
