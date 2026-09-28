import Link from "next/link";
import { redirect } from "next/navigation";
import { monthDays } from "@/lib/engagement";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { EngagementCell, type EngagementEntry } from "./EngagementCell";
import { PersonSelect } from "./PersonSelect";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/**
 * Daily engagement, month by month: one column per account, one row per day.
 * Account managers see the accounts they manage; admins pick whose accounts to see.
 */
export default async function EngagementPage({ searchParams }: { searchParams: Promise<{ month?: string; am?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  if (member.role === "creator") redirect("/team");
  const isAdmin = member.role === "admin";
  const sp = await searchParams;
  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const days = monthDays(month);

  const supabase = await createClient();
  const [{ data: allClients }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, name, account_manager_id").is("archived_at", null).order("name"),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id).order("display_name"),
  ]);
  const clients = allClients ?? [];
  // People who manage at least one account, for the admin's picker.
  const managers = (members ?? []).filter((m) => clients.some((c) => c.account_manager_id === m.user_id));
  const who = isAdmin ? (sp.am && (sp.am === "all" || managers.some((m) => m.user_id === sp.am)) ? sp.am : managers[0]?.user_id ?? "all") : userId;
  const accounts = clients.filter((c) => who === "all" || c.account_manager_id === who);

  const ids = accounts.map((c) => c.id);
  const [{ data: rows }, { data: teamRows }] = ids.length
    ? await Promise.all([
        supabase.from("engagement_logs").select("client_id, day, actions, links, note, logged_by").in("client_id", ids).gte("day", days[0]).lte("day", days[days.length - 1]),
        supabase.from("client_team").select("client_id, user_id").in("client_id", ids),
      ])
    : [{ data: [] as { client_id: string; day: string; actions: string[]; links: string[]; note: string | null; logged_by: string | null }[] }, { data: [] as { client_id: string; user_id: string }[] }];
  const people = Object.fromEntries((members ?? []).map((m) => [m.user_id, m.display_name]));
  // Each account's team, account manager first.
  const nameOf = (id: string) => members?.find((m) => m.user_id === id)?.display_name ?? "Former teammate";
  const teamFor = (c: { id: string; account_manager_id: string | null }) =>
    [...new Set([c.account_manager_id, ...(teamRows ?? []).filter((t) => t.client_id === c.id).map((t) => t.user_id)].filter(Boolean))]
      .map((id) => ({ user_id: id as string, display_name: nameOf(id as string) }));
  const logs = new Map<string, EngagementEntry>((rows ?? []).map((r) => [`${r.client_id}|${r.day}`, r]));
  const daysLogged = (clientId: string) => days.filter((d) => logs.has(`${clientId}|${d}`)).length;

  const label = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const q = (over: Record<string, string>) => `/team/engagement?${new URLSearchParams({ month, ...(isAdmin ? { am: who } : {}), ...over })}`;
  const managerName = managers.find((m) => m.user_id === who)?.display_name;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Internal · {isAdmin ? (who === "all" ? "every account" : `${managerName}'s accounts`) : "your accounts"}</p>
          <h1 style={{ marginTop: 6 }}>Daily engagement</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          {isAdmin && managers.length > 0 && (
            <PersonSelect value={who} options={[...managers.map((m) => ({ value: m.user_id, label: m.display_name })), { value: "all", label: "Every account" }]} />
          )}
          <Link className="btn sm line" href={q({ month: shiftMonth(month, -1) })} aria-label="Previous month" scroll={false}>←</Link>
          <span className="eg-month">{label(`${month}-01`, { month: "long", year: "numeric" })}</span>
          <Link className="btn sm line" href={q({ month: shiftMonth(month, 1) })} aria-label="Next month" scroll={false}>→</Link>
          {month !== today.slice(0, 7) && <Link className="btn sm line" href={q({ month: today.slice(0, 7) })} scroll={false}>This month</Link>}
        </div>
      </div>
      <p className="note" style={{ maxWidth: "70ch" }}>
        {who === userId || !isAdmin
          ? "Log what you did on each account every day: likes, comments, follows, shares and DMs, with links to where you engaged. Click a day to add or change it."
          : "You're looking at someone else's accounts, so this is view only. Click a day to see what was logged."}
      </p>

      {!accounts.length ? (
        <div className="panel"><p className="note">{isAdmin ? "No active accounts for this person." : "You're not the account manager on any active accounts yet."}</p></div>
      ) : (
        <div className="tablewrap eg-wrap">
          <table className="eg-table">
            <thead>
              <tr>
                <th scope="col" className="eg-day">Day</th>
                {accounts.map((c) => (
                  <th scope="col" key={c.id}>
                    <Link href={`/team/clients/${c.id}`}>{c.name}</Link>
                    <small>{daysLogged(c.id)} of {days.length} days</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
                return (
                  <tr key={d} className={`${wd === 0 || wd === 6 ? "weekend" : ""} ${d === today ? "today" : ""}`}>
                    <th scope="row" className="eg-day">
                      <span>{label(d, { month: "short", day: "numeric" })}</span>
                      <small>{d === today ? "Today" : label(d, { weekday: "short" })}</small>
                    </th>
                    {accounts.map((c) => (
                      <td key={c.id}>
                        <EngagementCell clientId={c.id} clientName={c.name} day={d} dayLabel={label(d, { weekday: "long", month: "long", day: "numeric" })}
                          entry={logs.get(`${c.id}|${d}`) ?? null} canEdit={c.account_manager_id === userId} team={teamFor(c)} managerId={c.account_manager_id} people={people} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
