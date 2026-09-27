import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadTaskPeople } from "@/lib/taskPeople";
import type { Task } from "@/lib/types";
import { isClientFacing } from "@/lib/tasks";
import { deleteTask } from "../../actions";
import { ConfirmButton, EditTaskForm } from "../../TeamForms";
import { FilePreview } from "@/app/portal/FilePreview";

const SOURCE: Record<string, string> = {
  manual: "Added by your team",
  portal: "Came from the client portal",
  rella: "Came from a content calendar",
  dubsado: "Came from Dubsado",
  slack: "Came from Slack",
  calendar: "Came from Google Calendar",
  drive: "Came from Google Drive",
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agency, member, userId } = await requireTeam();
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const task = data as Task;

  const [{ data: clients }, people] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    loadTaskPeople(supabase, agency.id, userId),
  ]);
  const canEdit = member.role !== "creator";
  const names = new Map<string, string>(people.team.map((m) => [m.user_id, m.display_name]));
  Object.values(people.contacts).flat().forEach((c) => names.set(c.user_id, c.display_name));
  const fileUrl = task.completion_file_path
    ? (await supabase.storage.from("uploads").createSignedUrl(task.completion_file_path, 60 * 60)).data?.signedUrl
    : null;
  const dueDate = task.due_at
    ? new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(task.due_at))
    : "";
  const assignee = task.client_assignee_id
    ? `client:${task.client_assignee_id}`
    : task.client_id && isClientFacing(task) && !task.assignee_id
      ? "client:all"
      : task.assignee_id ? `team:${task.assignee_id}` : `team:${userId}`;
  const created = new Date(task.created_at).toLocaleString("en-US", { timeZone: agency.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      <Link href="/team" className="note">← All tasks</Link>
      <div>
        <p className="eyebrow">{SOURCE[task.source] ?? task.source} · {created}</p>
        <h1 style={{ fontSize: "2.4rem", marginTop: 6 }}>{task.title}</h1>
      </div>
      <p className="note">
        {task.created_by ? <>Created by <b>{names.get(task.created_by) ?? "a former teammate"}</b></> : "Created automatically"}
      </p>
      {!canEdit && <p className="readonly">View only. Creators can see tasks but can&apos;t change them.</p>}
      {task.client_assignee_id && (
        <p className="note">
          Assigned to {names.get(task.client_assignee_id) ?? "the client"}. They see this task in their portal
          {task.reminders_sent ? ` and have had ${task.reminders_sent} reminder${task.reminders_sent > 1 ? "s" : ""}` : ""}.
        </p>
      )}
      {(task.completion_comment || fileUrl) && (
        <div className="noteline">
          {task.completion_comment && <p><b>Client&apos;s note:</b> {task.completion_comment}</p>}
          {fileUrl && <FilePreview url={fileUrl} name={task.completion_file_path!.split("/").pop()!.replace(/^\d+-/, "")} label="Open the file they attached" />}
        </div>
      )}
      <div className="panel">
        <EditTaskForm
          task={{ id: task.id, title: task.title, status: task.status, note: task.note ?? "", client: task.client_id ?? "", assignee, due: dueDate }}
          clients={clients ?? []}
          people={people}
          readOnly={!canEdit}
        />
      </div>
      {canEdit && (
        <form action={deleteTask}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="back" value="/team" />
          <ConfirmButton label="Delete task" confirmLabel="Delete this task for good?" />
        </form>
      )}
    </section>
  );
}
