import "server-only";
import { createClient } from "./supabase/server";
import { getAuthUserId } from "./session";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Latest notifications for whoever is signed in. */
export async function loadNotifications(): Promise<{ userId: string | null; items: NotificationItem[] }> {
  const userId = await getAuthUserId();
  if (!userId) return { userId: null, items: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return { userId, items: (data ?? []) as NotificationItem[] };
}
