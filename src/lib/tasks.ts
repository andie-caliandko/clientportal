import type { Task } from "./types";

/**
 * Does the client see this task? Only when the team assigned it to one of
 * their contacts, or put a (non-automatic) task in Waiting on client for
 * everyone there. Automatic tasks and approval reminders are always the team's.
 * Matches the tasks_read rule in the database.
 */
export function isClientFacing(t: Pick<Task, "client_assignee_id" | "status" | "source" | "auto">) {
  return !!t.client_assignee_id || (t.status === "waiting" && !t.auto && t.source !== "rella");
}
