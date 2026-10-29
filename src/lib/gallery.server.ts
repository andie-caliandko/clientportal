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
  const pick = (cols: string) => admin.from("shoot_gallery_items").select(cols).eq("shoot_id", shootId).order("position").order("created_at")
    .returns<{ id: string; file_path: string; thumb_path: string | null; large_path?: string | null; file_name: string; mime: string | null; width: number | null; height: number | null; favorite: boolean }[]>();
  const base = "id, file_path, thumb_path, file_name, mime, width, height, favorite";
  const first = await pick(`${base}, large_path`);
  // Until the large-version column exists (migration 0047), carry on without it.
  const rows = first.error ? (await pick(base)).data : first.data;
  if (!rows?.length) return [];
  const bucket = admin.storage.from("galleries");
  const paths = rows.flatMap((r) => [r.file_path, r.thumb_path, r.large_path].filter((p): p is string => !!p));
  const { data: signed } = await bucket.createSignedUrls(paths, HOURS);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const url = (p: string | null) => (p ? byPath.get(p) ?? null : null);
  // Download links carry the file's name, so it saves as "IMG_0412.jpg" rather than a storage key
  // (the same signed link plus Storage's download parameter: no extra request per photo).
  const download = (r: { file_path: string; file_name: string }) => {
    const u = url(r.file_path);
    return u ? `${u}${u.includes("?") ? "&" : "?"}download=${encodeURIComponent(r.file_name)}` : null;
  };
  return rows.map((r) => ({
    id: r.id, name: r.file_name, mime: r.mime, width: r.width, height: r.height, favorite: r.favorite,
    thumb: url(r.thumb_path) ?? url(r.file_path), large: url(r.large_path ?? null), url: url(r.file_path), download: download(r),
  }));
}

/**
 * The cover photo's link: the small preview for gallery cards, or (`full`) the large version or original
 * for the big banner at the top of a gallery, where the preview would look blurry.
 */
export async function galleryCovers(shoots: { id: string; gallery_cover_id: string | null }[], { full = false } = {}) {
  const admin = createAdminClient();
  const out = new Map<string, string | null>();
  for (const s of shoots) {
    let q = admin.from("shoot_gallery_items").select("*").eq("shoot_id", s.id);
    q = s.gallery_cover_id ? q.eq("id", s.gallery_cover_id) : q.not("thumb_path", "is", null).order("position").order("created_at");
    const { data } = await q.limit(1).maybeSingle();
    // Browsers can't show HEIC (iPhone) originals, so those keep the preview.
    const original = data?.mime?.startsWith("image/") && !/hei[cf]/i.test(data.mime) ? data.file_path : null;
    // The large version (made on the server) looks just as sharp as the original and loads far faster.
    const path = full ? data?.large_path ?? original ?? data?.thumb_path : data?.thumb_path ?? original;
    out.set(s.id, path ? (await admin.storage.from("galleries").createSignedUrl(path, HOURS)).data?.signedUrl ?? null : null);
  }
  return out;
}
