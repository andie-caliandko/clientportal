import { NextResponse, type NextRequest } from "next/server";
import { dateAtHour } from "@/lib/approval";
import { notifyUser } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/server";

// Mondays (see vercel.json): each active client's account manager gets an
// "update this week's scorecard" task. Saving the scorecard checks it off.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, agency_id, account_manager_id, agency:agencies(timezone)")
    .is("archived_at", null);
  const { data: open } = await admin.from("tasks").select("client_id").eq("source", "scorecard").neq("status", "done");
  const hasOpen = new Set((open ?? []).map((t) => t.client_id));

  let created = 0;
  for (const c of clients ?? []) {
    if (hasOpen.has(c.id)) continue;
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
  return NextResponse.json({ created });
}
