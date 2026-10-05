import { createClient } from "@/lib/supabase/server";
import type { LoginRow } from "./LoginForms";

/** A client's saved logins, without the passwords (only whether one is saved). */
export async function loadLogins(clientId: string): Promise<LoginRow[]> {
  const { data } = await (await createClient())
    .from("client_logins")
    .select("id, service, username, url, note, secret_enc")
    .eq("client_id", clientId)
    .order("service");
  return (data ?? []).map(({ secret_enc, ...l }) => ({ ...l, has_secret: !!secret_enc }));
}
