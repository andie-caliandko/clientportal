import Link from "next/link";
import type { Task } from "@/lib/types";
import { moveTask } from "./actions";

const MOVES: Record<string, { to: string; label: string }[]> = {
  todo: [{ to: "doing", label: "Start" }, { to: "done", label: "Done" }],
  doing: [{ to: "waiting", label: "Waiting" }, { to: "done", label: "Done" }],
  waiting: [{ to: "doing", label: "Back to in progress" }, { to: "done", label: "Done" }],
};

export function TaskCard({ task: t, clientName, personName, timeZone, canEdit }: {
  task: Task;
  clientName?: string;
  personName: (id: string) => string | undefined;
  timeZone: string;
  canEdit: boolean;
}) {
  const overdue = !!t.due_at && new Date(t.due_at).getTime() < Date.now();
  const due = t.due_at
    ? new Date(t.due_at).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })
    : null;
  const client = t.client_assignee_id ? personName(t.client_assignee_id) : null;
  // Client-facing: assigned to a client contact, or the team is waiting on the client.
  const clientFacing = !!client || t.status === "waiting";
  // Client tasks are finished by the client; the team can still close or reopen them.
  const moves = client ? [{ to: "done", label: "Mark done for them" }] : MOVES[t.status] ?? [];

  return (
    <article className={`task ${clientFacing ? "client-task" : "team-task"} ${overdue ? "overdue" : ""}`}>
      <span className={`kind ${clientFacing ? "client" : "team"}`}>
        {client ? `Client task · ${client.split(" ")[0]} sees this` : clientFacing ? "Client task · waiting on client" : "Team task"}
      </span>
      <Link className="task-link" href={`/team/tasks/${t.id}`}>{t.title}</Link>
      {t.note && <p className="note" style={{ fontWeight: 400 }}>{t.note}</p>}
      <div className="meta">
        {clientName && <span className="chip">{clientName}</span>}
        {due && (overdue ? <span className="pill crit">Was due {due}</span> : <span>Due {due}</span>)}
        {!client && t.assignee_id && <span>· {personName(t.assignee_id) ?? "Unassigned"}</span>}
        {t.auto && <span>· auto</span>}
      </div>
      {canEdit && (
        <div className="task-actions">
          {moves.map((m) => (
            <form key={m.to} action={moveTask}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={m.to} />
              <button>{m.label}</button>
            </form>
          ))}
        </div>
      )}
    </article>
  );
}
