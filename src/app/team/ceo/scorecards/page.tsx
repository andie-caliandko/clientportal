import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeScorecards, isOwner } from "@/lib/ceo";
import { monthName } from "@/lib/ceoTracker";
import { requireTeam } from "@/lib/session";
import { autoValues, healthAsOf, statusOf, type Card, type Status } from "@/lib/teamScorecard";
import { loadScorecards } from "@/lib/teamScorecard.server";
import { ScorecardView, ShareScorecards } from "./ScorecardView";

export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { admin: "Admin", account_manager: "Account manager", creator: "Creator" };
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** Each teammate's scorecard: KPIs by role, tied to the accounts they manage. The owner's, shared with chosen admins. */
export default async function TeamScorecards({ searchParams }: { searchParams: Promise<{ person?: string; month?: string }> }) {
  const { agency, userId, member } = await requireTeam();
  if (!canSeeScorecards(agency, userId, member.role)) redirect("/team");
  const sp = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const d = await loadScorecards(agency.id, month);
  const team = d.members.filter((m) => m.user_id !== agency.owner_id);
  const end = `${shift(month, 1)}-01`;
  const health = healthAsOf(d.kpis, end);

  // Each KPI's number this month: worked out from the portal, or what was entered.
  const scored = (uid: string, card: Card) => {
    const autos = { own: autoValues({ userId: uid, month, today, scope: "own", ...d }), all: autoValues({ userId: uid, month, today, scope: "all", ...d }) };
    const entered = d.months.get(uid)?.values ?? {};
    return card.kpis.map((k) => {
      const auto = k.source === "manual" ? null : autos[k.scope ?? "own"][k.source];
      const value = auto ? auto.value : entered[k.id] ?? null;
      return { kpi: k, value, detail: auto?.detail ?? null, status: statusOf(k, value, month) as Status };
    });
  };
  const here = (extra: string) => `/team/ceo/scorecards?${extra}`;
  const person = sp.person ? team.find((m) => m.user_id === sp.person) : undefined;

  const monthNav = (base: string) => (
    <div className="row" style={{ alignItems: "center" }}>
      <Link className="btn sm line" href={here(`${base}month=${shift(month, -1)}`)} aria-label="Previous month" scroll={false}>←</Link>
      {month !== today.slice(0, 7) && <Link className="btn sm line" href={here(base.replace(/&$/, ""))} scroll={false}>This month</Link>}
      <Link className="btn sm line" href={here(`${base}month=${shift(month, 1)}`)} aria-label="Next month" scroll={false}>→</Link>
    </div>
  );

  if (person) {
    const card = d.cards.get(person.user_id) ?? { role_title: person.title ?? ROLE[person.role] ?? "", mission: "", kpis: [] };
    const accounts = d.clients.filter((c) => c.account_manager_id === person.user_id && !c.archived_at)
      .map((c) => ({ id: c.id, name: c.name, tracked: c.tracked, rating: health.get(c.id) ?? null }));
    const theirTasks = d.tasks.filter((t) => t.assignee_id === person.user_id);
    const names = new Map(d.clients.map((c) => [c.id, c.name]));
    return (
      <section style={{ display: "grid", gap: 18 }}>
        <Link href={here(`month=${month}`)} className="note">← All team scorecards</Link>
        <div className="top">
          <div>
            <p className="eyebrow">{isOwner(agency, userId) ? "Only you" : "Shared with you"} · {monthName(month)} · Q{Math.ceil(Number(month.slice(5)) / 3)}</p>
            <h1 style={{ marginTop: 6 }}>{person.display_name}</h1>
          </div>
          {monthNav(`person=${person.user_id}&`)}
        </div>
        <ScorecardView key={`${person.user_id}-${month}`} userId={person.user_id} month={month} card={card}
          rows={scored(person.user_id, card)} note={d.months.get(person.user_id)?.note ?? ""}
          accounts={accounts}
          tasks={theirTasks.map((t) => ({ title: t.title, due: t.due_at!.slice(0, 10), done: t.status === "done", late: t.status === "done" ? !!t.completed_at && t.completed_at.slice(0, 10) > t.due_at!.slice(0, 10) : t.due_at!.slice(0, 10) < today, client: t.client_id ? names.get(t.client_id) ?? null : null }))}
          others={team.filter((m) => m.user_id !== person.user_id && d.cards.get(m.user_id)?.kpis.length).map((m) => ({ user_id: m.user_id, name: m.display_name, card: d.cards.get(m.user_id)! }))} />
      </section>
    );
  }

  const admins = d.members.filter((m) => m.role === "admin" && m.user_id !== userId);
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{isOwner(agency, userId) ? "Only you" : "Shared with you"} · {monthName(month)} · Q{Math.ceil(Number(month.slice(5)) / 3)}</p>
          <h1 style={{ marginTop: 6 }}>Team scorecards</h1>
        </div>
        {monthNav("")}
      </div>
      <div className="trk-cards">
        {team.map((m) => {
          const card = d.cards.get(m.user_id);
          const rows = card ? scored(m.user_id, card) : [];
          const counted = rows.filter((r) => r.status === "hit" || r.status === "miss");
          const hit = counted.filter((r) => r.status === "hit").length;
          const accounts = d.clients.filter((c) => c.account_manager_id === m.user_id && !c.archived_at);
          return (
            <Link key={m.user_id} href={here(`person=${m.user_id}&month=${month}`)} className="panel tsc-card">
              <div>
                <h2>{m.display_name}</h2>
                <p className="note">{card?.role_title || m.title || ROLE[m.role]} · {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
              </div>
              {card?.kpis.length ? (
                <>
                  <p className="tsc-score"><b>{hit}</b> of {counted.length} KPIs on target</p>
                  <div className="prc-meter" role="img" aria-label={`${hit} of ${counted.length} on target`}><i style={{ "--w": counted.length ? hit / counted.length : 0 } as React.CSSProperties} /></div>
                  <ul className="tsc-misses">
                    {rows.filter((r) => r.status === "miss").slice(0, 3).map((r) => <li key={r.kpi.id}><span className="pill crit">Off</span> {r.kpi.label}</li>)}
                    {rows.some((r) => r.status === "open") && <li className="note">{rows.filter((r) => r.status === "open").length} still to enter</li>}
                  </ul>
                </>
              ) : <p className="note">No scorecard yet. Open to set one up.</p>}
            </Link>
          );
        })}
      </div>
      {isOwner(agency, userId) && (
        <section className="panel">
          <h2>Sharing</h2>
          <p className="note">Team scorecards are yours. Choose admins who can see and update them too. Team members don&apos;t see them unless you share them.</p>
          <ShareScorecards admins={admins} shared={agency.scorecards_shared_with ?? []} />
        </section>
      )}
    </section>
  );
}
