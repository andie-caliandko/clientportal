import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { removeTeammate } from "../actions";
import { EditTeammate, InviteTeammateForm } from "../TeamForms";
import { Avatar } from "@/app/Avatar";
import { ROLE_LABEL, type Role } from "@/lib/types";

export default async function TeamPage() {
  const { agency, member: me } = await requireTeam();
  if (me.role !== "admin") redirect("/team");
  const supabase = await createClient();
  const [{ data: members }, { data: clients }, { data: onTeam }] = await Promise.all([
    // Everything, so this still works before newer columns (like joined_at) exist.
    supabase.from("agency_members").select("*").eq("agency_id", agency.id).order("display_name"),
    supabase.from("clients").select("id, name, account_manager_id, archived_at").order("name"),
    supabase.from("client_team").select("user_id, client_id"),
  ]);
  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const count = new Map<string, number>();
  (onTeam ?? []).forEach((t) => count.set(t.user_id, (count.get(t.user_id) ?? 0) + 1));

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Admins only</p>
          <h1 style={{ marginTop: 6 }}>Team</h1>
        </div>
      </div>

      <div className="roles">
        <div className="panel">
          <span className="pill info" style={{ justifySelf: "start" }}>Admin</span>
          <p><b>Everything, on every client.</b> Edit and delete anything, change client info, manage the team and settings.</p>
        </div>
        <div className="panel">
          <span className="pill ok" style={{ justifySelf: "start" }}>Account manager</span>
          <p><b>Only the portals they&apos;re added to.</b> Can make changes there: send calendars, add PDFs, reply to messages, update tasks.</p>
        </div>
        <div className="panel">
          <span className="pill warn" style={{ justifySelf: "start" }}>Creator</span>
          <p><b>Only the portals they&apos;re added to.</b> View only. They can see everything on those accounts but can&apos;t change anything.</p>
        </div>
      </div>

      <InviteTeammateForm clients={activeClients} />

      <div className="panel">
        <h2>Your team</h2>
        <div className="tablewrap">
          <table className="team-table">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Job title</th><th scope="col">Access</th><th scope="col">Email</th><th scope="col">Clients</th><th scope="col"><span className="sr-only">Edit</span></th></tr>
            </thead>
            <tbody>
              {((members ?? []) as { user_id: string; display_name: string; title: string | null; role: Role; email: string; avatar_path?: string | null; joined_at?: string | null }[]).map((m) => {
                const self = m.user_id === me.user_id;
                return (
                  <tr key={m.user_id}>
                    <td>
                      <span className="team-who">
                        <Avatar name={m.display_name} path={m.avatar_path} style={{ width: 32, height: 32 }} />
                        <b>{m.display_name}{self ? " (you)" : ""}</b>
                        {"joined_at" in m && !m.joined_at && <span className="pill warn">Invited</span>}
                      </span>
                    </td>
                    <td>{m.title || <span className="note">—</span>}</td>
                    <td>{ROLE_LABEL[m.role]}</td>
                    <td className="note">{m.email}</td>
                    <td className="kn">{m.role === "admin" ? "All" : count.get(m.user_id) ?? 0}</td>
                    <td className="team-edit"><span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}><Link className="btn sm line" href={`/team/team/${m.user_id}/report`}>Report</Link><EditTeammate member={m} isMe={self} removeAction={removeTeammate}
                        clients={activeClients.map((c) => ({ id: c.id, name: c.name, manages: c.account_manager_id === m.user_id, on: (onTeam ?? []).some((t) => t.user_id === m.user_id && t.client_id === c.id) }))} /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">Add account managers and creators to specific clients from each client&apos;s page.</p>
    </section>
  );
}
