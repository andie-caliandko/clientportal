import { Logo } from "@/lib/brand";
import { requireTeam } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/types";
import { signOut } from "../login/actions";
import { TeamNav } from "./TeamNav";
import { MyPhoto } from "./TeamForms";
import { RunningPill } from "./time/TimeForms";
import { canSeeCeo } from "@/lib/ceo";
import { createClient } from "@/lib/supabase/server";
import { Bell } from "../notifications/Bell";
import { loadNotifications } from "@/lib/notificationsList";


export default async function TeamLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const { agency, member } = await requireTeam();
  const supabase = await createClient();
  const [notes, { data: running }] = await Promise.all([
    loadNotifications(),
    // A running timer shows in the top bar so it isn't forgotten.
    supabase.from("time_entries").select("started_at, description, clients(name)").eq("user_id", member.user_id).is("ended_at", null).maybeSingle(),
  ]);
  return (
    <div className="ws">
      <aside className="side">
        <div className="side-top">
          <div className="brand" style={{ padding: 0 }}><Logo brand={agency.brand} name={agency.name} height={52} /></div>
          {notes.userId && <Bell userId={notes.userId} initial={notes.items} />}
        </div>
        <TeamNav isAdmin={member.role === "admin"} isCreator={member.role === "creator"} showCeo={canSeeCeo(agency, member.user_id, member.role)} />
      </aside>
      <main className="main">
        {/* Today's date, and you in the top right, on every page whatever its length. */}
        <div className="me-top">
          <p className="me-top-date">
            {new Date().toLocaleDateString("en-US", { timeZone: agency.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
          {running && (
            <RunningPill startedAt={running.started_at}
              label={running.description || (running.clients as unknown as { name: string } | null)?.name || `${agency.brand.shortName ?? agency.name} (internal)`} />
          )}
          <div className="me-top-text">
            <b>{member.display_name}</b>
            {/* Admins see their access; everyone else sees their job title (set on the Team page). */}
            <span className="note">{member.role === "admin" ? "Admin · all clients" : member.title?.trim() || ROLE_LABEL[member.role]}</span>
            <span className="me-top-links">
              {!member.avatar_path && <label htmlFor="my-photo" className="linkbtn note" style={{ cursor: "pointer" }}>Add your photo</label>}
              <form action={signOut}><button className="linkbtn note">Sign out</button></form>
            </span>
          </div>
          <MyPhoto userId={member.user_id} name={member.display_name} path={member.avatar_path} />
        </div>
        {children}
      </main>
      {modal}
    </div>
  );
}
