import { NextResponse, type NextRequest } from "next/server";
import { dateAtHour } from "@/lib/approval";
import { notifyUser } from "@/lib/notifications";
import { isHealthTracked } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/server";

// Mondays (see vercel.json): each active client whose health is tracked gets an
// "update this week's scorecard" task for their account manager. Saving the scorecard checks it off.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, agency_id, account_manager_id, health_tracked, services, agency:agencies(timezone)")
    .is("archived_at", null);
  const { data: open } = await admin.from("tasks").select("client_id").eq("source", "scorecard").neq("status", "done");
  const hasOpen = new Set((open ?? []).map((t) => t.client_id));

  let created = 0;
  for (const c of clients ?? []) {
    if (hasOpen.has(c.id) || !isHealthTracked(c)) continue;
    const tz = (c.agency as unknown as { timezone: string }).timezone;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const { data: task } = await admin
      .from("tasks")
      .insert({
        agency_id: c.agency_id,
        client_id: c.id,
        title: `Update this week's scorecard for ${c.name}`,
        note: "Enter this week's KPI numbers on the client's Account health tab.",
        source: "scorecard",
        assignee_id: c.account_manager_id,
        due_at: dateAtHour(today, 17, tz).toISOString(),
        auto: true,
      })
      .select("id")
      .single();
    if (task) {
      created++;
      await notifyUser(c.agency_id, c.id, c.account_manager_id, {
        kind: "task",
        title: `Update this week's scorecard for ${c.name}`,
        link: `/team/clients/${c.id}?tab=health`,
      });
    }
  }

  // The last Monday of the month: a "fill out the monthly client check" task for each social client
  // that hasn't had this month's check entered yet. Saving the check checks it off.
  let checks = 0;
  const { data: openChecks } = await admin.from("tasks").select("client_id").eq("source", "client_check").neq("status", "done");
  const hasCheck = new Set((openChecks ?? []).map((t) => t.client_id));
  const { data: monthlyKpis } = await admin.from("kpis").select("id, client_id").eq("cadence", "monthly");
  for (const c of clients ?? []) {
    if (hasCheck.has(c.id) || !isHealthTracked(c)) continue;
    const tz = (c.agency as unknown as { timezone: string }).timezone;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    if (!isLastWeekOfMonth(today)) continue;
    const ids = (monthlyKpis ?? []).filter((k) => k.client_id === c.id).map((k) => k.id);
    if (!ids.length) continue;
    const { count } = await admin.from("kpi_entries").select("kpi_id", { count: "exact", head: true }).in("kpi_id", ids).eq("week", `${today.slice(0, 7)}-01`);
    if (count) continue;
    const month = new Date(`${today.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    const title = `Fill out the ${month} client check for ${c.name}`;
    const { data: task } = await admin
      .from("tasks")
      .insert({
        agency_id: c.agency_id,
        client_id: c.id,
        title,
        note: "On the client's Account health tab: the monthly client check (relationship, delivery, invoices, renewal confidence).",
        source: "client_check",
        assignee_id: c.account_manager_id,
        due_at: dateAtHour(lastDayOfMonth(today), 17, tz).toISOString(),
        auto: true,
      })
      .select("id")
      .single();
    if (task) {
      checks++;
      await notifyUser(c.agency_id, c.id, c.account_manager_id, { kind: "task", title, link: `/team/clients/${c.id}?tab=health` });
    }
  }
  return NextResponse.json({ created, checks });
}

/** The last day of the month a date (yyyy-mm-dd) falls in. */
function lastDayOfMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Whether a date is in the month's last 7 days (so the Monday cron catches each month once). */
function isLastWeekOfMonth(date: string) {
  return Number(lastDayOfMonth(date).slice(8)) - Number(date.slice(8)) < 7;
}
