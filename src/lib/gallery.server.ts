import "server-only";
import type { GalleryItem } from "./gallery";
import { createAdminClient } from "./supabase/server";

const HOURS = 60 * 60 * 6;

/**
 * A shoot's gallery, in order, with signed links. Callers decide who may see it
 * (the team through RLS-checked pages; clients only once it's been sent).
 */
export async function loadGallery(shootId: string): Promise<GalleryItem[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("shoot_gallery_items")
    .select("id, file_path, thumb_path, file_name, mime, width, height, favorite").eq("shoot_id", shootId).order("position").order("created_at");
  if (!rows?.length) return [];
  const bucket = admin.storage.from("galleries");
  const paths = rows.flatMap((r) => [r.file_path, r.thumb_path].filter((p): p is string => !!p));
  const { data: signed } = await bucket.createSignedUrls(paths, HOURS);
  const url = (p: string | null) => (p ? signed?.find((s) => s.path === p)?.signedUrl ?? null : null);
  // Download links carry the file's name, so it saves as "IMG_0412.jpg" rather than a storage key.
  const downloads = await Promise.all(rows.map((r) => bucket.createSignedUrl(r.file_path, HOURS, { download: r.file_name }).then((x) => x.data?.signedUrl ?? null)));
  return rows.map((r, i) => ({
    id: r.id, name: r.file_name, mime: r.mime, width: r.width, height: r.height, favorite: r.favorite,
    thumb: url(r.thumb_path) ?? url(r.file_path), url: url(r.file_path), download: downloads[i],
  }));
}

/** The cover photo's preview link, for gallery cards. */
export async function galleryCovers(shoots: { id: string; gallery_cover_id: string | null }[]) {
  const admin = createAdminClient();
  const out = new Map<string, string | null>();
  for (const s of shoots) {
    let q = admin.from("shoot_gallery_items").select("file_path, thumb_path, mime").eq("shoot_id", s.id);
    q = s.gallery_cover_id ? q.eq("id", s.gallery_cover_id) : q.not("thumb_path", "is", null).order("position").order("created_at");
    const { data } = await q.limit(1).maybeSingle();
    const path = data?.thumb_path ?? (data?.mime?.startsWith("image/") ? data.file_path : null);
    out.set(s.id, path ? (await admin.storage.from("galleries").createSignedUrl(path, HOURS)).data?.signedUrl ?? null : null);
  }
  return out;
}
