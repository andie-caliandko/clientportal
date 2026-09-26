import { Logo } from "@/lib/brand";
import { requireTeam } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/types";
import { signOut } from "../login/actions";
import { TeamNav } from "./TeamNav";


export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { agency, member } = await requireTeam();
  return (
    <div className="ws">
      <aside className="side">
        <div className="brand">
          <Logo brand={agency.brand} name={agency.name} height={58} />
        </div>
        <TeamNav isAdmin={member.role === "admin"} />
        <div className="me">
          <span className="av" style={{ background: "var(--hi)", color: "var(--primary)" }}>{member.display_name[0]}</span>
          <div>
            <b>{member.display_name}</b>
            <p className="note">{ROLE_LABEL[member.role]}{member.role === "admin" ? " · all clients" : member.role === "creator" ? " · view only" : ""}</p>
            <form action={signOut}><button className="linkbtn note">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
