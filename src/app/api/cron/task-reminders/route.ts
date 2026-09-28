import { NextResponse, type NextRequest } from "next/server";
import { REMINDER_DAYS, remindersDue } from "@/lib/approval";
import { sendEmail } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/server";
import { removeExpiredClientLogins } from "@/lib/archive";

const LABEL = ["", "2 days", "5 days", "1 week"];

// Runs once a day (see vercel.json). Tasks assigned to a client get a reminder
// 2 days, 5 days and 1 week after their due date (or after they were assigned,
// if there's no due date). At 1 week the account manager and admins hear too.
// It also closes the portals of clients archived more than 30 days ago.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, note, due_at, created_at, reminders_sent, client_id, client_assignee_id, client:clients!inner(name, agency_id, account_manager_id, archived_at)")
    .is("client.archived_at", null)
    .not("client_assignee_id", "is", null)
    .neq("status", "done")
    .lt("reminders_sent", REMINDER_DAYS.length);

  let sent = 0;
  for (const t of tasks ?? []) {
    const due = remindersDue(new Date(t.due_at ?? t.created_at), now);
    if (due <= t.reminders_sent) continue;

    const client = t.client as unknown as { name: string; agency_id: string; account_manager_id: string | null };
    const { data: contact } = await admin
      .from("client_users")
      .select("email, display_name")
      .eq("client_id", t.client_id)
      .eq("user_id", t.client_assignee_id)
      .maybeSingle();
    if (contact) {
      await sendEmail(
        [contact.email],
        `Reminder: ${t.title}`,
        `Hi ${contact.display_name.split(" ")[0]}, just a friendly reminder about this task from your team:\n\n${t.title}${t.note ? `\n${t.note}` : ""}\n\nYou can mark it done in your portal.\n${process.env.NEXT_PUBLIC_SITE_URL}/portal/tasks`,
      );
    }
    if (due === REMINDER_DAYS.length) {
      const { data: team } = await admin
        .from("agency_members")
        .select("email, role, user_id")
        .eq("agency_id", client.agency_id);
      await sendEmail(
        (team ?? []).filter((m) => m.role === "admin" || m.user_id === client.account_manager_id).map((m) => m.email),
        `${client.name}: task still not done after a week`,
        `"${t.title}" is ${LABEL[due]} past due. ${contact?.display_name ?? "The client"} has had ${due} reminders.\n\n${process.env.NEXT_PUBLIC_SITE_URL}/team/clients/${t.client_id}`,
      );
    }
    await admin.from("tasks").update({ reminders_sent: due }).eq("id", t.id);
    sent++;
  }
  // Archived clients whose 30 days are up lose their portal logins.
  const loginsRemoved = await removeExpiredClientLogins();
  return NextResponse.json({ reminded: sent, loginsRemoved });
}
