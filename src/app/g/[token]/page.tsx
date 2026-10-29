import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { findSharedShoot, recordView, VIEWER_COOKIE } from "@/lib/galleryViewers";
import { sizeGalleryItems } from "@/lib/galleryPreviews";
import { EmailGate } from "./EmailGate";
import { GalleryView } from "@/app/portal/GalleryView";
import { Logo } from "@/lib/brand";
import type { Brand } from "@/lib/types";
import { galleryCount } from "@/lib/gallery";
import { galleryCovers, loadGallery } from "@/lib/gallery.server";
import { cleanPlan } from "@/lib/shootPlan";
import { shootDates } from "@/lib/shoots";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
// Private links: keep them out of search engines.
export const metadata: Metadata = { title: "Content shoot gallery", robots: { index: false, follow: false } };

/**
 * A shoot's gallery opened from its share link, no sign-in: for one-time shoots and
 * anyone who isn't in the portal. Visitors give their email first so the team can see who looked.
 * Viewing and downloading only (favorites live in the portal).
 */
export default async function SharedGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const shoot = await findSharedShoot<{ id: string; client_id: string; shoot_date: string; end_date: string | null; gallery_cover_id: string | null; clients: unknown; agencies: unknown }>(
    token, "id, client_id, shoot_date, end_date, gallery_cover_id, clients(name), agencies(name, brand)");
  const agency = shoot?.agencies as unknown as { name: string; brand: Brand } | null;
  const header = agency && <div className="share-brand"><Logo brand={agency.brand} name={agency.name} height={56} /></div>;
  if (!shoot) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>This gallery isn&apos;t available</h1>
          <p className="note">The link may have been turned off. Reach out to the team that sent it for a new one.</p>
        </div>
      </main>
    );
  }
  const email = (await cookies()).get(VIEWER_COOKIE)?.value;
  const client = shoot.clients as unknown as { name: string } | null;
  if (!email) {
    const { data: share } = await admin.from("shoot_plan_shares").select("content").eq("shoot_id", shoot.id).maybeSingle();
    return (
      <main className="auth">
        <div className="auth-card">
          {agency && <Logo brand={agency.brand} name={agency.name} height={72} />}
          <div>
            {client?.name && <p className="eyebrow">{client.name}</p>}
            <h1 style={{ marginTop: client?.name ? 8 : 0 }}>{cleanPlan(share?.content).title || "Your content shoot gallery"}</h1>
            <p className="note" style={{ marginTop: 8 }}>Enter your email to view and download the photos and videos.</p>
          </div>
          <EmailGate token={token} />
        </div>
      </main>
    );
  }
  after(async () => { try { await recordView(shoot, email); } catch (err) { console.error("Gallery view", err); } });
  after(async () => { try { await sizeGalleryItems({ shootId: shoot.id, limit: 60 }); } catch (err) { console.error("Gallery previews", err); } });
  const [items, covers, previews, { data: share }] = await Promise.all([
    loadGallery(shoot.id),
    galleryCovers([shoot], { full: true }),
    galleryCovers([shoot]),
    admin.from("shoot_plan_shares").select("content").eq("shoot_id", shoot.id).maybeSingle(),
  ]);
  const title = cleanPlan(share?.content).title || "Content Shoot";
  const date = shoot.end_date && shoot.end_date > shoot.shoot_date ? shootDates(shoot.shoot_date, shoot.end_date)
    : new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (
    <main className="share-page">
      {header}
      <GalleryView
        title={title}
        sub={[client?.name, date, galleryCount(items)].filter(Boolean).join(" · ")}
        cover={covers.get(shoot.id) ?? null}
        coverPreview={previews.get(shoot.id) ?? null}
        items={items}
        canFavorite={false}
        zipName={`${client?.name ?? "Gallery"} ${shoot.shoot_date}`}
      />
      {agency && <p className="note share-foot">Shared by {agency.brand.shortName ?? agency.name}</p>}
    </main>
  );
}
