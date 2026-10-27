import { requireTeam } from "@/lib/session";
import { loadShoots } from "@/lib/shootsData";
import { createClient } from "@/lib/supabase/server";
import { ShootEditor } from "./ShootForms";
import { ShootList } from "./ShootList";
import { ShootFilter } from "./ShootFilter";
import { CeoTabs } from "../ceo/CeoTabs";
import { addDays } from "@/lib/shoots";

/** Shoots within this many days are "Upcoming" (planning starts 45 days out); later ones are "Looking ahead". */
const UPCOMING_DAYS = 45;

/** Every client's upcoming content shoots, by month, and where to schedule new ones. */
export default async function ShootsPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { agency, member } = await requireTeam();
  const isAdmin = member.role === "admin";
  const { who: whoParam } = await searchParams;
  const canEdit = member.role !== "creator";
  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const supabase = await createClient();
  // Everyone sees only the accounts they're on (admins see all, and can narrow to one account manager).
  const [allShoots, { data: clients }, { data: members }] = await Promise.all([
    loadShoots(supabase, today),
    supabase.from("clients").select("id, name, account_manager_id").is("archived_at", null).order("name"),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id).order("display_name"),
  ]);
  const managers = (members ?? []).filter((m) => (clients ?? []).some((c) => c.account_manager_id === m.user_id));
  const who = isAdmin && whoParam && managers.some((m) => m.user_id === whoParam) ? whoParam : "all";
  const shoots = who === "all" ? allShoots : allShoots.filter((s) => s.managerId === who);
  const cutoff = addDays(today, UPCOMING_DAYS);
  const soon = shoots.filter((s) => s.shoot_date <= cutoff);
  const later = shoots.filter((s) => s.shoot_date > cutoff);
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  // Shoots grouped under month headings.
  const byMonth = (list: typeof shoots, empty: string) => {
    const months = [...new Set(list.map((s) => s.shoot_date.slice(0, 7)))];
    if (!list.length) return <p className="note">{empty}{canEdit && !shoots.length ? " Use Schedule a shoot to add one." : ""}</p>;
    return months.map((m) => (
      <div className="shoot-month" key={m}>
        <h2>{monthLabel(m)}</h2>
        <ShootList shoots={list.filter((s) => s.shoot_date.startsWith(m))} canEdit={canEdit} showClient timeZone={tz} team={members ?? []} />
      </div>
    ));
  };
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{shoots.length} scheduled{who !== "all" ? ` · ${managers.find((m) => m.user_id === who)?.display_name}'s accounts` : isAdmin ? "" : " · your accounts"}</p>
          <h1 style={{ marginTop: 6 }}>Content shoots</h1>
        </div>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          {isAdmin && managers.length > 0 && <ShootFilter who={who} managers={managers} />}
          {canEdit && <ShootEditor clients={clients ?? []} team={members ?? []} label="Schedule a shoot" />}
        </div>
      </div>
      <p className="note">Upcoming is the next {UPCOMING_DAYS} days; Looking ahead is everything after. Clients see their upcoming shoots in their portal. Each shoot gives the account manager planning tasks, starting 45 days before; they show up on the board a week before each is due.</p>
      <CeoTabs label="Shoots" tabs={[
        { id: "upcoming", label: "Upcoming", count: soon.length, content: byMonth(soon, `Nothing in the next ${UPCOMING_DAYS} days.`) },
        { id: "ahead", label: "Looking ahead", count: later.length, content: byMonth(later, "Nothing scheduled further out yet.") },
      ]} />
    </section>
  );
}
