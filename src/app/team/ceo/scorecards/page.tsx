import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeScorecards, isOwner } from "@/lib/ceo";
import { monthName } from "@/lib/ceoTracker";
import { requireTeam } from "@/lib/session";
import { overallScore, quarterLabel, quarterMonths, resolveCard } from "@/lib/teamScorecard";
import { loadScorecards, scoresFor } from "@/lib/teamScorecard.server";
import { EditCard, ScorecardView, ShareScorecards } from "./ScorecardView";

export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { admin: "Admin", account_manager: "Account manager", creator: "Creator" };
const pctText = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
const pick = (x: { scorecard: number | null; accountsHealth: number | null; overall: number | null }) => ({ scorecard: x.scorecard, accountsHealth: x.accountsHealth, overall: x.overall });
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** Each teammate's scorecard: KPIs by role, tied to the accounts they manage. The owner's, shared with chosen admins. */
export default async function TeamScorecards({ searchParams }: { searchParams: Promise<{ person?: string; month?: string; position?: string }> }) {
  const { agency, userId, member } = await requireTeam();
  if (!canSeeScorecards(agency, userId, member.role)) redirect("/team");
  const sp = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  // This month, plus the quarter's earlier months for the quarter-to-date scores.
  const months = quarterMonths(month);
  const loaded = await Promise.all(months.map((m) => (m === month ? null : loadScorecards(agency.id, m))));
  const d = await loadScorecards(agency.id, month);
  const team = d.members.filter((m) => m.user_id !== agency.owner_id);
  const cardFor = (m: (typeof team)[number]) => resolveCard(m, d.rows.get(m.user_id), d.templates);
  const scored = (m: (typeof team)[number]) => scoresFor(d, m, month, today);
  // Each month of the quarter so far, and their average.
  const quarter = (m: (typeof team)[number]) => {
    const each = months.map((mo, i) => ({ month: mo, ...pick(scoresFor(loaded[i] ?? d, m, mo, today)) }));
    const avg = (k: "scorecard" | "accountsHealth") => overallScore(...each.map((e) => e[k]));
    const scorecard = avg("scorecard"), accountsHealth = avg("accountsHealth");
    return { each, scorecard, accountsHealth, overall: overallScore(scorecard, accountsHealth) };
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

  // A position's scorecard: the same for everyone in it.
  if (sp.position) {
    const t = sp.position === "new" ? null : d.templates.find((x) => x.id === sp.position);
    if (sp.position !== "new" && !t) redirect("/team/ceo/scorecards");
    const inIt = t ? team.filter((m) => cardFor(m).template?.id === t.id && !cardFor(m).custom) : [];
    return (
      <section style={{ display: "grid", gap: 18 }}>
        <Link href={here(`month=${month}`)} className="note">← All team scorecards</Link>
        <div>
          <p className="eyebrow">Position scorecard{inIt.length ? ` · ${inIt.map((m) => m.display_name.split(" ")[0]).join(", ")}` : ""}</p>
          <h1 style={{ marginTop: 6 }}>{t ? t.title : "New position"}</h1>
        </div>
        <EditCard key={sp.position} mode={{ kind: "template", id: t?.id ?? null, auto_role: t?.auto_role ?? null, auto_title: t?.auto_title ?? null, people: inIt.length }}
          card={t ? { role_title: t.title, mission: t.mission, kpis: t.kpis } : { role_title: "", mission: "", kpis: [] }} others={[]}
          back={here(`month=${month}`)} />
      </section>
    );
  }

  if (person) {
    const resolved = cardFor(person);
    const card = resolved.card ?? { role_title: person.title ?? ROLE[person.role] ?? "", mission: "", kpis: [] };
    const now = scored(person);
    const q = quarter(person);
    const accounts = now.accounts.map((c) => ({ id: c.id, name: c.name, tracked: c.tracked, rating: now.health.get(c.id) ?? null }));
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
          rows={now.rows} note={d.months.get(person.user_id)?.note ?? ""}
          scores={{ month: pick(now), quarter: q, label: quarterLabel(month) }}
          accounts={accounts}
          tasks={theirTasks.map((t) => ({ title: t.title, due: t.due_at!.slice(0, 10), done: t.status === "done", late: t.status === "done" ? !!t.completed_at && t.completed_at.slice(0, 10) > t.due_at!.slice(0, 10) : t.due_at!.slice(0, 10) < today, client: t.client_id ? names.get(t.client_id) ?? null : null }))}
          name={person.display_name.split(" ")[0]} position={{ id: resolved.template?.id ?? null, title: resolved.template?.title ?? null, custom: resolved.custom, picked: d.rows.get(person.user_id)?.template_id ?? null }}
          positions={d.templates.map((t) => ({ id: t.id, title: t.title }))}
          others={d.templates.map((t) => ({ user_id: t.id, name: t.title, card: { role_title: t.title, mission: t.mission, kpis: t.kpis } }))} />
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
          const now = scored(m);
          const card = now.card;
          const rows = now.rows;
          const counted = rows.filter((r) => r.status === "hit" || r.status === "miss");
          const hit = counted.filter((r) => r.status === "hit").length;
          const accounts = now.accounts;
          const q = quarter(m);
          return (
            <Link key={m.user_id} href={here(`person=${m.user_id}&month=${month}`)} className="panel tsc-card">
              <div>
                <h2>{m.display_name}</h2>
                <p className="note">{card?.role_title || m.title || ROLE[m.role]}{cardFor(m).custom ? " (their own)" : ""} · {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
              </div>
              <div className="tsc-scores">
                <div className="tsc-overall"><b>{pctText(q.overall)}</b><span>Overall, {quarterLabel(month)} so far</span></div>
                <dl className="trk-dl">
                  <div><dt>Scorecard</dt><dd>{pctText(q.scorecard)}</dd></div>
                  <div><dt>Client accounts</dt><dd>{accounts.length ? pctText(q.accountsHealth) : "No accounts"}</dd></div>
                </dl>
              </div>
              {card?.kpis.length ? (
                <>
                  <p className="tsc-score"><b>{hit}</b> of {counted.length} KPIs on target in {monthName(month, "short").split(" ")[0]}</p>
                  <div className="prc-meter" role="img" aria-label={`${hit} of ${counted.length} on target`}><i style={{ "--w": counted.length ? hit / counted.length : 0 } as React.CSSProperties} /></div>
                  <ul className="tsc-misses">
                    {rows.filter((r) => r.status === "miss").slice(0, 3).map((r) => <li key={r.kpi.id}><span className="pill crit">Off</span> {r.kpi.label}</li>)}
                    {rows.some((r) => r.status === "open") && <li className="note">{rows.filter((r) => r.status === "open").length} still to enter</li>}
                  </ul>
                </>
              ) : <p className="note">No position matches yet. Open to pick one.</p>}
            </Link>
          );
        })}
      </div>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Positions</h2>
          <Link className="btn sm line" href={here(`position=new&month=${month}`)}>New position</Link>
        </div>
        <p className="note">Each position has one scorecard. Everyone in it gets it automatically, matched by their team role or job title. Change it once and it changes for all of them.</p>
        <ul className="list">
          {d.templates.map((t) => {
            const inIt = team.filter((m) => cardFor(m).template?.id === t.id && !cardFor(m).custom);
            return (
              <li key={t.id}>
                <span><b>{t.title}</b><br /><span className="note">
                  {[t.auto_role && `Everyone with the ${ROLE[t.auto_role] ?? t.auto_role} role`, t.auto_title && `job titles with "${t.auto_title}"`].filter(Boolean).join(" or ") || "Picked person by person"}
                  {" · "}{inIt.length ? inIt.map((m) => m.display_name.split(" ")[0]).join(", ") : "No one yet"} · {t.kpis.length} KPIs
                </span></span>
                <span className="r"><Link className="btn sm line" href={here(`position=${t.id}&month=${month}`)}>Edit</Link></span>
              </li>
            );
          })}
          {!d.templates.length && <li className="note">No positions yet.</li>}
        </ul>
      </section>
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
