import "server-only";
import { createAdminClient } from "./supabase/server";

/** Remembers, per share link, the email someone gave to open a gallery. */
export const VIEWER_COOKIE = "gallery_viewer";

/** A share link's ending: the business name (an-unblurred-lady-oct-14) or an older random one. Checked before it goes into a query. */
export const SHARE_PATH = /^[A-Za-z0-9_-]{2,80}$/;

/** The shoot a share link points to, by its name ending or an older random one. */
export async function findSharedShoot<T>(token: string, cols: string): Promise<T | null> {
  if (!SHARE_PATH.test(token)) return null;
  const admin = createAdminClient();
  const byEither = await admin.from("content_shoots").select(cols).or(`gallery_share_slug.eq.${token},gallery_share_token.eq.${token}`).maybeSingle();
  if (!byEither.error) return byEither.data as T | null;
  // Before the name column exists (migration 0048), only the random links work.
  const { data } = await admin.from("content_shoots").select(cols).eq("gallery_share_token", token).maybeSingle();
  return data as T | null;
}

/** Add or update the viewer's row. Return visits within half an hour of the last count as the same visit. */
export async function recordView(shoot: { id: string; client_id: string }, email: string, fresh = false) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("gallery_viewers").select("id, visits, last_viewed_at").eq("shoot_id", shoot.id).eq("email", email).maybeSingle();
  const now = new Date();
  if (!row) {
    await admin.from("gallery_viewers").upsert({ shoot_id: shoot.id, client_id: shoot.client_id, email }, { onConflict: "shoot_id,email", ignoreDuplicates: true });
  } else if (fresh || now.getTime() - new Date(row.last_viewed_at).getTime() > 30 * 60 * 1000) {
    await admin.from("gallery_viewers").update({ visits: row.visits + 1, last_viewed_at: now.toISOString() }).eq("id", row.id);
  }
}
