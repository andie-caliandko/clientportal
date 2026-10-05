import "server-only";
import { nextInviteReminder } from "./invites";
import { sendEmail } from "./notify";
import { createAdminClient } from "./supabase/server";

/** A fresh link that signs them in and lets them set their password. */
async function signInLink(email: string) {
  const admin = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`;
  const invite = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (invite.data?.properties?.action_link) return invite.data.properties.action_link;
  // Already registered (the first invite created them): a password link works the same way.
  const reset = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  return reset.data?.properties?.action_link ?? null;
}

/** Email someone a fresh portal invite. `final` is the last automatic one. */
export async function sendInviteReminder(clientUserId: { client_id: string; user_id: string }, opts: { final?: boolean; manual?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: cu } = await admin
    .from("client_users")
    .select("email, display_name, client:clients(name, agency:agencies(name, brand))")
    .eq("client_id", clientUserId.client_id)
    .eq("user_id", clientUserId.user_id)
    .maybeSingle();
  if (!cu) return false;
  const link = await signInLink(cu.email);
  if (!link) return false;
  const client = cu.client as unknown as { name: string; agency: { name: string; brand: { shortName?: string } } };
  const short = client.agency.brand?.shortName ?? client.agency.name;
  const first = cu.display_name.trim();
  await sendEmail(
    [cu.email],
    opts.final ? `Last reminder: your ${short} portal is ready` : `Your ${short} portal is waiting for you`,
    `Hi ${first},\n\n${opts.manual ? `Here's a fresh link to your ${client.name} portal with ${short}.` : `Just a reminder that your ${client.name} portal with ${short} is set up and ready.`} It's where you'll find your onboarding steps, tasks, content approvals and messages with our team.\n\nCreate your password and sign in here:\n${link}\n\nThe link works once. If it's expired, use "Forgot password" on the sign-in page with this email address.`,
  );
  return true;
}

/** Daily: remind people who haven't accepted their portal invite (48 hours, then a week later). */
export async function remindUnjoinedInvites(now = new Date()) {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("client_users")
    .select("client_id, user_id, created_at, invite_reminders, invite_reminded_at, client:clients!inner(archived_at)")
    .is("joined_at", null)
    .lt("invite_reminders", 2)
    .is("client.archived_at", null);
  let sent = 0;
  for (const p of pending ?? []) {
    const due = nextInviteReminder(p.created_at, p.invite_reminders, p.invite_reminded_at);
    if (!due || due.getTime() > now.getTime()) continue;
    if (await sendInviteReminder(p, { final: p.invite_reminders === 1 })) {
      await admin.from("client_users").update({ invite_reminders: p.invite_reminders + 1, invite_reminded_at: now.toISOString() })
        .eq("client_id", p.client_id).eq("user_id", p.user_id);
      sent++;
    }
  }
  return sent;
}
