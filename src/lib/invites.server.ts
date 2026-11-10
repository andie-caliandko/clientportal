import "server-only";
import { randomBytes } from "node:crypto";
import { inviteExpiry, inviteReminderDue, REMIND_DAYS_BEFORE } from "./invites";
import { sendEmail } from "./notify";
import { createAdminClient } from "./supabase/server";

/** A fresh link that signs them in and lets them set their password. It only lasts a day, so invites use their own week-long link that makes one of these when opened. */
export async function signInLink(email: string) {
  const admin = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`;
  const invite = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (invite.data?.properties?.action_link) return invite.data.properties.action_link;
  // Already registered (the first invite created them): a password link works the same way.
  const reset = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  return reset.data?.properties?.action_link ?? null;
}

/**
 * Email someone who already signed up their sign-in page and a one-time link to set a new
 * password, for when they've lost the link or forgotten their password. Clients and teammates alike.
 */
export async function sendLoginLink(person: { email: string; name: string }, place: { what: string; short: string }) {
  const link = await signInLink(person.email);
  if (!link) return false;
  const first = person.name.trim().split(" ")[0] || person.name;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const sent = await sendEmail(
    [person.email],
    `Your ${place.short} ${place.what} sign-in link`,
    `Hi ${first},\n\nHere's how to get into your ${place.what} with ${place.short}.\n\nSign in any time at ${site}/login with this email address and your password.\n\nNeed a new password? Use the button below to set one and sign in. It works once; after that, use "Forgot password" on the sign-in page.\n${link}`,
    { button: "Set password and sign in" },
  );
  return sent !== false;
}

const longDate = (d: Date, timeZone: string) => d.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" });

type Who = { client_id: string; user_id: string };

/**
 * Give a client contact a new invite link that works for a week, and email it. The email says
 * they have a week to sign in; a reminder follows 2 days before it runs out.
 */
export async function sendPortalInvite(who: Who, opts: { manual?: boolean; reminder?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: cu } = await admin
    .from("client_users")
    .select("email, display_name, invite_token, invite_expires_at, client:clients(name, agency:agencies(name, brand, timezone))")
    .eq("client_id", who.client_id)
    .eq("user_id", who.user_id)
    .maybeSingle();
  if (!cu) return false;
  const client = cu.client as unknown as { name: string; agency: { name: string; brand: { shortName?: string }; timezone: string } };
  const short = client.agency.brand?.shortName ?? client.agency.name;
  const tz = client.agency.timezone;
  // A reminder reuses the link they already have; a new or resent invite gets a new week.
  let token = cu.invite_token as string | null;
  let expires = cu.invite_expires_at ? new Date(cu.invite_expires_at) : null;
  if (!opts.reminder || !token || !expires) {
    token = randomBytes(24).toString("base64url");
    expires = inviteExpiry();
    const { error } = await admin.from("client_users")
      .update({ invite_token: token, invite_expires_at: expires.toISOString(), invite_reminders: 0, invite_reminded_at: null })
      .eq("client_id", who.client_id).eq("user_id", who.user_id);
    if (error) return false;
  }
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  const first = cu.display_name.trim().split(" ")[0] || cu.display_name;
  const until = longDate(expires, tz);
  const about = "It's where you'll find your onboarding steps, tasks, content approvals and messages with our team.";
  const sent = opts.reminder
    ? await sendEmail(
      [cu.email],
      `Your ${short} portal invite expires in ${REMIND_DAYS_BEFORE} days`,
      `Hi ${first},\n\nJust a reminder that your ${client.name} portal with ${short} is ready for you. ${about}\n\nYour invite link expires on ${until}. Create your password and sign in before then:\n${link}`,
      { button: "Create my password" },
    )
    : await sendEmail(
      [cu.email],
      opts.manual ? `A new link to your ${short} portal` : `Welcome to your ${short} portal`,
      `Hi ${first},\n\n${opts.manual ? `Here's a new link to your ${client.name} portal with ${short}.` : `Your ${client.name} portal with ${short} is set up and ready for you.`} ${about}\n\nYou have a week to sign in: this link works until ${until}. Use it to create your password, then sign in any time at ${process.env.NEXT_PUBLIC_SITE_URL}/login.\n\n${link}`,
      { button: "Create my password" },
    );
  return sent !== false;
}

/**
 * Add someone to a client's portal and send their week-long invite. Creates their sign-in account
 * without the sign-in service's own (one-day) invite email.
 */
export async function inviteToPortal(input: { clientId: string; email: string; name: string; role: "owner" | "member" }): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: input.email, user_metadata: { display_name: input.name } });
  if (error || !data.user) return { error: "That invite didn't send. Check the email address, or they may already have an account." };
  const { error: linkErr } = await admin.from("client_users").insert({
    client_id: input.clientId, user_id: data.user.id, role: input.role, display_name: input.name, email: input.email,
  });
  if (linkErr) return { error: "They couldn't be added to this portal. They may already have one." };
  if (!(await sendPortalInvite({ client_id: input.clientId, user_id: data.user.id }))) return { error: "They were added, but the invite email didn't send. Use Resend invite on their client page." };
  return {};
}

/** Daily: a reminder 2 days before an unused invite link expires. */
export async function remindUnjoinedInvites(now = new Date()) {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("client_users")
    .select("client_id, user_id, invite_expires_at, invite_reminders, client:clients!inner(archived_at)")
    .is("joined_at", null)
    .not("invite_expires_at", "is", null)
    .eq("invite_reminders", 0)
    .is("client.archived_at", null);
  let sent = 0;
  for (const p of pending ?? []) {
    if (!inviteReminderDue(p.invite_expires_at, p.invite_reminders, now)) continue;
    if (await sendPortalInvite(p, { reminder: true })) {
      await admin.from("client_users").update({ invite_reminders: 1, invite_reminded_at: now.toISOString() })
        .eq("client_id", p.client_id).eq("user_id", p.user_id);
      sent++;
    }
  }
  return sent;
}
