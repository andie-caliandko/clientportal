import { Avatar } from "@/app/Avatar";
import Link from "next/link";
import { Logo } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { ClientUser } from "@/lib/types";
import { signOut } from "../login/actions";
import { PortalNav } from "./PortalNav";
import { Bell } from "../notifications/Bell";
import { loadNotifications } from "@/lib/notificationsList";
import { RailPeople } from "./PortalForms";
import { clientLogoUrl } from "@/lib/links";
import { openCount } from "./sections";
import type { PortalBase } from "./context";

type TeamPerson = { user_id: string; display_name: string; title: string | null; role: string; avatar_path: string | null };

/** Three columns: page menu on the left, the page, and Members on the right. */
export async function PortalShell({ ctx, children }: { ctx: PortalBase; children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: teamRows }, { data: people }, open] = await Promise.all([
    supabase.from("client_team").select("user_id, added_at").eq("client_id", ctx.client.id).order("added_at"),
    supabase.from("client_users").select("*").eq("client_id", ctx.client.id).order("created_at"),
    openCount(ctx),
  ]);
  const contacts = (people ?? []) as ClientUser[];
  // Everyone the agency put on this account, account manager first.
  const teamIds = [...new Set([ctx.client.account_manager_id, ...(teamRows ?? []).map((t) => t.user_id)].filter(Boolean))] as string[];
  const { data: teamPeople } = teamIds.length
    ? await supabase.from("agency_members").select("user_id, display_name, title, role, avatar_path").in("user_id", teamIds)
    : { data: [] as TeamPerson[] };
  // Admins stay hidden from clients unless they're this client's account manager.
  const team = teamIds
    .map((id) => (teamPeople ?? []).find((p) => p.user_id === id))
    .filter((p): p is TeamPerson => !!p && (p.role !== "admin" || p.user_id === ctx.client.account_manager_id));
  const notes = ctx.preview ? { userId: null, items: [] } : await loadNotifications();
  const me = contacts.find((c) => c.user_id === ctx.userId);
  const short = ctx.agency.brand.shortName ?? ctx.agency.name;

  return (
    <>
      {ctx.preview && (
        <div className="preview-bar sticky">
          <span><b>Preview:</b> this is exactly what {ctx.client.name} sees. Buttons are turned off here.</span>
          <Link className="btn sm" href={`/team/clients/${ctx.client.id}`}>Back to client page</Link>
        </div>
      )}
      <div className="cp">
        <aside className="side cp-side">
          <div className="side-top">
            <div className="brand" style={{ padding: 0 }}><Logo brand={ctx.agency.brand} name={ctx.agency.name} height={52} /></div>
            {!ctx.preview && notes.userId && <Bell userId={notes.userId} initial={notes.items} />}
          </div>
          <PortalNav base={ctx.base} openTasks={open} />
          <div className="me">
            <span className="av" style={{ background: "var(--hi)", color: "var(--primary)" }}>{(me?.display_name ?? ctx.firstName)[0]}</span>
            <div>
              <b>{me?.display_name ?? ctx.firstName}</b>
              <p className="note">{ctx.client.name}</p>
              {!ctx.preview && <form action={signOut}><button className="linkbtn note">Sign out</button></form>}
            </div>
          </div>
        </aside>

        <main className="cp-main">
          <div className="cp-page">{children}</div>
        </main>

        <aside className="side cp-rail" aria-labelledby="h-members">
          {clientLogoUrl(ctx.client.logo_path) && (
            <div className="rail-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clientLogoUrl(ctx.client.logo_path)!} alt={ctx.client.name} />
            </div>
          )}
          <p className="eyebrow" id="h-members">Members</p>
          <div className="rail-group">
            <p className="rail-label">{short} team</p>
            <ul className="people">
              {team.map((p) => (
                <li key={p.user_id}>
                  <Avatar className="warm" name={p.display_name} path={p.avatar_path} />
                  <span>
                    <b>{p.display_name}</b>
                    <span className="note">{p.user_id === ctx.client.account_manager_id ? "Account manager" : p.title ?? "Your team"}</span>
                  </span>
                </li>
              ))}
              {!team.length && <li><span className="note">Your team will show here.</span></li>}
            </ul>
          </div>
          <div className="rail-group">
            <p className="rail-label">{ctx.client.name}</p>
            <RailPeople people={contacts} canAdd={!ctx.preview && contacts.length < 2} />
          </div>
        </aside>
      </div>
    </>
  );
}
