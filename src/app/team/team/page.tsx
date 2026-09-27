import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { removeTeammate } from "../actions";
import { ConfirmButton, InviteTeammateForm, TeammateRow } from "../TeamForms";

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

      <div className="panel">
        <h2>Your team</h2>
        {(members ?? []).map((m) => {
          const self = m.user_id === me.user_id;
          return (
            <div key={m.user_id} style={{ display: "grid", gap: 6 }}>
              <TeammateRow member={m} isMe={self} />
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span className="note">
                  {m.email} · {m.role === "admin" ? "All clients" : `${count.get(m.user_id) ?? 0} client${count.get(m.user_id) === 1 ? "" : "s"}`}
                </span>
                {!self && (
                  <form action={removeTeammate}>
                    <input type="hidden" name="user" value={m.user_id} />
                    <ConfirmButton label="Remove from team" confirmLabel={`Remove ${m.display_name.split(" ")[0]}?`} />
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="note">Add account managers and creators to specific clients from each client&apos;s page.</p>
    </section>
  );
}
