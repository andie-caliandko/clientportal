import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskPeople } from "@/app/team/TeamForms";

/** Everyone a task can be assigned to, grouped the way the New task form needs. */
export async function loadTaskPeople(supabase: SupabaseClient, agencyId: string, me: string): Promise<TaskPeople> {
  const [{ data: members }, { data: onTeam }, { data: contacts }] = await Promise.all([
    supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agencyId).order("display_name"),
    supabase.from("client_team").select("client_id, user_id"),
    supabase.from("client_users").select("client_id, user_id, display_name").order("created_at"),
  ]);
  const onClient: TaskPeople["onClient"] = {};
  (onTeam ?? []).forEach((t) => (onClient[t.client_id] ??= []).push(t.user_id));
  const byClient: TaskPeople["contacts"] = {};
  (contacts ?? []).forEach((c) => (byClient[c.client_id] ??= []).push({ user_id: c.user_id, display_name: c.display_name }));
  return {
    me,
    team: (members ?? []).filter((m) => m.role !== "creator"),
    onClient,
    contacts: byClient,
  };
}
