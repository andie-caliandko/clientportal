"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { approvalDueAt, dateAtHour, formatDue } from "@/lib/approval";
import { emailClient, sendEmail } from "@/lib/notify";
import { weekStart } from "@/lib/health";
import { driveFolderId, isUrl, slackChannelId } from "@/lib/links";
import { monthKey } from "@/lib/rhythm";
import { requireAdmin, requireEditor, requireTeam } from "@/lib/session";
import { postToSlack } from "@/lib/slack";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const VIEW_ONLY = "Creators have view-only access. Ask an admin or the account manager to make this change.";

export async function moveTask(form: FormData) {
  await requireEditor();
  const supabase = await createClient();
  await supabase.from("tasks").update({ status: String(form.get("status")) }).eq("id", String(form.get("id")));
  revalidatePath("/team");
}

export async function addTask(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a name." };
  const clientId = String(form.get("client") ?? "") || null;
  const [kind, assignee] = String(form.get("assignee") || `team:${v.userId}`).split(":");
  const note = String(form.get("note") ?? "").trim() || null;
  const due = String(form.get("due") ?? "");
  const dueAt = due ? dateAtHour(due, 17, v.agency.timezone) : null;
  const supabase = await createClient();

  if (kind === "client") {
    if (!clientId) return { error: "Pick the client this task is for." };
    const { data: contact } = await supabase
      .from("client_users")
      .select("display_name, email")
      .eq("client_id", clientId)
      .eq("user_id", assignee)
      .maybeSingle();
    if (!contact) return { error: "That person isn't on this client's portal." };
    const { error } = await supabase.from("tasks").insert({
      agency_id: v.agency.id,
      client_id: clientId,
      client_assignee_id: assignee,
      title,
      note,
      due_at: dueAt?.toISOString() ?? null,
      status: "waiting",
      source: "manual",
      created_by: v.userId,
    });
    if (error) return { error: "That task couldn't be saved." };
    await sendEmail(
      [contact.email],
      `${v.member.display_name} added a task for you`,
      `${title}${note ? `\n\n${note}` : ""}${dueAt ? `\n\nDue ${formatDue(dueAt, v.agency.timezone)}.` : ""}\n\nOpen your portal to mark it done: ${process.env.NEXT_PUBLIC_SITE_URL}/portal`,
    );
    revalidatePath("/team");
    if (clientId) revalidatePath(`/team/clients/${clientId}`);
    return { ok: `Sent to ${contact.display_name.split(" ")[0]}. They'll get an email and see it in their portal.` };
  }

  const { error } = await supabase.from("tasks").insert({
    agency_id: v.agency.id,
    client_id: clientId,
    assignee_id: assignee,
    title,
    note,
    due_at: dueAt?.toISOString() ?? null,
    source: "manual",
    created_by: v.userId,
  });
  if (error) return { error: "That task couldn't be saved. Is that teammate on this client?" };
  revalidatePath("/team");
  if (clientId) revalidatePath(`/team/clients/${clientId}`);
  return { ok: "Task added." };
}

export async function sendCalendar(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const clientId = String(form.get("client"));
  const month = String(form.get("month")); // yyyy-mm
  const url = String(form.get("url") ?? "").trim();
  if (!/^https?:\/\//.test(url)) return { error: "Paste the full Rella link, starting with https://" };

  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, name, account_manager_id").eq("id", clientId).single();
  if (!client) return { error: "You don't have access to that client." };

  const sentAt = new Date();
  const due = approvalDueAt(sentAt, {
    hours: v.agency.approval_window_hours,
    skipWeekends: v.agency.approval_skip_weekends,
    timeZone: v.agency.timezone,
  });
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  const { error } = await supabase.from("content_calendars").insert({
    agency_id: v.agency.id,
    client_id: client.id,
    month: `${month}-01`,
    rella_url: url,
    sent_at: sentAt.toISOString(),
    due_at: due.toISOString(),
    created_by: v.userId,
  });
  if (error) return { error: "That calendar couldn't be saved." };

  await supabase.from("tasks").insert({
    agency_id: v.agency.id,
    client_id: client.id,
    title: `${client.name}: approve ${monthLabel} content`,
    source: "rella",
    status: "waiting",
    assignee_id: client.account_manager_id,
    due_at: due.toISOString(),
    auto: true,
  });

  const dueText = formatDue(due, v.agency.timezone);
  await emailClient(
    client.id,
    `Your ${monthLabel} content is ready for approval`,
    `Your ${monthLabel} content calendar is ready. Please review and approve it in Rella by ${dueText}.\n\n${url}\n\nIf we don't hear from you by then, we'll post as planned.`,
  );
  revalidatePath(`/team/clients/${client.id}`);
  return { ok: `Sent. ${client.name} has until ${dueText} to approve.` };
}

/** Records a PDF the browser already uploaded to storage (see UploadDocForm). */
export async function registerDocument(input: { clientId: string; kind: string; title: string; path: string }): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const kind = input.kind === "report" ? "report" : "strategy";
  const title = input.title.trim();
  if (!title) return { error: "Give the PDF a title clients will recognize." };
  if (!input.path.startsWith(`${v.agency.id}/${input.clientId}/`)) return { error: "That file is in the wrong place. Try uploading again." };

  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    agency_id: v.agency.id,
    client_id: input.clientId,
    kind,
    title,
    storage_path: input.path,
    created_by: v.userId,
  });
  if (error) return { error: "The PDF uploaded but couldn't be added to the portal. Try again." };
  await emailClient(
    input.clientId,
    kind === "report" ? `Your ${title} is ready` : `Your new strategy is ready: ${title}`,
    `We just added "${title}" to your portal. You can read it right there, nothing to download.`,
  );
  revalidatePath(`/team/clients/${input.clientId}`);
  return { ok: `${title} is now in their portal.` };
}

export async function replyAsTeam(form: FormData) {
  const v = await requireEditor();
  const clientId = String(form.get("client"));
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, slack_channel_id").eq("id", clientId).single();
  if (!client) return;
  const ts = await postToSlack(client.slack_channel_id, `*${v.member.display_name}* (replied from the team workspace):\n${body}`);
  await supabase.from("messages").insert({
    agency_id: v.agency.id,
    client_id: client.id,
    author_id: v.userId,
    author_name: v.member.display_name,
    author_kind: "team",
    body,
    source: "portal",
    slack_ts: ts,
  });
  await emailClient(client.id, `New message from ${v.member.display_name}`, body);
  revalidatePath(`/team/clients/${client.id}`);
}

export async function setStep(form: FormData) {
  await requireEditor();
  const supabase = await createClient();
  const clientId = String(form.get("client"));
  const stepId = String(form.get("step"));
  if (form.get("done") === "1") {
    await supabase.from("client_step_status").upsert({ client_id: clientId, step_id: stepId }, { ignoreDuplicates: true });
  } else {
    await supabase.from("client_step_status").delete().eq("client_id", clientId).eq("step_id", stepId);
  }
  revalidatePath(`/team/clients/${clientId}`);
}

type Connection = { key: string; label: string; laterTask: string };
const CONNECTIONS: Connection[] = [
  { key: "drive", label: "Google Drive folder", laterTask: "Create their Google Drive folder and add the link on their client page" },
  { key: "slack", label: "Slack channel", laterTask: "Create their Slack channel, invite the portal app, and add the channel on their client page" },
  { key: "rella", label: "Rella space", laterTask: "Set up their Rella space and add the link on their client page" },
  { key: "dubsado", label: "Dubsado", laterTask: "Set up the client in Dubsado and add their Dubsado email on their client page" },
];

export async function createClientAccount(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role !== "admin") return { error: "Only admins can add clients." };
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const later = (k: string) => form.get(`${k}_later`) === "on";

  const name = get("name");
  const contactName = get("contact_name");
  const contactEmail = get("contact_email").toLowerCase();
  const am = get("account_manager");
  if (!name) return { error: "Add the business name." };
  if (!contactName || !contactEmail) return { error: "Add the main contact's name and email. They'll get the portal invite." };
  if (!am) return { error: "Choose an account manager." };

  const driveId = driveFolderId(get("drive_folder"));
  const slackId = slackChannelId(get("slack_channel"));
  const rella = get("rella");
  const dubsadoEmail = (get("dubsado_email") || contactEmail).toLowerCase();
  const missing: string[] = [];
  if (!later("drive") && !driveId) missing.push("paste the Google Drive folder link");
  if (!later("slack") && !slackId) missing.push("paste the Slack channel link");
  if (!later("rella") && !isUrl(rella)) missing.push("paste the Rella space link");
  if (!later("dubsado") && !dubsadoEmail) missing.push("add the client's Dubsado email");
  if (missing.length) return { error: `Almost there: ${missing.join(", ")}, or tick "Set up later" for it.` };

  const website = get("website");
  const slug = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      agency_id: v.agency.id,
      name,
      slug,
      account_manager_id: am,
      slack_channel_id: later("slack") ? null : slackId,
      drive_folder_id: later("drive") ? null : driveId,
      rella_space_url: later("rella") ? null : rella,
      dubsado_email: later("dubsado") ? null : dubsadoEmail,
      dubsado_project_url: later("dubsado") ? null : get("dubsado_project") || null,
      website: website ? (/^https?:\/\//.test(website) ? website : `https://${website}`) : null,
      start_date: get("start_date") || null,
    })
    .select("id")
    .single();
  if (error || !client) return { error: "That client couldn't be created. Is there already a client with that name?" };

  // The agency's new-client checklist, plus a task for anything set up later.
  const today = new Date();
  const template = (v.agency.new_client_tasks ?? []) as { title: string; note?: string; days?: number; assignee?: string }[];
  const due = (days: number) => dateAtHour(
    new Intl.DateTimeFormat("en-CA", { timeZone: v.agency.timezone }).format(new Date(today.getTime() + days * 86_400_000)),
    17,
    v.agency.timezone,
  ).toISOString();
  const tasks = [
    ...template.map((t) => ({
      title: t.title,
      note: t.note ?? null,
      due_at: due(t.days ?? 0),
      // "me" goes to the admin adding the client; everything else to the account manager.
      assignee_id: t.assignee === "me" ? v.userId : am,
    })),
    ...CONNECTIONS.filter((c) => later(c.key)).map((c) => ({ title: c.laterTask, note: null, due_at: due(1), assignee_id: am })),
  ];
  if (tasks.length) {
    await supabase.from("tasks").insert(
      tasks.map((t) => ({ ...t, agency_id: v.agency.id, client_id: client.id, source: "manual", auto: true, created_by: v.userId })),
    );
  }

  const admin = createAdminClient();
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(contactEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`,
    data: { display_name: contactName },
  });
  if (inviteErr || !invite.user) {
    return { error: `${name} was created, but the invite to ${contactEmail} didn't send. Check the address and invite them from the client page.` };
  }
  await admin.from("client_users").insert({
    client_id: client.id,
    user_id: invite.user.id,
    role: "owner",
    display_name: contactName,
    email: contactEmail,
  });
  redirect(`/team/clients/${client.id}?created=1`);
}

// ---------------------------------------------------------------------------
// Admin only: team, roles and client info
// ---------------------------------------------------------------------------

const ROLES = ["admin", "account_manager", "creator"] as const;

export async function inviteTeammate(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role !== "admin") return { error: "Only admins can invite teammates." };
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role")) as (typeof ROLES)[number];
  const title = String(form.get("title") ?? "").trim() || null;
  const clientIds = form.getAll("clients").map(String);
  if (!name || !email) return { error: "Add their name and email." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`,
    data: { display_name: name },
  });
  if (error || !data.user) return { error: "That invite didn't send. Check the email address, or they may already have an account." };

  const supabase = await createClient();
  const { error: memberErr } = await supabase.from("agency_members").insert({
    agency_id: v.agency.id,
    user_id: data.user.id,
    role,
    display_name: name,
    title,
    email,
  });
  if (memberErr) return { error: "They were invited but couldn't be added to the team. Try again." };
  if (role !== "admin" && clientIds.length) {
    await supabase.from("client_team").insert(clientIds.map((client_id) => ({ client_id, user_id: data.user!.id })));
  }
  revalidatePath("/team/team");
  return { ok: `Invite sent to ${name}.` };
}

export async function changeRole(form: FormData) {
  const v = await requireAdmin();
  const userId = String(form.get("user"));
  const role = String(form.get("role")) as (typeof ROLES)[number];
  if (userId === v.userId || !ROLES.includes(role)) return;
  const supabase = await createClient();
  await supabase.from("agency_members").update({ role }).eq("agency_id", v.agency.id).eq("user_id", userId);
  revalidatePath("/team/team");
}

export async function removeTeammate(form: FormData) {
  const v = await requireAdmin();
  const userId = String(form.get("user"));
  if (userId === v.userId) return;
  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id").eq("agency_id", v.agency.id);
  const ids = (clients ?? []).map((c) => c.id);
  if (ids.length) {
    await supabase.from("client_team").delete().eq("user_id", userId).in("client_id", ids);
    await supabase.from("clients").update({ account_manager_id: null }).eq("account_manager_id", userId).in("id", ids);
  }
  await supabase.from("agency_members").delete().eq("agency_id", v.agency.id).eq("user_id", userId);
  revalidatePath("/team/team");
}

export async function addToClient(form: FormData) {
  await requireAdmin();
  const clientId = String(form.get("client"));
  const userId = String(form.get("user"));
  if (!userId) return;
  const supabase = await createClient();
  await supabase.from("client_team").upsert({ client_id: clientId, user_id: userId }, { ignoreDuplicates: true });
  revalidatePath(`/team/clients/${clientId}`);
}

export async function removeFromClient(form: FormData) {
  await requireAdmin();
  const clientId = String(form.get("client"));
  const userId = String(form.get("user"));
  const supabase = await createClient();
  await supabase.from("clients").update({ account_manager_id: null }).eq("id", clientId).eq("account_manager_id", userId);
  await supabase.from("client_team").delete().eq("client_id", clientId).eq("user_id", userId);
  revalidatePath(`/team/clients/${clientId}`);
}

export async function setAccountManager(form: FormData) {
  await requireAdmin();
  const clientId = String(form.get("client"));
  const supabase = await createClient();
  await supabase.from("clients").update({ account_manager_id: String(form.get("user")) }).eq("id", clientId);
  revalidatePath(`/team/clients/${clientId}`);
}

export async function updateClientInfo(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role !== "admin") return { error: "Only admins can change client info." };
  const clientId = String(form.get("client"));
  const get = (k: string) => String(form.get(k) ?? "").trim();
  if (!get("name")) return { error: "The client needs a name." };
  const drive = get("drive_folder"), slack = get("slack_channel"), rella = get("rella");
  if (drive && !driveFolderId(drive)) return { error: "That doesn't look like a Google Drive folder link." };
  if (slack && !slackChannelId(slack)) return { error: "That doesn't look like a Slack channel link. In Slack, right-click the channel and choose Copy link." };
  if (rella && !isUrl(rella)) return { error: "Paste the full Rella link, starting with https://" };
  const website = get("website");
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: get("name"),
      drive_folder_id: drive ? driveFolderId(drive) : null,
      slack_channel_id: slack ? slackChannelId(slack) : null,
      rella_space_url: rella || null,
      dubsado_email: get("dubsado_email").toLowerCase() || null,
      dubsado_project_url: get("dubsado_project") || null,
      website: website ? (/^https?:\/\//.test(website) ? website : `https://${website}`) : null,
      start_date: get("start_date") || null,
    })
    .eq("id", clientId);
  if (error) return { error: "Those changes couldn't be saved." };
  revalidatePath(`/team/clients/${clientId}`);
  return { ok: "Saved." };
}

export async function deleteClient(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role !== "admin") return { error: "Only admins can delete clients." };
  const clientId = String(form.get("client"));
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
  if (!client) return { error: "That client wasn't found." };
  if (String(form.get("confirm") ?? "").trim() !== client.name) {
    return { error: `Type the client's name exactly (${client.name}) to confirm.` };
  }
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return { error: "That client couldn't be deleted." };
  redirect("/team/clients");
}

// ---------------------------------------------------------------------------
// Monthly rhythm and task editing
// ---------------------------------------------------------------------------

/** Personal check-off on the monthly rhythm. Everyone, creators included, keeps their own list. */
export async function toggleRhythm(input: { week: number; item: number; checked: boolean }) {
  const v = await requireTeam();
  const supabase = await createClient();
  const key = { agency_id: v.agency.id, user_id: v.userId, month: monthKey(v.agency.timezone), week: input.week, item: input.item };
  if (input.checked) {
    await supabase.from("rhythm_checks").upsert(key);
  } else {
    await supabase.from("rhythm_checks").delete().match(key);
  }
  revalidatePath("/team");
}

export async function updateTask(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const id = String(form.get("id"));
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "The task needs a name." };
  const status = String(form.get("status"));
  if (!["todo", "doing", "waiting", "done"].includes(status)) return { error: "Pick a status." };
  const clientId = String(form.get("client") ?? "") || null;
  const [kind, assignee] = String(form.get("assignee") ?? "").split(":");
  const due = String(form.get("due") ?? "");
  const note = String(form.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const { data: before } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "That task wasn't found." };

  let contact: { display_name: string; email: string } | null = null;
  if (kind === "client") {
    if (!clientId) return { error: "Pick the client this task is for." };
    const { data } = await supabase
      .from("client_users")
      .select("display_name, email")
      .eq("client_id", clientId)
      .eq("user_id", assignee)
      .maybeSingle();
    if (!data) return { error: "That person isn't on this client's portal." };
    contact = data;
  }

  const dueAt = due ? dateAtHour(due, 17, v.agency.timezone).toISOString() : null;
  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      status,
      note,
      client_id: clientId,
      assignee_id: kind === "team" ? assignee : null,
      client_assignee_id: kind === "client" ? assignee : null,
      due_at: dueAt,
      // A new due date or a new person starts the reminder schedule over.
      reminders_sent: dueAt !== before.due_at || assignee !== before.client_assignee_id ? 0 : before.reminders_sent,
      completed_at: status === "done" ? (before.completed_at ?? new Date().toISOString()) : null,
    })
    .eq("id", id);
  if (error) return { error: "Those changes couldn't be saved. Is that teammate on this client?" };

  if (contact && assignee !== before.client_assignee_id && status !== "done") {
    await sendEmail(
      [contact.email],
      `${v.member.display_name} added a task for you`,
      `${title}${note ? `\n\n${note}` : ""}${dueAt ? `\n\nDue ${formatDue(new Date(dueAt), v.agency.timezone)}.` : ""}\n\nOpen your portal to mark it done: ${process.env.NEXT_PUBLIC_SITE_URL}/portal`,
    );
  }
  revalidatePath("/team");
  revalidatePath(`/team/tasks/${id}`);
  if (clientId) revalidatePath(`/team/clients/${clientId}`);
  return { ok: "Saved." };
}

export async function deleteTask(form: FormData) {
  await requireEditor();
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", String(form.get("id")));
  revalidatePath("/team");
  redirect(String(form.get("back") || "/team"));
}

// ---------------------------------------------------------------------------
// Google connection (admin only)
// ---------------------------------------------------------------------------

export async function setDeadlinesCalendar(form: FormData) {
  const v = await requireAdmin();
  const [id, ...name] = String(form.get("calendar") ?? "").split("|");
  await createAdminClient()
    .from("agency_integrations")
    .update({ deadlines_calendar_id: id || null, deadlines_calendar_name: name.join("|") || null, updated_at: new Date().toISOString() })
    .eq("agency_id", v.agency.id);
  revalidateTag(`due-dates-${v.agency.id}`);
  revalidatePath("/team/settings");
  revalidatePath("/team");
}

export async function disconnectGoogle() {
  const v = await requireAdmin();
  await createAdminClient().from("agency_integrations").delete().eq("agency_id", v.agency.id);
  revalidateTag(`due-dates-${v.agency.id}`);
  revalidatePath("/team/settings");
}

// ---------------------------------------------------------------------------
// Content calendars: fix the month or link after sending
// ---------------------------------------------------------------------------

export async function editCalendar(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const id = String(form.get("id"));
  const month = String(form.get("month") ?? "");
  const url = String(form.get("url") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  if (!/^https?:\/\//.test(url)) return { error: "Paste the full Rella link, starting with https://" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendars")
    .update({ month: `${month}-01`, rella_url: url })
    .eq("id", id)
    .select("client_id")
    .single();
  if (error || !data) return { error: "That change couldn't be saved." };
  revalidatePath(`/team/clients/${data.client_id}`);
  revalidatePath("/portal");
  return { ok: "Saved. The deadline stays the same." };
}

// ---------------------------------------------------------------------------
// Account health: KPIs and weekly scorecards (team only)
// ---------------------------------------------------------------------------

function readKpi(form: FormData) {
  const num = (k: string) => Number(String(form.get(k) ?? "").replace(/[$,%\s]/g, ""));
  const unit = String(form.get("unit"));
  return {
    name: String(form.get("name") ?? "").trim(),
    unit: ["number", "percent", "currency"].includes(unit) ? unit : "number",
    higher_is_better: form.get("direction") !== "lower",
    good: num("good"),
    better: num("better"),
    best: num("best"),
    benchmark: String(form.get("benchmark") ?? "").trim() || null,
  };
}

function kpiProblem(k: ReturnType<typeof readKpi>) {
  if (!k.name) return "Give the KPI a name.";
  if ([k.good, k.better, k.best].some((n) => !Number.isFinite(n))) return "Good, Better and Best need to be numbers.";
  const ordered = k.higher_is_better ? k.good <= k.better && k.better <= k.best : k.good >= k.better && k.better >= k.best;
  if (!ordered) {
    return k.higher_is_better
      ? "For this KPI, Good should be the lowest goal and Best the highest."
      : "When lower is better, Good should be the highest number and Best the lowest.";
  }
  return null;
}

export async function saveKpi(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const clientId = String(form.get("client"));
  const id = String(form.get("id") ?? "");
  const kpi = readKpi(form);
  const problem = kpiProblem(kpi);
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("kpis").update(kpi).eq("id", id)
    : await supabase.from("kpis").insert({ ...kpi, agency_id: v.agency.id, client_id: clientId, position: Date.now() % 1_000_000 });
  if (error) return { error: "That KPI couldn't be saved." };
  revalidatePath(`/team/clients/${clientId}`);
  return { ok: id ? "KPI updated." : "KPI added." };
}

export async function deleteKpi(form: FormData) {
  await requireEditor();
  const supabase = await createClient();
  const clientId = String(form.get("client"));
  await supabase.from("kpis").delete().eq("id", String(form.get("id")));
  revalidatePath(`/team/clients/${clientId}`);
}

export async function saveScorecard(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: VIEW_ONLY };
  const clientId = String(form.get("client"));
  const date = String(form.get("week") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick the week you're reviewing." };
  const week = weekStart(date);
  const supabase = await createClient();

  const rows: { kpi_id: string; client_id: string; week: string; value: number; entered_by: string }[] = [];
  const cleared: string[] = [];
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("kpi:")) continue;
    const text = String(raw).replace(/[$,%\s]/g, "");
    if (text === "") { cleared.push(key.slice(4)); continue; }
    const value = Number(text);
    if (!Number.isFinite(value)) return { error: "Scorecard values need to be numbers." };
    rows.push({ kpi_id: key.slice(4), client_id: clientId, week, value, entered_by: v.userId });
  }
  if (rows.length) {
    const { error } = await supabase.from("kpi_entries").upsert(rows);
    if (error) return { error: "The scorecard couldn't be saved." };
  }
  if (cleared.length) await supabase.from("kpi_entries").delete().eq("week", week).in("kpi_id", cleared);

  const note = String(form.get("note") ?? "").trim();
  if (note) await supabase.from("scorecard_notes").upsert({ client_id: clientId, week, note, updated_by: v.userId, updated_at: new Date().toISOString() });
  else await supabase.from("scorecard_notes").delete().eq("client_id", clientId).eq("week", week);

  revalidatePath(`/team/clients/${clientId}`);
  revalidatePath("/team/clients");
  return { ok: "Scorecard saved." };
}
