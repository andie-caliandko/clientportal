import "server-only";
import { createAdminClient } from "./supabase/server";

// In-app notifications (the bell and pop-ups). Everyone only hears about their
// own accounts: admins get every client, other teammates the clients they're
// on, and client contacts their own portal.

type Note = { kind: "message" | "task" | "approval"; title: string; body?: string | null; link: string };

async function insert(agencyId: string, clientId: string | null, userIds: string[], note: Note) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const { error } = await createAdminClient()
    .from("notifications")
    .insert(ids.map((user_id) => ({ agency_id: agencyId, client_id: clientId, user_id, ...note, body: note.body ?? null })));
  if (error) console.error("Notification failed", error.message);
}

async function clientAgency(clientId: string) {
  const { data } = await createAdminClient().from("clients").select("agency_id").eq("id", clientId).single();
  return data?.agency_id as string | undefined;
}

/** Admins plus everyone on the client's team, minus whoever did the thing. */
export async function notifyTeam(clientId: string, note: Note, exceptUserId?: string) {
  const admin = createAdminClient();
  const agencyId = await clientAgency(clientId);
  if (!agencyId) return;
  const [{ data: admins }, { data: onTeam }] = await Promise.all([
    admin.from("agency_members").select("user_id").eq("agency_id", agencyId).eq("role", "admin"),
    admin.from("client_team").select("user_id").eq("client_id", clientId),
  ]);
  const ids = [...(admins ?? []), ...(onTeam ?? [])].map((r) => r.user_id).filter((id) => id !== exceptUserId);
  await insert(agencyId, clientId, ids, note);
}

/** Everyone on a client's portal, or just the given contacts. */
export async function notifyClient(clientId: string, note: Note, onlyUserIds?: string[]) {
  const agencyId = await clientAgency(clientId);
  if (!agencyId) return;
  let ids = onlyUserIds;
  if (!ids) {
    const { data } = await createAdminClient().from("client_users").select("user_id").eq("client_id", clientId);
    ids = (data ?? []).map((r) => r.user_id);
  }
  await insert(agencyId, clientId, ids, note);
}

/** One teammate (for example, the person a task was assigned to). */
export async function notifyUser(agencyId: string, clientId: string | null, userId: string | null, note: Note, exceptUserId?: string) {
  if (!userId || userId === exceptUserId) return;
  await insert(agencyId, clientId, [userId], note);
}
