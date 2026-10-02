import Link from "next/link";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadHealth } from "@/lib/healthData";
import { clientLogoUrl } from "@/lib/links";
import { RatingPill } from "./[id]/HealthTab";
import { AddClientButton } from "../TeamForms";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string; done?: string }> }) {
  const { agency, member } = await requireTeam();
  const sp = await searchParams;
  const isAdmin = member.role === "admin";
  // Only admins can see archived clients.
  const showArchived = isAdmin && sp.archived === "1";
  const supabase = await createClient();
  const [{ data: clients }, { data: steps }, { data: status }, { data: cals }, { data: members }, { data: portalPeople }] = await Promise.all([
    supabase.from("clients").select("id, name, account_manager_id, archived_at, logo_path").order("name"),
    supabase.from("onboarding_steps").select("id").eq("agency_id", agency.id),
    supabase.from("client_step_status").select("client_id"),
    supabase.from("content_calendars").select("client_id, status, month").order("month", { ascending: false }),
    supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agency.id).order("display_name"),
    // Everything, so this still works before joined_at exists.
    supabase.from("client_users").select("*"),
  ]);
  // Portal: has anyone joined, or are they all still invited?
  const portalStatus = (cid: string) => {
    const ppl = ((portalPeople ?? []) as { client_id: string; joined_at?: string | null }[]).filter((p) => p.client_id === cid);
    if (!ppl.length) return <span className="note">Not invited</span>;
    if (!("joined_at" in ppl[0])) return <span className="note">{ppl.length} on portal</span>;
    const joined = ppl.filter((p) => p.joined_at).length;
    return joined ? <span className="pill ok">Joined{ppl.length > 1 ? ` · ${joined} of ${ppl.length}` : ""}</span> : <span className="pill warn">Invited</span>;
  };
  const { health } = await loadHealth(supabase);
  const all = clients ?? [];
  const list = all.filter((c) => (showArchived ? c.archived_at : !c.archived_at));
  const archivedCount = all.filter((c) => c.archived_at).length;
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
        {member.role === "admin" && !showArchived && <AddClientButton members={members ?? []} agencyId={agency.id} meId={member.user_id} />}
      </div>
      <div className="tabs" role="tablist" aria-label="Which clients">
        <Link href="/team/clients" role="tab" aria-selected={!showArchived}>Active</Link>
        {isAdmin && <Link href="/team/clients?archived=1" role="tab" aria-selected={showArchived}>Archived{archivedCount ? ` (${archivedCount})` : ""}</Link>}
      </div>
      {sp.done === "archived" && <p className="flash">Client archived. Their portal is closed, and everything is saved here if you ever need it.</p>}
      {showArchived && <p className="note">Archived clients keep all their files, messages and history. Their portal is closed. Open one to restore it.</p>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Client</th><th>Health · internal</th><th>Account manager</th><th>Portal</th><th>Onboarding</th><th>Latest content calendar</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const done = doneBy.get(c.id) ?? 0;
              return (
                <tr key={c.id}>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.logo_path && <img className="client-logo-sm" src={clientLogoUrl(c.logo_path)!} alt="" />}
                    <Link href={`/team/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{health.get(c.id) ? <Link href={`/team/clients/${c.id}?tab=health`} style={{ fontWeight: 400 }}><RatingPill rating={health.get(c.id)!.rating} /></Link> : <span className="note">No scorecard yet</span>}</td>
                  <td>{c.account_manager_id ? name[c.account_manager_id] : "Unassigned"}</td>
                  <td>{portalStatus(c.id)}</td>
                  <td><span className="bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>{done} of {total}</td>
                  <td>{pill[latestCal.get(c.id) ?? ""] ?? <span className="note">None yet</span>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={6} className="note">{showArchived ? "No archived clients." : "No clients yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
