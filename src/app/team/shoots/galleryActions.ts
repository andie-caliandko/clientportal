"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncGalleryToDrive, trashDriveFile } from "@/lib/drive";
import { notifyClient } from "@/lib/notifications";
import { emailClient } from "@/lib/notify";
import { requireTeam } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

async function shootFor(shootId: string) {
  // RLS: only people on the client's team (or admins) see the shoot.
  const { data } = await (await createClient()).from("content_shoots").select("id, client_id, agency_id, shoot_date, end_date, gallery_sent_at").eq("id", shootId).maybeSingle();
  return data;
}

function refresh(shootId: string) {
  revalidatePath(`/team/shoots/${shootId}`);
  revalidatePath("/portal", "layout");
}

/** Record a photo or video the browser just uploaded to the galleries bucket. */
export async function addGalleryItem(shootId: string, item: {
  path: string; thumbPath: string | null; name: string; mime: string; size: number; width: number | null; height: number | null;
}): Promise<Result & { id?: string }> {
  const v = await requireTeam();
  const shoot = await shootFor(shootId);
  const prefix = shoot ? `${v.agency.id}/${shoot.client_id}/${shootId}/` : null;
  if (!shoot || !prefix || !item.path.startsWith(prefix) || (item.thumbPath && !item.thumbPath.startsWith(prefix))) return { error: "That shoot wasn't found." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("shoot_gallery_items").select("position").eq("shoot_id", shootId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data: made, error } = await supabase.from("shoot_gallery_items").insert({
    shoot_id: shootId, client_id: shoot.client_id, file_path: item.path, thumb_path: item.thumbPath, file_name: item.name.slice(0, 200),
    mime: item.mime || null, size: item.size, width: item.width, height: item.height, position: (last?.position ?? 0) + 1, created_by: v.userId,
  }).select("id").single();
  if (error || !made) {
    console.error("addGalleryItem", error);
    return { error: `${item.name} uploaded but couldn't be added to the gallery.` };
  }
  // A copy in the shoot's Drive folder (Gallery).
  after(async () => { try { await syncGalleryToDrive({ itemIds: [made.id] }); } catch (err) { console.error("Gallery to Drive", err); } });
  return { id: made.id };
}

/** Take a photo or video out of the gallery (its Drive copy goes to the Drive trash). */
export async function removeGalleryItem(id: string): Promise<Result> {
  const v = await requireTeam();
  const supabase = await createClient();
  const { data: item } = await supabase.from("shoot_gallery_items").select("id, shoot_id, file_path, thumb_path, drive_file_id").eq("id", id).maybeSingle();
  if (!item) return { error: "That file wasn't found." };
  await supabase.storage.from("galleries").remove([item.file_path, item.thumb_path].filter((p): p is string => !!p));
  await supabase.from("shoot_gallery_items").delete().eq("id", id);
  await supabase.from("content_shoots").update({ gallery_cover_id: null }).eq("id", item.shoot_id).eq("gallery_cover_id", id);
  if (item.drive_file_id) after(async () => { try { await trashDriveFile(v.agency.id, item.drive_file_id!); } catch { /* already gone */ } });
  refresh(item.shoot_id);
  return { ok: "Removed." };
}

/** The photo shown on the gallery's card and at the top of the gallery. */
export async function setGalleryCover(shootId: string, itemId: string): Promise<Result> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  await (await createClient()).from("content_shoots").update({ gallery_cover_id: itemId }).eq("id", shootId);
  refresh(shootId);
  return { ok: "Cover set." };
}

/** Put the gallery in the client's portal and let them know (again, if it's already there). */
export async function sendGallery(shootId: string): Promise<Result> {
  await requireTeam();
  const shoot = await shootFor(shootId);
  if (!shoot) return { error: "That shoot wasn't found." };
  const { count } = await (await createClient()).from("shoot_gallery_items").select("id", { count: "exact", head: true }).eq("shoot_id", shootId);
  if (!count) return { error: "Add photos or videos before sending." };
  const again = !!shoot.gallery_sent_at;
  await createAdminClient().from("content_shoots").update({ gallery_sent_at: new Date().toISOString() }).eq("id", shootId);
  const when = new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
  const link = `/portal/shoots?gallery=${shootId}`;
  await notifyClient(shoot.client_id, { kind: "task", title: again ? "Your shoot gallery was updated" : "Your shoot gallery is ready", body: `Content shoot · ${when}`, link });
  await emailClient(shoot.client_id, again ? "Your content shoot gallery was updated" : "Your content shoot gallery is ready",
    `The photos and videos from your ${when} content shoot are ready to view and download in your portal.\n\n${process.env.NEXT_PUBLIC_SITE_URL}${link}`);
  refresh(shootId);
  return { ok: again ? "Sent again." : "Gallery sent." };
}

/** Take the gallery out of the client's portal (nothing is deleted). */
export async function hideGallery(shootId: string): Promise<Result> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  await createAdminClient().from("content_shoots").update({ gallery_sent_at: null }).eq("id", shootId);
  refresh(shootId);
  return { ok: "Hidden from the client." };
}

/** A private link anyone can open to see the gallery, no sign-in (made once, then reused). */
export async function shareGalleryLink(shootId: string): Promise<Result & { token?: string }> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  const admin = createAdminClient();
  const { data: cur } = await admin.from("content_shoots").select("gallery_share_token").eq("id", shootId).single();
  if (cur?.gallery_share_token) return { token: cur.gallery_share_token };
  const token = randomBytes(18).toString("base64url");
  const { error } = await admin.from("content_shoots").update({ gallery_share_token: token }).eq("id", shootId);
  if (error) return { error: "The link couldn't be made. Try again." };
  refresh(shootId);
  return { ok: "Link ready.", token };
}

/** Turn the share link off; anyone who has it sees "not available". A new link is a new address. */
export async function stopGalleryLink(shootId: string): Promise<Result> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  await createAdminClient().from("content_shoots").update({ gallery_share_token: null }).eq("id", shootId);
  refresh(shootId);
  return { ok: "Link turned off." };
}
