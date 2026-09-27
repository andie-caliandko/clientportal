"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requestSlots, type CallRequest } from "@/lib/calls";
import { calendarChanged, createMemberEvent } from "@/lib/google";
import { notifyUser } from "@/lib/notifications";
import { sendEmail } from "@/lib/notify";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clientActivity } from "@/lib/notify";
import { postToSlack } from "@/lib/slack";
import { after } from "next/server";
import { syncUploadsToDrive } from "@/lib/drive";
import { afterMessageFiles, readAttachments } from "@/lib/messageFiles";

async function markStep(v: { agency: { id: string }; client: { id: string }; userId: string }, kind: string) {
  const supabase = await createClient();
  const { data: step } = await supabase
    .from("onboarding_steps")
    .select("id")
    .eq("agency_id", v.agency.id)
    .eq("kind", kind)
    .maybeSingle();
  if (!step) return;
  await supabase
    .from("client_step_status")
    .upsert({ client_id: v.client.id, step_id: step.id, completed_by: v.userId }, { ignoreDuplicates: true });
}

export async function saveAnswer(questionId: string, body: string) {
  const v = await requireClient();
  const supabase = await createClient();
  await supabase.from("answers").upsert({
    client_id: v.client.id,
    question_id: questionId,
    body,
    updated_by: v.userId,
    updated_at: new Date().toISOString(),
  });
}

export async function submitQuestionnaire(): Promise<{ error?: string }> {
  const v = await requireClient();
  const supabase = await createClient();
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("id, position, required").order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", v.client.id),
  ]);
  const answered = new Set((answers ?? []).filter((a) => a.body.trim()).map((a) => a.question_id));
  const missing = (questions ?? []).filter((q) => q.required && !answered.has(q.id));
  if (missing.length) return { error: `Question ${missing[0].position} still needs an answer.` };

  await markStep(v, "questionnaire");
  await clientActivity(v.client.id, {
    task: `Review ${v.client.name}'s onboarding questionnaire`,
    source: "portal",
    subject: "onboarding questionnaire submitted",
    body: `${v.clientUser.display_name} finished the onboarding questionnaire.`,
  });
  revalidatePath("/portal");
  redirect("/portal?done=questionnaire");
}

export async function finishUploads(kind: "branding" | "content", files: { name: string; path: string }[]) {
  const v = await requireClient();
  if (!files.length) return;
  const supabase = await createClient();
  const { data: saved } = await supabase
    .from("uploads")
    .insert(
      files.map((f) => ({
        agency_id: v.agency.id,
        client_id: v.client.id,
        kind,
        file_name: f.name,
        storage_path: f.path,
        created_by: v.userId,
      })),
    )
    .select("id");
  // Copy into their Google Drive folder after the page has responded.
  const ids = (saved ?? []).map((u) => u.id);
  if (ids.length) after(() => syncUploadsToDrive({ uploadIds: ids }));
  await markStep(v, kind === "branding" ? "upload_branding" : "upload_content");
  await clientActivity(v.client.id, {
    task: `Review ${files.length} ${kind} file${files.length > 1 ? "s" : ""} from ${v.client.name}`,
    source: "portal",
    subject: `${files.length} ${kind} file${files.length > 1 ? "s" : ""} uploaded`,
    body: `${v.clientUser.display_name} uploaded:\n${files.map((f) => `- ${f.name}`).join("\n")}`,
  });
  revalidatePath("/portal");
  redirect(`/portal?done=${kind}`);
}

export async function confirmBooked() {
  const v = await requireClient();
  await markStep(v, "booking");
  await clientActivity(v.client.id, {
    task: `Prepare for ${v.client.name}'s kickoff call`,
    source: "portal",
    subject: "kickoff call booked",
    body: `${v.clientUser.display_name} booked their kickoff call.`,
  });
  revalidatePath("/portal");
}

export async function sendMessage(form: FormData) {
  const v = await requireClient();
  const body = String(form.get("body") ?? "").trim();
  const attachments = readAttachments(form, v.agency.id, v.client.id);
  if (!body && !attachments.length) return;
  const supabase = await createClient();
  const slackTs = body ? await postToSlack(v.client.slack_channel_id, `*${v.clientUser.display_name}* (via portal):\n${body}`) : null;
  afterMessageFiles({
    agencyId: v.agency.id, clientId: v.client.id, userId: v.userId, attachments,
    slackChannel: v.client.slack_channel_id, slackComment: body ? undefined : `*${v.clientUser.display_name}* (via portal) shared a file`,
  });
  await supabase.from("messages").insert({
    agency_id: v.agency.id,
    client_id: v.client.id,
    author_id: v.userId,
    author_name: v.clientUser.display_name,
    author_kind: "client",
    body,
    attachments,
    source: "portal",
    slack_ts: slackTs,
  });
  await clientActivity(v.client.id, {
    task: `Reply to ${v.clientUser.display_name.split(" ")[0]}: "${(body || `sent ${attachments.length} file${attachments.length > 1 ? "s" : ""}`).slice(0, 60)}${body.length > 60 ? "…" : ""}"`,
    source: "portal",
    subject: `new message from ${v.clientUser.display_name}`,
    body: body || `${v.clientUser.display_name} sent ${attachments.map((a) => a.name).join(", ")}`,
    notify: "message",
  });
  revalidatePath("/portal");
}

export async function approveCalendar(form: FormData) {
  const v = await requireClient();
  const supabase = await createClient();
  const id = String(form.get("id"));
  await supabase.rpc("approve_calendar", { cal: id });
  await clientActivity(v.client.id, {
    task: `${v.client.name} approved their content calendar`,
    source: "portal",
    subject: "content calendar approved",
    body: `${v.clientUser.display_name} marked their content calendar approved.`,
  });
  revalidatePath("/portal");
}

export async function invitePerson(_: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const v = await requireClient();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!name || !email) return { error: "Add their name and email." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("client_users")
    .select("*", { count: "exact", head: true })
    .eq("client_id", v.client.id);
  if ((count ?? 0) >= 2) return { error: "Your portal already has 2 people, which is the limit." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`,
    data: { display_name: name },
  });
  if (error || !data.user) return { error: "We couldn't send that invite. Check the email address and try again." };

  const { error: linkError } = await admin.from("client_users").insert({
    client_id: v.client.id,
    user_id: data.user.id,
    role: "member",
    display_name: name,
    email,
  });
  if (linkError) return { error: "That person couldn't be added. They may already have a portal." };

  revalidatePath("/portal");
  return { ok: `Invite sent. ${name.split(" ")[0]} will get an email to create a password.` };
}

/** Client marks a task from their team done, with an optional comment and file. */
export async function completeClientTask(input: { id: string; comment: string; filePath: string | null }) {
  const v = await requireClient();
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("title").eq("id", input.id).maybeSingle();
  if (!task) return { error: "That task wasn't found." };
  const { error } = await supabase.rpc("complete_client_task", {
    task: input.id,
    comment: input.comment,
    file_path: input.filePath,
  });
  if (error) return { error: "That didn't save. Try again." };
  const comment = input.comment.trim();
  if (input.filePath) {
    const { data: up } = await supabase
      .from("uploads")
      .insert({
        agency_id: v.agency.id,
        client_id: v.client.id,
        kind: "task",
        file_name: input.filePath.split("/").pop()!.replace(/^\d+-/, ""),
        storage_path: input.filePath,
        created_by: v.userId,
      })
      .select("id")
      .single();
    if (up) after(() => syncUploadsToDrive({ uploadIds: [up.id] }));
  }
  await clientActivity(v.client.id, {
    task: `${v.clientUser.display_name.split(" ")[0]} finished: ${task.title}`,
    source: "portal",
    subject: `task done: ${task.title}`,
    body: `${v.clientUser.display_name} marked "${task.title}" done.${comment ? `\n\nTheir note: ${comment}` : ""}${input.filePath ? "\n\nThey attached a file. You'll find it on the client's page." : ""}`,
  });
  revalidatePath("/portal");
  return { ok: "Done! Your team has been told." };
}

/** A client picks one of the offered times; the host's Google Calendar invites them with a Meet link. */
export async function bookCall(requestId: string, start: string): Promise<{ error?: string; ok?: string }> {
  const v = await requireClient();
  const admin = createAdminClient();
  const { data } = await admin.from("call_requests").select("*").eq("id", requestId).eq("client_id", v.client.id).maybeSingle();
  const req = data as CallRequest | null;
  if (!req || req.status !== "open") return { error: "This call is already booked or was cancelled. Refresh the page." };
  const tz = v.agency.timezone;
  let slots: string[];
  try {
    slots = await requestSlots(req, tz, { fresh: true });
  } catch {
    return { error: "We couldn't check the calendar just now. Try again in a minute." };
  }
  const startMs = new Date(start).getTime();
  if (!slots.some((s) => new Date(s).getTime() === startMs)) return { error: "That time was just taken. Please pick another." };

  // Claim the request first so two people can't book it at once.
  const { data: claimed } = await admin
    .from("call_requests")
    .update({ status: "booked", booked_by: v.userId, booked_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This call was just booked. Refresh the page." };

  const [{ data: contacts }, { data: host }] = await Promise.all([
    admin.from("client_users").select("email").eq("client_id", v.client.id),
    admin.from("agency_members").select("display_name, email").eq("user_id", req.host_id).maybeSingle(),
  ]);
  const short = v.agency.brand.shortName ?? v.agency.name;
  const end = new Date(startMs + req.duration_min * 60_000).toISOString();
  try {
    const event = await createMemberEvent(req.host_id, {
      title: `${req.title} · ${v.client.name} & ${short}`,
      description: `${req.note ? `${req.note}\n\n` : ""}Booked by ${v.clientUser.display_name} through the ${short} portal.`,
      start: new Date(startMs).toISOString(),
      end,
      timeZone: tz,
      attendees: (contacts ?? []).map((c) => c.email).filter(Boolean),
      meet: true,
    });
    await admin
      .from("call_requests")
      .update({ event_id: event.id, event_start: event.start, event_end: event.end, meet_link: event.meetLink })
      .eq("id", req.id);
  } catch (err) {
    console.error("Booking a call failed", err);
    await admin.from("call_requests").update({ status: "open", booked_by: null, booked_at: null }).eq("id", req.id);
    return { error: "We couldn't add this to the calendar. Try again, or send us a message." };
  }

  const when = new Date(startMs).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  await notifyUser(v.agency.id, v.client.id, req.host_id, { kind: "task", title: `${v.client.name} booked: ${req.title}`, body: when, link: `/team/clients/${v.client.id}` });
  if (host?.email) {
    await sendEmail([host.email], `${v.client.name} booked your ${req.title}`, `${v.clientUser.display_name} picked ${when}.\n\nIt's on your Google Calendar with a Google Meet link, and they've been sent the invite.`);
  }
  calendarChanged(req.host_id);
  revalidateTag(`meetings-${v.agency.id}`);
  revalidatePath("/portal/meetings");
  revalidatePath("/portal");
  return { ok: `You're booked for ${when}. A Google Calendar invite with the Meet link is on its way to your email.` };
}
