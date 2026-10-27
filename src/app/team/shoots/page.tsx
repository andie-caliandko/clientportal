import { requireTeam } from "@/lib/session";
import { loadShoots } from "@/lib/shootsData";
import { createClient } from "@/lib/supabase/server";
import { ShootEditor } from "./ShootForms";
import { ShootList } from "./ShootList";

/** Every client's upcoming content shoots, by month, and where to schedule new ones. */
export default async function ShootsPage() {
  const { agency, member } = await requireTeam();
  const canEdit = member.role !== "creator";
  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const supabase = await createClient();
  const [shoots, { data: clients }] = await Promise.all([
    loadShoots(supabase, today),
    supabase.from("clients").select("id, name").is("archived_at", null).order("name"),
  ]);
  const months = [...new Set(shoots.map((s) => s.shoot_date.slice(0, 7)))];
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{shoots.length} upcoming</p>
          <h1 style={{ marginTop: 6 }}>Content shoots</h1>
        </div>
        {canEdit && <ShootEditor clients={clients ?? []} label="Schedule a shoot" />}
      </div>
      <p className="note">Clients see their upcoming shoots in their portal. Each shoot gives the account manager planning tasks, starting 45 days before; they show up on the board a week before each is due.</p>
      {months.map((m) => (
        <div className="panel" key={m}>
          <h2>{monthLabel(m)}</h2>
          <ShootList shoots={shoots.filter((s) => s.shoot_date.startsWith(m))} canEdit={canEdit} showClient timeZone={tz} />
        </div>
      ))}
      {!shoots.length && <div className="panel"><p className="note">No shoots scheduled yet.{canEdit ? " Use Schedule a shoot to add one." : ""}</p></div>}
    </section>
  );
}
