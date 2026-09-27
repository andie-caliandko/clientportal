import { NextResponse, type NextRequest } from "next/server";
import { clientActivity, emailClient } from "@/lib/notify";
import { formatDue } from "@/lib/approval";
import { createAdminClient } from "@/lib/supabase/server";

// Runs every hour (see vercel.json; needs Vercel Pro):
// - reminds clients 12 hours before an approval is due
// - approves calendars nobody responded to, and flags that the client didn't approve in time
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const { data: reminders } = await admin
    .from("content_calendars")
    .select("id, client_id, month, rella_url, due_at, agency:agencies(timezone), clients!inner(archived_at)")
    .eq("status", "pending")
    .is("clients.archived_at", null)
    .is("reminder_sent_at", null)
    .gt("due_at", now.toISOString())
    .lte("due_at", soon.toISOString());
  for (const c of reminders ?? []) {
    const tz = (c.agency as unknown as { timezone: string }).timezone;
    await emailClient(
      c.client_id,
      "Reminder: your content needs approval",
      `Just a reminder: please review and approve your content calendar in Rella by ${formatDue(new Date(c.due_at), tz)}.\n\n${c.rella_url}\n\nIf we don't hear from you by then, we'll post as planned.`,
    );
    await admin.from("content_calendars").update({ reminder_sent_at: now.toISOString() }).eq("id", c.id);
  }

  // Archived clients are left alone.
  const { data: archived } = await admin.from("clients").select("id").not("archived_at", "is", null);
  const skip = (archived ?? []).map((c) => c.id);
  let expireQuery = admin
    .from("content_calendars")
    .update({ status: "auto_approved", resolved_at: now.toISOString() })
    .eq("status", "pending")
    .lte("due_at", now.toISOString());
  if (skip.length) expireQuery = expireQuery.not("client_id", "in", `(${skip.join(",")})`);
  const { data: expired } = await expireQuery.select("id, client_id, month");
  for (const c of expired ?? []) {
    const month = new Date(`${c.month}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    await clientActivity(c.client_id, {
      task: `${month} content was approved automatically (client didn't approve in the window)`,
      source: "rella",
      subject: `${month} content auto-approved`,
      body: `The client didn't approve their ${month} content calendar in time, so it was approved automatically. This is noted on their account.`,
    });
    await emailClient(
      c.client_id,
      `Your ${month} content is approved`,
      `We didn't hear back in time, so your ${month} content was approved automatically and will post as planned. If anything needs to change, send us a message in your portal.`,
    );
  }

  return NextResponse.json({ reminded: reminders?.length ?? 0, autoApproved: expired?.length ?? 0 });
}
