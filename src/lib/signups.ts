import "server-only";
import { notifyUser } from "./notifications";
import { createAdminClient } from "./supabase/server";

/** The agency Dubsado webhooks belong to (one agency per portal for now). */
export async function webhookAgency() {
  const { data } = await createAdminClient()
    .from("agencies")
    .select("id, timezone, owner_id")
    .eq("slug", process.env.DEFAULT_AGENCY_SLUG?.trim() ?? "")
    .maybeSingle();
  return data;
}

/**
 * Someone signed a contract or paid in Dubsado but has no portal yet. Keep
 * them on the CEO dashboard's "New clients to set up" list, and the first
 * time, give the owner a task to set up their portal (admins are told too).
 */
export async function recordSignup(input: { email: string; name?: string; project?: string; contract?: boolean; paid?: { amount: number | null; at: Date } }) {
  const agency = await webhookAgency();
  if (!agency) return null;
  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await admin.from("client_signups").select("*").eq("agency_id", agency.id).ilike("email", email).maybeSingle();
  const patch = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.project ? { project: input.project } : {}),
    ...(input.contract ? { contract_signed_at: existing?.contract_signed_at ?? new Date().toISOString() } : {}),
    ...(input.paid ? { paid_at: input.paid.at.toISOString(), amount: input.paid.amount } : {}),
  };
  if (existing) {
    await admin.from("client_signups").update(patch).eq("id", existing.id);
    return existing.id as string;
  }
  const label = input.name || input.project || email;
  const { data: admins } = await admin.from("agency_members").select("user_id").eq("agency_id", agency.id).eq("role", "admin");
  const owner = agency.owner_id ?? admins?.[0]?.user_id ?? null;
  const { data: task } = await admin.from("tasks").insert({
    agency_id: agency.id, title: `Set up ${label}'s client portal and assign an account manager`,
    note: `${input.contract ? "Signed their contract" : "Paid an invoice"} in Dubsado (${email}). Use Set up portal on the CEO dashboard to start their portal with this filled in.`,
    assignee_id: owner, source: "dubsado", auto: true, due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  }).select("id").single();
  const { data: row } = await admin.from("client_signups").insert({ agency_id: agency.id, email, setup_task_id: task?.id ?? null, ...patch }).select("id").single();
  for (const a of admins ?? []) {
    await notifyUser(agency.id, null, a.user_id, { kind: "task", title: `New client: ${label}`, body: `${input.contract ? "Signed their contract" : "Paid"} in Dubsado. Their portal needs setting up.`, link: "/team/ceo" });
  }
  return row?.id ?? null;
}

/**
 * A client was just created: if they came in through Dubsado, link them up.
 * Their payment moves to the CEO dashboard row and the setup task is checked off.
 */
export async function linkSignup(clientId: string, agencyId: string, emails: string[], timeZone: string) {
  const admin = createAdminClient();
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (!list.length) return;
  const { data: rows } = await admin.from("client_signups").select("*").eq("agency_id", agencyId).is("client_id", null);
  const match = (rows ?? []).find((r) => list.includes(String(r.email).toLowerCase()));
  if (!match) return;
  await admin.from("client_signups").update({ client_id: clientId }).eq("id", match.id);
  if (match.setup_task_id) await admin.from("tasks").update({ status: "done", completed_at: new Date().toISOString(), client_id: clientId }).eq("id", match.setup_task_id);
  if (match.paid_at) {
    const month = `${new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(match.paid_at)).slice(0, 7)}-01`;
    await admin.from("client_invoices").upsert(
      { agency_id: agencyId, client_id: clientId, month, status: "paid", paid_at: match.paid_at, amount: match.amount, source: "dubsado", updated_at: new Date().toISOString() },
      { onConflict: "client_id,month" },
    );
  }
  if (match.contract_signed_at) {
    const { data: step } = await admin.from("onboarding_steps").select("id").eq("agency_id", agencyId).eq("kind", "contract").maybeSingle();
    if (step) await admin.from("client_step_status").upsert({ client_id: clientId, step_id: step.id }, { ignoreDuplicates: true });
  }
}
