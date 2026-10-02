import "server-only";
import { nextDue, showFrom, type Repeat } from "./recurring";
import { createAdminClient } from "./supabase/server";

/**
 * A recurring task was just finished: make the next one. It's due one cadence
 * later and shows up on the board a little before then (see showFrom).
 */
export async function scheduleNextRepeat(taskId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("tasks")
    .select("agency_id, client_id, assignee_id, title, note, due_at, repeat, created_by, source")
    .eq("id", taskId)
    .maybeSingle();
  if (!t?.repeat) return;
  const repeat = t.repeat as Repeat;
  let due = nextDue(new Date(t.due_at ?? Date.now()), repeat);
  // Finished very late? Skip ahead to the next date that's still to come.
  while (due.getTime() < Date.now()) due = nextDue(due, repeat);
  const appears = showFrom(due, repeat);
  await admin.from("tasks").insert({
    agency_id: t.agency_id, client_id: t.client_id, assignee_id: t.assignee_id, title: t.title, note: t.note,
    due_at: due.toISOString(), repeat, source: t.source ?? "manual", created_by: t.created_by,
    show_from: appears.getTime() > Date.now() ? appears.toISOString() : null,
  });
}

/**
 * Recurring tasks whose show-up date has arrived: tell the person it's back on
 * their board (a notification and an email). Runs daily.
 */
export async function announceRecurringTasks(now = new Date()) {
  const admin = createAdminClient();
  const { data: due } = await admin
    .from("tasks")
    .select("id, agency_id, client_id, assignee_id, title, due_at, agency:agencies(timezone)")
    .not("repeat", "is", null)
    .not("show_from", "is", null)
    .lte("show_from", now.toISOString())
    .is("popped_at", null)
    .neq("status", "done");
  const { notifyUser } = await import("./notifications");
  const { sendEmail } = await import("./notify");
  for (const t of due ?? []) {
    const tz = (t.agency as unknown as { timezone: string } | null)?.timezone ?? "America/New_York";
    const when = t.due_at ? new Date(t.due_at).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }) : null;
    await notifyUser(t.agency_id, t.client_id, t.assignee_id, { kind: "task", title: `Coming up: ${t.title}`, body: when ? `Due ${when}` : null, link: `/team/tasks/${t.id}` });
    if (t.assignee_id) {
      const { data: m } = await admin.from("agency_members").select("email").eq("user_id", t.assignee_id).maybeSingle();
      if (m?.email) await sendEmail([m.email], `Coming up: ${t.title}`, `Your recurring task "${t.title}" is back on your board${when ? `, due ${when}` : ""}.\n\n${process.env.NEXT_PUBLIC_SITE_URL}/team/tasks/${t.id}`);
    }
    await admin.from("tasks").update({ popped_at: now.toISOString() }).eq("id", t.id);
  }
  return (due ?? []).length;
}
