import Link from "next/link";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadHealth } from "@/lib/healthData";
import { RatingPill } from "./[id]/HealthTab";

export default async function ClientsPage() {
  const { agency, member } = await requireTeam();
  const supabase = await createClient();
  const [{ data: clients }, { data: steps }, { data: status }, { data: cals }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, name, account_manager_id").order("name"),
    supabase.from("onboarding_steps").select("id").eq("agency_id", agency.id),
    supabase.from("client_step_status").select("client_id"),
    supabase.from("content_calendars").select("client_id, status, month").order("month", { ascending: false }),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id),
  ]);
  const { health } = await loadHealth(supabase);
  const total = steps?.length ?? 0;
  const doneBy = new Map<string, number>();
  (status ?? []).forEach((s) => doneBy.set(s.client_id, (doneBy.get(s.client_id) ?? 0) + 1));
  const latestCal = new Map<string, string>();
  (cals ?? []).forEach((c) => { if (!latestCal.has(c.client_id)) latestCal.set(c.client_id, c.status); });
  const name = Object.fromEntries((members ?? []).map((m) => [m.user_id, m.display_name]));
  const pill: Record<string, React.ReactNode> = {
    pending: <span className="pill warn">Waiting on client</span>,
    approved: <span className="pill ok">Approved</span>,
    auto_approved: <span className="pill info">Auto-approved · no reply</span>,
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="top">
        <h1>Clients</h1>
        {member.role === "admin" && <Link className="btn sm" href="/team/clients/new">Add client</Link>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Client</th><th>Health · internal</th><th>Account manager</th><th>Onboarding</th><th>Latest content calendar</th></tr></thead>
          <tbody>
            {(clients ?? []).map((c) => {
              const done = doneBy.get(c.id) ?? 0;
              return (
                <tr key={c.id}>
                  <td><Link href={`/team/clients/${c.id}`}>{c.name}</Link></td>
                  <td>{health.get(c.id) ? <Link href={`/team/clients/${c.id}?tab=health`} style={{ fontWeight: 400 }}><RatingPill rating={health.get(c.id)!.rating} /></Link> : <span className="note">No scorecard yet</span>}</td>
                  <td>{c.account_manager_id ? name[c.account_manager_id] : "Unassigned"}</td>
                  <td><span className="bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>{done} of {total}</td>
                  <td>{pill[latestCal.get(c.id) ?? ""] ?? <span className="note">None yet</span>}</td>
                </tr>
              );
            })}
            {!clients?.length && <tr><td colSpan={5} className="note">No clients yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
