import "server-only";
import { createAdminClient } from "./supabase/server";

/** Grid previews: crisp on retina screens even when the grid shows two wide columns. */
const THUMB = 1600;
/** The full-screen view: crisp on a big monitor at a fraction of a camera original's size. */
const LARGE = 2560;
const STALE_MS = 10 * 60 * 1000;

/**
 * Makes each gallery photo's grid preview and large version on the server from the original
 * (turned upright, high-quality resize). Photos are claimed first so two runs never do the same one.
 * Videos and iPhone HEIC photos keep the preview made in the browser when they were uploaded.
 */
export async function sizeGalleryItems(filter: { shootId?: string; itemIds?: string[]; limit?: number } = {}) {
  const admin = createAdminClient();
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const open = `sizing_claimed_at.is.null,sizing_claimed_at.lt.${stale}`;
  let q = admin.from("shoot_gallery_items").select("id, file_path, thumb_path, large_path, mime")
    .is("sized_at", null).like("mime", "image/%").not("mime", "ilike", "%hei%").or(open).order("created_at").limit(filter.limit ?? 30);
  if (filter.shootId) q = q.eq("shoot_id", filter.shootId);
  if (filter.itemIds) q = q.in("id", filter.itemIds);
  const { data: rows } = await q;
  if (!rows?.length) return 0;
  // Loaded only when there's work, so pages that import this never depend on the image library.
  const { default: sharp } = await import("sharp");
  const bucket = admin.storage.from("galleries");
  let done = 0;
  const one = async (row: NonNullable<typeof rows>[number]) => {
    const { data: claimed } = await admin.from("shoot_gallery_items").update({ sizing_claimed_at: new Date().toISOString() })
      .eq("id", row.id).is("sized_at", null).or(open).select("id");
    if (!claimed?.length) return;
    try {
      const { data: file, error } = await bucket.download(row.file_path);
      if (error || !file) throw error ?? new Error("no file");
      const upright = sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" }).rotate();
      // A light sharpen after shrinking, as photo editors do when exporting for screens; without it
      // a downsized photo looks slightly soft.
      const fit = (size: number, quality: number, sigma: number) => upright.clone()
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
        .sharpen({ sigma })
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
      const [thumb, large] = await Promise.all([fit(THUMB, 84, 0.6), fit(LARGE, 86, 0.5)]);
      const base = row.file_path.replace(/\.[^./]*$/, "");
      const thumbPath = `${base}-grid.jpg`, largePath = `${base}-large.jpg`;
      for (const [path, out] of [[thumbPath, thumb], [largePath, large]] as const) {
        const up = await bucket.upload(path, out.data, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw up.error;
      }
      // Width and height of the upright photo, so the grid holds the right shape while loading.
      const w = large.info.width, h = large.info.height;
      await admin.from("shoot_gallery_items").update({ thumb_path: thumbPath, large_path: largePath, width: w, height: h, sized_at: new Date().toISOString() }).eq("id", row.id);
      const old = [row.thumb_path, row.large_path].filter((p): p is string => !!p && p !== thumbPath && p !== largePath);
      if (old.length) await bucket.remove(old);
      done++;
    } catch (err) {
      console.error("Gallery preview", row.id, err);
      // Given up on: it keeps its browser-made preview and the original.
      await admin.from("shoot_gallery_items").update({ sized_at: new Date().toISOString() }).eq("id", row.id);
    }
  };
  // Three at a time keeps memory in check (a camera original is ~100MB once decoded).
  const queue = [...(rows ?? [])];
  await Promise.all(Array.from({ length: 3 }, async () => { for (let r = queue.shift(); r; r = queue.shift()) await one(r); }));
  return done;
}

/** Whether a shoot still has photos waiting for their sharp previews. */
export async function gallerySizingPending(shootId: string) {
  const { count } = await createAdminClient().from("shoot_gallery_items").select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId).is("sized_at", null).like("mime", "image/%").not("mime", "ilike", "%hei%");
  return count ?? 0;
}
