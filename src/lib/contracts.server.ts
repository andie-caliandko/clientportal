import "server-only";
import { endOf, projectFollowUp, renewalFlagDate } from "./contracts";
import { createAdminClient } from "./supabase/server";

/**
 * Contracts that have reached their renewal point (month 5 of 6, and so on), or
 * one-time projects two weeks from wrapping up: a task for the owner, with a
 * notification and an email. Runs daily.
 */
export async function flagRenewals(now = new Date()) {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("client_contracts")
    .select("id, agency_id, client_id, kind, start_date, months, end_date, status, client:clients!inner(name, archived_at), agency:agencies(owner_id, timezone)")
    .eq("status", "active")
    .is("renewal_flagged_at", null)
    .is("client.archived_at", null);
  const { notifyUser } = await import("./notifications");
  const { sendEmail } = await import("./notify");
  let flagged = 0;
  for (const c of rows ?? []) {
    const agency = c.agency as unknown as { owner_id: string | null; timezone: string };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(now);
    const isProject = c.kind === "project";
    const end = endOf(c);
    if (today < (isProject ? projectFollowUp(end) : renewalFlagDate(c.start_date, c.months ?? 1))) continue;
    const name = (c.client as unknown as { name: string }).name;
    const endText = new Date(`${end}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
    const title = isProject ? `Follow up with ${name}: project wraps up ${endText}` : `Renewal conversation with ${name}`;
    const what = isProject ? `Their one-time project wraps up ${endText}. Talk about what's next, like ongoing support.` : `Their ${c.months}-month contract ends ${endText}. Talk renewal, then mark it Renewed or Not renewing on the CEO dashboard.`;
    await admin.from("tasks").insert({
      agency_id: c.agency_id, client_id: c.client_id, title, note: what,
      assignee_id: agency.owner_id, source: "renewal", auto: true, due_at: new Date(`${end}T21:00:00Z`).toISOString(),
    });
    await notifyUser(c.agency_id, c.client_id, agency.owner_id, { kind: "task", title: isProject ? `Follow up with ${name}` : `Time to talk renewal with ${name}`, body: `${isProject ? "Project wraps up" : "Contract ends"} ${endText}`, link: "/team/ceo" });
    if (agency.owner_id) {
      const { data: m } = await admin.from("agency_members").select("email").eq("user_id", agency.owner_id).maybeSingle();
      if (m?.email) await sendEmail([m.email], isProject ? `Follow up with ${name}` : `Time to talk renewal with ${name}`, `${what}\n\n${process.env.NEXT_PUBLIC_SITE_URL}/team/ceo`);
    }
    await admin.from("client_contracts").update({ renewal_flagged_at: now.toISOString() }).eq("id", c.id);
    flagged++;
  }
  return flagged;
}
