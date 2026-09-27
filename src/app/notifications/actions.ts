"use server";

import { createClient } from "@/lib/supabase/server";

/** Marks the signed-in person's notifications read (all of them, or just one). */
export async function markRead(id?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
}
