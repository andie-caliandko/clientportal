import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { cleanPlan, samePlan } from "@/lib/shootPlan";
import { shootDates, timeLabel } from "@/lib/shoots";
import { createClient } from "@/lib/supabase/server";
import { PlanEditor } from "./PlanEditor";
import { GalleryManager } from "./GalleryManager";
import { ShootTabs } from "./ShootTabs";
import { loadGallery } from "@/lib/gallery.server";
import { gallerySizingPending, sizeGalleryItems } from "@/lib/galleryPreviews";
import { after } from "next/server";

// Long enough to make sharp previews for a whole shoot in the background.
export const maxDuration = 300;

/**
 * One shoot, in two tabs: Plan (private to the team until it's sent to the client) and Gallery
 * (photos and videos to upload and send).
 */
export default async function ShootPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { agency } = await requireTeam();
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: shoot } = await supabase.from("content_shoots")
    .select("id, client_id, shoot_date, end_date, start_time, location, details, status, crew, photographer, drive_folder_id, gallery_sent_at, gallery_cover_id, gallery_share_token, clients(name)").eq("id", id).maybeSingle();
  if (!shoot) notFound();
  const [{ data: draft }, { data: shared }, { data: waiverRows }] = await Promise.all([
    supabase.from("shoot_plans").select("content, updated_at").eq("shoot_id", id).maybeSingle(),
    supabase.from("shoot_plan_shares").select("content, shared_at").eq("shoot_id", id).maybeSingle(),
    supabase.from("shoot_waivers").select("id, model_id, file_name, file_path").eq("shoot_id", id).order("created_at"),
  ]);
  const crewIds = (shoot.crew ?? []) as string[];
  const { data: crew } = crewIds.length
    ? await supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id).in("user_id", crewIds)
    : { data: [] as { user_id: string; display_name: string }[] };
  const crewNames = crewIds.map((cid) => (crew ?? []).find((c) => c.user_id === cid)?.display_name).filter(Boolean).join(", ");
  const [gallery, { data: viewerRows }, sizing] = await Promise.all([
    loadGallery(shoot.id),
    supabase.from("gallery_viewers").select("email, first_viewed_at, last_viewed_at, visits").eq("shoot_id", id).order("last_viewed_at", { ascending: false }),
    gallerySizingPending(id).catch(() => 0),
  ]);
  // Older galleries (and any upload whose previews didn't finish) get theirs made now.
  if (sizing) after(async () => { try { await sizeGalleryItems({ shootId: id, limit: 400 }); } catch (err) { console.error("Gallery previews", err); } });
  const plan = cleanPlan((draft ?? shared)?.content);
  const signed = waiverRows?.length
    ? (await supabase.storage.from("waivers").createSignedUrls(waiverRows.map((w) => w.file_path), 60 * 60)).data ?? []
    : [];
  const waivers = (waiverRows ?? []).map((w) => ({ id: w.id, model_id: w.model_id, file_name: w.file_name, url: signed.find((x) => x.path === w.file_path)?.signedUrl ?? null }));
  const client = shoot.clients as unknown as { name: string } | null;
  const when = shoot.end_date && shoot.end_date > shoot.shoot_date ? shootDates(shoot.shoot_date, shoot.end_date)
    : new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const sentAt = shared?.shared_at
    ? new Date(shared.shared_at).toLocaleDateString("en-US", { timeZone: agency.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <Link href="/team/shoots" className="note">← Content shoots</Link>
          <p className="eyebrow" style={{ marginTop: 10 }}><Link href={`/team/clients/${shoot.client_id}`}>{client?.name}</Link></p>
          <h1 style={{ marginTop: 6 }}>{plan.title || "Content shoot"}</h1>
          <p className="note">{[when, timeLabel(shoot.start_time), shoot.location].filter(Boolean).join(" · ")}{shoot.status === "cancelled" ? " · Cancelled" : ""}</p>
          {(crewNames || shoot.photographer) && (
            <p className="note">{[crewNames && `Team: ${crewNames}`, shoot.photographer && `Photographer: ${shoot.photographer}`].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {shoot.drive_folder_id && (
          <a className="btn sm line" href={`https://drive.google.com/drive/folders/${shoot.drive_folder_id}`} target="_blank" rel="noreferrer">Open Drive folder</a>
        )}
      </div>
      <ShootTabs
        initial={tab === "gallery" ? "gallery" : "plan"}
        galleryCount={gallery.length}
        plan={(
          <PlanEditor
            shootId={shoot.id}
            initial={plan}
            clientId={shoot.client_id}
            agencyId={agency.id}
            sent={shared ? { at: sentAt! } : null}
            changedSinceSent={!!shared && !samePlan(plan, cleanPlan(shared.content))}
            waivers={waivers}
          />
        )}
        gallery={(
          <GalleryManager
            shootId={shoot.id}
            clientId={shoot.client_id}
            agencyId={agency.id}
            items={gallery}
            coverId={shoot.gallery_cover_id}
            sentAt={shoot.gallery_sent_at ? new Date(shoot.gallery_sent_at).toLocaleDateString("en-US", { timeZone: agency.timezone, month: "short", day: "numeric" }) : null}
            previewHref={`/preview/${shoot.client_id}/shoots?gallery=${shoot.id}`}
            shareToken={shoot.gallery_share_token}
            viewers={(viewerRows ?? []).map((r) => ({ email: r.email, first: r.first_viewed_at, last: r.last_viewed_at, visits: r.visits }))}
            timeZone={agency.timezone}
            sizing={sizing}
          />
        )}
      />
    </section>
  );
}
