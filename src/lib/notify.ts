import "server-only";
import { createAdminClient } from "./supabase/server";
import { notifyTeam, notifyUser } from "./notifications";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Branded HTML version of a plain-text email: paragraphs, with a trailing link turned into a button. */
function toHtml(text: string) {
  const lines = text.trim().split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  const link = /^https?:\/\/\S+$/.test(last) ? lines.pop()!.trim() : null;
  const body = lines
    .join("\n")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = link
    ? `<p style="margin:24px 0 8px;"><a href="${esc(link)}" style="background:#364E4A;color:#F6F0EA;padding:13px 24px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:600;">Open your portal</a></p>`
    : "";
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#24322F;background:#F6F0EA;border-radius:16px;">${body}${button}<p style="margin:24px 0 0;color:#5B6A67;font-size:13px;">Cali &amp; Ko Marketing</p></div>`;
}

/** Sends an email through Resend, or logs it when email isn't set up yet. */
export async function sendEmail(to: string[], subject: string, text: string) {
  const recipients = [...new Set(to.filter(Boolean))];
  if (!recipients.length) return;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) {
    console.log(`[email not sent: RESEND_API_KEY/NOTIFY_FROM missing] to=${recipients.join(",")} subject=${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, text, html: toHtml(text) }),
  });
  if (!res.ok) console.error("Email failed", res.status, await res.text());
}

/**
 * Something happened on a client's account that the team should know about:
 * creates a task for the account manager and emails the team.
 */
export async function clientActivity(clientId: string, activity: {
  task: string;
  source: string;
  subject: string;
  body: string;
  status?: "todo" | "waiting";
  dueAt?: string;
  /** In-app notification: a message goes to the client's whole team; anything else to the account manager as a new task. */
  notify?: "message" | "task";
}) {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, name, agency_id, account_manager_id, agency:agencies(notify_emails)")
    .eq("id", clientId)
    .single();
  if (!client) return;

  const { data: created } = await admin.from("tasks").insert({
    agency_id: client.agency_id,
    client_id: client.id,
    title: activity.task,
    source: activity.source,
    status: activity.status ?? "todo",
    assignee_id: client.account_manager_id,
    due_at: activity.dueAt ?? null,
    auto: true,
  }).select("id").single();

  if (activity.notify === "message") {
    await notifyTeam(client.id, { kind: "message", title: `${client.name}: ${activity.subject}`, body: activity.body.slice(0, 160), link: `/team/clients/${client.id}#messages` });
  } else {
    await notifyUser(client.agency_id, client.id, client.account_manager_id, {
      kind: "task",
      title: activity.task,
      body: client.name,
      link: created ? `/team/tasks/${created.id}` : `/team/clients/${client.id}`,
    });
  }

  const { data: team } = await admin
    .from("agency_members")
    .select("email, role, user_id")
    .eq("agency_id", client.agency_id);
  const agency = client.agency as unknown as { notify_emails: string[] } | null;
  const to = [
    ...(agency?.notify_emails ?? []),
    ...(team ?? [])
      // Admins and the client's account manager. Creators don't get activity emails.
      .filter((m) => m.role === "admin" || m.user_id === client.account_manager_id)
      .map((m) => m.email),
  ];
  await sendEmail(to, `${client.name}: ${activity.subject}`, `${activity.body}\n\n${process.env.NEXT_PUBLIC_SITE_URL}/team/clients/${client.id}`);
}

/** Emails everyone on a client's portal. */
export async function emailClient(clientId: string, subject: string, body: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("client_users").select("email").eq("client_id", clientId);
  await sendEmail((data ?? []).map((u) => u.email), subject, `${body}\n\n${process.env.NEXT_PUBLIC_SITE_URL}/portal`);
}

/** Tell teammates they've been put on a client (a notification and an email). Skips whoever did it. */
export async function tellAddedToClient(clientId: string, userIds: string[], byUserId: string, asManager = false) {
  const admin = createAdminClient();
  const ids = [...new Set(userIds)].filter((id) => id && id !== byUserId);
  if (!ids.length) return;
  const [{ data: client }, { data: people }, { data: by }] = await Promise.all([
    admin.from("clients").select("id, name, agency_id").eq("id", clientId).maybeSingle(),
    admin.from("agency_members").select("user_id, email, display_name").in("user_id", ids),
    admin.from("agency_members").select("display_name").eq("user_id", byUserId).maybeSingle(),
  ]);
  if (!client) return;
  const { notifyUser } = await import("./notifications");
  const who = by?.display_name?.split(" ")[0] ?? "Your team";
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/team/clients/${client.id}`;
  for (const p of people ?? []) {
    const what = asManager ? `the account manager for ${client.name}` : `on ${client.name}'s account`;
    await notifyUser(client.agency_id, client.id, p.user_id, { kind: "task", title: `You're now ${what}`, body: `Added by ${who}`, link: `/team/clients/${client.id}` });
    await sendEmail([p.email], `You're now ${what}`, `Hi ${p.display_name.split(" ")[0]},\n\n${who} added you ${asManager ? `as the account manager for ${client.name}` : `to ${client.name}'s account`}. You can see their portal, tasks, files and messages here:\n${link}`);
  }
}
