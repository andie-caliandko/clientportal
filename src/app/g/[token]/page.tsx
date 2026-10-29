import type { Metadata } from "next";
import { GalleryView } from "@/app/portal/GalleryView";
import { Logo } from "@/lib/brand";
import type { Brand } from "@/lib/types";
import { galleryCount } from "@/lib/gallery";
import { galleryCovers, loadGallery } from "@/lib/gallery.server";
import { cleanPlan } from "@/lib/shootPlan";
import { shootDates } from "@/lib/shoots";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Private links: keep them out of search engines.
export const metadata: Metadata = { title: "Content shoot gallery", robots: { index: false, follow: false } };

/**
 * A shoot's gallery opened from its share link, no sign-in: for one-time shoots and
 * anyone who isn't in the portal. Viewing and downloading only (favorites live in the portal).
 */
export default async function SharedGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: shoot } = /^[\w-]{16,64}$/.test(token)
    ? await admin.from("content_shoots").select("id, shoot_date, end_date, gallery_cover_id, clients(name), agencies(name, brand)")
      .eq("gallery_share_token", token).maybeSingle()
    : { data: null };
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
  const [items, covers, { data: share }] = await Promise.all([
    loadGallery(shoot.id),
    galleryCovers([shoot], { full: true }),
    admin.from("shoot_plan_shares").select("content").eq("shoot_id", shoot.id).maybeSingle(),
  ]);
  const client = shoot.clients as unknown as { name: string } | null;
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
        items={items}
        canFavorite={false}
        zipName={`${client?.name ?? "Gallery"} ${shoot.shoot_date}`}
      />
      {agency && <p className="note share-foot">Shared by {agency.brand.shortName ?? agency.name}</p>}
    </main>
  );
}
