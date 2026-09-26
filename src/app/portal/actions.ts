"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clientActivity } from "@/lib/notify";
import { postToSlack } from "@/lib/slack";

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
  await supabase.from("uploads").insert(
    files.map((f) => ({
      agency_id: v.agency.id,
      client_id: v.client.id,
      kind,
      file_name: f.name,
      storage_path: f.path,
      created_by: v.userId,
    })),
  );
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
  if (!body) return;
  const supabase = await createClient();
  const slackTs = await postToSlack(v.client.slack_channel_id, `*${v.clientUser.display_name}* (via portal):\n${body}`);
  await supabase.from("messages").insert({
    agency_id: v.agency.id,
    client_id: v.client.id,
    author_id: v.userId,
    author_name: v.clientUser.display_name,
    author_kind: "client",
    body,
    source: "portal",
    slack_ts: slackTs,
  });
  await clientActivity(v.client.id, {
    task: `Reply to ${v.clientUser.display_name.split(" ")[0]}: "${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"`,
    source: "portal",
    subject: `new message from ${v.clientUser.display_name}`,
    body,
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
    source: "rella",
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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/set-password`,
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
  await clientActivity(v.client.id, {
    task: `${v.clientUser.display_name.split(" ")[0]} finished: ${task.title}`,
    source: "portal",
    subject: `task done: ${task.title}`,
    body: `${v.clientUser.display_name} marked "${task.title}" done.${comment ? `\n\nTheir note: ${comment}` : ""}${input.filePath ? "\n\nThey attached a file. You'll find it on the client's page." : ""}`,
  });
  revalidatePath("/portal");
  return { ok: "Done! Your team has been told." };
}
