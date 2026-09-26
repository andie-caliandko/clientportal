import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { changeRole, removeTeammate } from "../actions";
import { AutoSubmitSelect, ConfirmButton, InviteTeammateForm } from "../TeamForms";

export default async function TeamPage() {
  const { agency, member: me } = await requireTeam();
  if (me.role !== "admin") redirect("/team");
  const supabase = await createClient();
  const [{ data: members }, { data: clients }, { data: onTeam }] = await Promise.all([
    supabase.from("agency_members").select("user_id, display_name, title, role, email").eq("agency_id", agency.id).order("display_name"),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("client_team").select("user_id, client_id"),
  ]);
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

      <InviteTeammateForm clients={clients ?? []} />

      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Client portals</th><th /></tr></thead>
          <tbody>
            {(members ?? []).map((m) => {
              const self = m.user_id === me.user_id;
              return (
                <tr key={m.user_id}>
                  <td><b>{m.display_name}</b><br /><span className="note">{m.title ?? m.email}</span></td>
                  <td>
                    {self ? (
                      <span className="note">{ROLE_LABEL[m.role as Role]} (you)</span>
                    ) : (
                      <form action={changeRole}>
                        <input type="hidden" name="user" value={m.user_id} />
                        <AutoSubmitSelect name="role" defaultValue={m.role} label={`Role for ${m.display_name}`}
                          options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
                      </form>
                    )}
                  </td>
                  <td>{m.role === "admin" ? "All clients" : `${count.get(m.user_id) ?? 0} client${count.get(m.user_id) === 1 ? "" : "s"}`}</td>
                  <td>
                    {!self && (
                      <form action={removeTeammate}>
                        <input type="hidden" name="user" value={m.user_id} />
                        <ConfirmButton label="Remove" confirmLabel={`Remove ${m.display_name.split(" ")[0]}?`} />
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">Add account managers and creators to specific clients from each client&apos;s page.</p>
    </section>
  );
}
