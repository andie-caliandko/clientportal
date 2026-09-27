import Link from "next/link";
import type { Task } from "@/lib/types";
import { markCalendarApproved, moveTask } from "./actions";

const MOVES: Record<string, { to: string; label: string }[]> = {
  todo: [{ to: "doing", label: "Start" }, { to: "done", label: "Done" }],
  doing: [{ to: "waiting", label: "Waiting" }, { to: "done", label: "Done" }],
  waiting: [{ to: "doing", label: "Back to in progress" }, { to: "done", label: "Done" }],
};

export function TaskCard({ task: t, clientName, showClientChip = true, personName, colorOf, timeZone, canEdit }: {
  task: Task;
  clientName?: string;
  /** The board shows which client a task is for; a client's own page doesn't need to. */
  showClientChip?: boolean;
  personName: (id: string) => string | undefined;
  /** Each teammate's badge color (0–7). */
  colorOf: (id: string) => number | undefined;
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
  // Team tasks wear the creator's name in their color; automatic ones stay the default color.
  const automated = t.auto || !t.created_by;
  const creator = t.created_by ? personName(t.created_by) ?? "Former teammate" : null;
  const badge = clientFacing
    ? { cls: "client", text: `${clientName ?? "Client"}${client ? ` · ${client.split(" ")[0]}` : ""}` }
    : automated
      ? { cls: "team", text: "Automated" }
      : { cls: `who-${colorOf(t.created_by!) ?? 0}`, text: creator! };

  return (
    <article className={`task ${clientFacing ? "client-task" : "team-task"} ${overdue ? "overdue" : ""}`}>
      <span className={`kind ${badge.cls}`}>{badge.text}</span>
      <Link className="task-link" href={`/team/tasks/${t.id}`}>{t.title}</Link>
      {t.note && <p className="note" style={{ fontWeight: 400 }}>{t.note}</p>}
      <div className="meta">
        {showClientChip && !clientFacing && clientName && <span className="chip">{clientName}</span>}
        {due && (overdue ? <span className="pill crit">Was due {due}</span> : <span>Due {due}</span>)}
        {!client && t.assignee_id && <span>· {personName(t.assignee_id) ?? "Unassigned"}</span>}
      </div>
      {(clientFacing || automated) && (
        <p className="task-by">{automated ? "Created automatically" : `Created by ${creator}`}</p>
      )}
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

/** A content calendar the client hasn't approved yet, shown with their other waiting items. */
export function ApprovalCard({ cal, clientName, timeZone, showClient = true, canEdit }: {
  cal: { id: string; client_id: string; month: string; rella_url: string; due_at: string };
  clientName: string;
  timeZone: string;
  showClient?: boolean;
  canEdit: boolean;
}) {
  const month = new Date(`${cal.month.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
  const late = new Date(cal.due_at).getTime() < Date.now();
  const due = new Date(cal.due_at).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <article className="task client-task">
      <span className="kind client">{clientName} · Approval</span>
      <a className="task-link" href={cal.rella_url} target="_blank" rel="noreferrer">Approve the {month} content calendar</a>
      <div className="meta">
        {late ? <span className="pill crit">Was due {due}</span> : <span>Due {due}</span>}
      </div>
      <p className="task-by">If they don&apos;t reply by then, it&apos;s approved automatically and flagged.</p>
      <div className="task-actions">
        {canEdit && (
          <form action={markCalendarApproved}>
            <input type="hidden" name="id" value={cal.id} />
            <button>Mark approved for them</button>
          </form>
        )}
        {showClient && <Link href={`/team/clients/${cal.client_id}`}>Open client</Link>}
      </div>
    </article>
  );
}
