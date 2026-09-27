import Link from "next/link";
import { Logo } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { ClientUser } from "@/lib/types";
import { signOut } from "../login/actions";
import { PortalNav } from "./PortalNav";
import { RailPeople } from "./PortalForms";
import { openCount, type PortalCtx, type Section } from "./sections";

/** Three columns: page menu on the left, the page, and Members on the right. */
export async function PortalShell({ ctx, section, children }: { ctx: PortalCtx; section: Section; children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: am }, { data: people }, open] = await Promise.all([
    ctx.client.account_manager_id
      ? supabase.from("agency_members").select("display_name, title").eq("user_id", ctx.client.account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("client_users").select("*").eq("client_id", ctx.client.id).order("created_at"),
    openCount(ctx),
  ]);
  const contacts = (people ?? []) as ClientUser[];
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
          <div className="brand"><Logo brand={ctx.agency.brand} name={ctx.agency.name} height={58} /></div>
          <PortalNav base={ctx.base} current={section} openTasks={open} />
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
          <p className="eyebrow" id="h-members">Members</p>
          <div className="rail-group">
            <p className="rail-label">{short} team</p>
            <ul className="people">
              <li>
                <span className="av warm">{(am?.display_name ?? "?")[0]}</span>
                <span><b>{am?.display_name ?? "Your team"}</b><span className="note">Account manager</span></span>
              </li>
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
