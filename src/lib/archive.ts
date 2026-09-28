import "server-only";
import { createAdminClient } from "./supabase/server";

/**
 * Archived clients whose 30 days are up: remove their people's portal logins.
 * The client's work, files and history stay for the team. A person who's also
 * on another active portal (or on the team) keeps their account.
 */
export async function removeExpiredClientLogins(now = new Date()) {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("id")
    .not("archived_at", "is", null)
    .not("access_ends_at", "is", null)
    .lt("access_ends_at", now.toISOString())
    .is("logins_removed_at", null);
  let removed = 0;
  for (const c of clients ?? []) {
    const { data: people } = await admin.from("client_users").select("user_id").eq("client_id", c.id);
    await admin.from("client_users").delete().eq("client_id", c.id);
    for (const p of people ?? []) {
      const [{ count: otherPortals }, { count: onTeam }] = await Promise.all([
        admin.from("client_users").select("user_id", { count: "exact", head: true }).eq("user_id", p.user_id),
        admin.from("agency_members").select("user_id", { count: "exact", head: true }).eq("user_id", p.user_id),
      ]);
      if (!otherPortals && !onTeam) await admin.auth.admin.deleteUser(p.user_id);
      removed++;
    }
    await admin.from("clients").update({ logins_removed_at: now.toISOString() }).eq("id", c.id);
  }
  return removed;
}
