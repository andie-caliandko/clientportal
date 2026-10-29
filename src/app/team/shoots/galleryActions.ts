"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncGalleryToDrive, trashDriveFile } from "@/lib/drive";
import { sizeGalleryItems } from "@/lib/galleryPreviews";
import { notifyClient } from "@/lib/notifications";
import { emailClient, sendEmail } from "@/lib/notify";
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
  // Its sharp grid preview and large version, made from the original.
  after(async () => { try { await sizeGalleryItems({ itemIds: [made.id] }); } catch (err) { console.error("Gallery previews", err); } });
  after(async () => { try { await syncGalleryToDrive({ itemIds: [made.id] }); } catch (err) { console.error("Gallery to Drive", err); } });
  return { id: made.id };
}

/** Take a photo or video out of the gallery (its Drive copy goes to the Drive trash). */
export async function removeGalleryItem(id: string): Promise<Result> {
  const v = await requireTeam();
  const supabase = await createClient();
  const { data: item } = await supabase.from("shoot_gallery_items").select("*").eq("id", id).maybeSingle();
  if (!item) return { error: "That file wasn't found." };
  await supabase.storage.from("galleries").remove([item.file_path, item.thumb_path, item.large_path].filter((p): p is string => !!p));
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

/**
 * The gallery's share link, ending in the client's business name (/g/an-unblurred-lady).
 * A second shared gallery for the same client adds the shoot date (an-unblurred-lady-oct-14).
 * Made once, then reused; a gallery shared before keeps its old address working too.
 */
export async function shareGalleryLink(shootId: string): Promise<Result & { token?: string }> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  const admin = createAdminClient();
  const { data: cur } = await admin.from("content_shoots").select("shoot_date, gallery_share_token, gallery_share_slug, clients(name, slug)").eq("id", shootId).single();
  if (!cur) return { error: "That shoot wasn't found." };
  if (cur.gallery_share_slug) return { token: cur.gallery_share_slug };
  const client = cur.clients as unknown as { name: string; slug: string } | null;
  const name = (client?.name || client?.slug || "gallery").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "gallery";
  const day = new Date(`${cur.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).toLowerCase().replace(/\W+/g, "-");
  const tries = [name, `${name}-${day}`, ...Array.from({ length: 8 }, (_, n) => `${name}-${day}-${n + 2}`)];
  for (const slug of tries) {
    // The unique column settles any tie between two galleries shared at the same moment.
    const { error } = await admin.from("content_shoots").update({ gallery_share_slug: slug }).eq("id", shootId).is("gallery_share_slug", null);
    if (!error) {
      refresh(shootId);
      return { ok: "Link ready.", token: slug };
    }
    if (error.code !== "23505") break;
  }
  return { error: "The link couldn't be made. Try again." };
}

/** Turn the share link off; anyone who has it sees "not available" until a link is made again. */
export async function stopGalleryLink(shootId: string): Promise<Result> {
  await requireTeam();
  if (!(await shootFor(shootId))) return { error: "That shoot wasn't found." };
  await createAdminClient().from("content_shoots").update({ gallery_share_token: null, gallery_share_slug: null }).eq("id", shootId);
  refresh(shootId);
  return { ok: "Link turned off." };
}

/** Who the gallery email goes to by default: the client's saved contact, else everyone on their portal. */
export async function galleryEmailRecipients(shootId: string): Promise<string[]> {
  await requireTeam();
  const shoot = await shootFor(shootId);
  if (!shoot) return [];
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("contact_email").eq("id", shoot.client_id).maybeSingle();
  if (client?.contact_email) return [client.contact_email];
  const { data: users } = await admin.from("client_users").select("email").eq("client_id", shoot.client_id);
  return (users ?? []).map((u) => u.email);
}

/**
 * Emails the gallery's share link (made now if there isn't one), for clients who aren't in the portal.
 * Each address gets its own email (never CC'd together). Replies go to whoever on the team sent it.
 */
export async function emailGalleryLink(shootId: string, to: string, note: string): Promise<Result> {
  const v = await requireTeam();
  const shoot = await shootFor(shootId);
  if (!shoot) return { error: "That shoot wasn't found." };
  const emails = [...new Set(to.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return { error: "Add an email address." };
  if (emails.length > 10) return { error: "Send to 10 people or fewer at a time." };
  const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
  if (bad) return { error: `"${bad}" isn't a valid email address.` };
  const link = await shareGalleryLink(shootId);
  if (!link.token) return { error: link.error ?? "The link couldn't be made." };
  const when = new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/g/${link.token}`;
  const body = [
    note.trim().slice(0, 2000) || `Your photos and videos from your ${when} content shoot are ready!`,
    "Open the gallery and enter your email to view and download them.",
    url,
  ].join("\n\n");
  // One email per person, so nobody sees who else got it.
  const results = await Promise.all(emails.map((e) => sendEmail([e], "Your content shoot gallery is ready", body, { button: "View your gallery", replyTo: v.member.email })));
  if (results.every((r) => r === undefined)) return { error: "Email isn't set up on this site, so nothing was sent. Copy the link instead." };
  const sent = emails.filter((_, i) => results[i] === true), failed = emails.filter((_, i) => results[i] !== true);
  if (!sent.length) return { error: "The email didn't send. Try again in a minute." };
  if (failed.length) return { error: `Sent to ${sent.join(", ")}, but not to ${failed.join(", ")}. Try those again.` };
  return { ok: `Sent separately to ${sent.join(", ")}.` };
}
