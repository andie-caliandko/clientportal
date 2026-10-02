import Link from "next/link";
import { goalProgress, periodLabel, periodStart, shiftPeriod, type Period } from "@/lib/goals";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/app/Avatar";
import { PersonSelect } from "../engagement/PersonSelect";
import { AddGoal, EditGoal, GoalCheck, type Goal } from "./GoalForms";

/** Monthly and quarterly goals each teammate sets for themselves. Admins can look at anyone's. */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ period?: string; start?: string; who?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  const isAdmin = member.role === "admin";
  const sp = await searchParams;
  const period: Period = sp.period === "quarter" ? "quarter" : "month";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const start = periodStart(sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : today, period);
  const who = isAdmin && sp.who ? sp.who : userId;
  const mine = who === userId;

  const supabase = await createClient();
  let q = supabase.from("team_goals").select("id, user_id, title, target, progress, done, note").eq("agency_id", agency.id).eq("period", period).eq("period_start", start).order("created_at");
  if (who !== "all") q = q.eq("user_id", who);
  const [{ data: rows }, { data: members }] = await Promise.all([
    q,
    supabase.from("agency_members").select("user_id, display_name, avatar_path").eq("agency_id", agency.id).order("display_name"),
  ]);
  const goals = (rows ?? []) as (Goal & { user_id: string })[];
  const label = periodLabel(start, period);
  const href = (over: Record<string, string>) => `/team/goals?${new URLSearchParams({ period, start, ...(isAdmin && !mine ? { who } : {}), ...over })}`;
  const people = who === "all" ? (members ?? []).filter((m) => goals.some((g) => g.user_id === m.user_id)) : (members ?? []).filter((m) => m.user_id === who);
  const doneCount = goals.filter((g) => g.done).length;

  const list = (items: (Goal & { user_id: string })[]) => (
    <ul className="goal-list">
      {items.map((g) => {
        const pct = goalProgress(g);
        return (
          <li key={g.id} className={g.done ? "done" : ""}>
            {mine ? <GoalCheck id={g.id} done={g.done} title={g.title} /> : <span className="goal-dot" aria-label={g.done ? "Done" : "Not done"}>{g.done ? "✓" : ""}</span>}
            <div className="goal-body">
              <b>{g.title}</b>
              {g.target ? (
                <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress} aria-label={`${g.progress} of ${g.target}`}>
                  <i style={{ width: `${pct * 100}%` }} />
                </div>
              ) : null}
              {g.note && <p className="note" style={{ margin: 0 }}>{g.note}</p>}
            </div>
            <span className="goal-num kn">{g.target ? `${g.progress} / ${g.target}` : g.done ? "Done" : ""}</span>
            {mine && <EditGoal goal={g} period={period} start={start} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{mine ? "Your goals" : who === "all" ? "Everyone's goals" : `${people[0]?.display_name ?? "Their"}'s goals`} · {label}</p>
          <h1 style={{ marginTop: 6 }}>Goals</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          {isAdmin && <PersonSelect param="who" label="Show" value={who} options={[{ value: userId, label: "Me" }, ...(members ?? []).filter((m) => m.user_id !== userId).map((m) => ({ value: m.user_id, label: m.display_name })), { value: "all", label: "Everyone" }]} />}
          <nav className="view-switch" aria-label="Goal period">
            <Link href={href({ period: "month", start: periodStart(start, "month") })} aria-current={period === "month" ? "page" : undefined} scroll={false}>Monthly</Link>
            <Link href={href({ period: "quarter", start: periodStart(start, "quarter") })} aria-current={period === "quarter" ? "page" : undefined} scroll={false}>Quarterly</Link>
          </nav>
          <Link className="btn sm line" href={href({ start: shiftPeriod(start, period, -1) })} aria-label={`Previous ${period}`} scroll={false}>←</Link>
          <span className="eg-month">{label}</span>
          <Link className="btn sm line" href={href({ start: shiftPeriod(start, period, 1) })} aria-label={`Next ${period}`} scroll={false}>→</Link>
        </div>
      </div>

      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <p className="time-total"><b>{doneCount} of {goals.length}</b> <span className="note">done</span></p>
        {mine && <AddGoal period={period} start={start} label={label} />}
      </div>

      {who === "all" ? (
        people.length ? people.map((p) => (
          <div key={p.user_id} className="panel">
            <h2 className="team-who"><Avatar name={p.display_name} path={p.avatar_path} style={{ width: 32, height: 32 }} /> {p.display_name}</h2>
            {list(goals.filter((g) => g.user_id === p.user_id))}
          </div>
        )) : <div className="panel"><p className="note">No one has set goals for {label} yet.</p></div>
      ) : (
        <div className="panel">
          {goals.length ? list(goals) : <p className="note">{mine ? `No goals for ${label} yet. Add your first one.` : `No goals for ${label}.`}</p>}
        </div>
      )}
    </section>
  );
}
