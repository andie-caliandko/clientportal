import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dateAtHour } from "@/lib/approval";
import { Logo } from "@/lib/brand";
import { ENGAGEMENT_ACTIONS, ACTION_CLASS } from "@/lib/engagement";
import { rangeDates, RANGES, type RangeKey } from "@/lib/report";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatMinutes, minutesBetween } from "@/lib/time";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { Avatar } from "@/app/Avatar";
import { PrintButton } from "@/app/team/clients/[id]/report/PrintButton";
import { ClientDonut } from "@/app/team/time/ClientDonut";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Admins: one teammate's time, daily engagement and finished tasks over a period. */
export default async function TeammateReport({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { agency, member } = await requireTeam();
  if (member.role !== "admin") redirect("/team");
  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const range = (RANGES.some((r) => r.key === sp.range) ? sp.range : "month") as RangeKey;
  const { from, to } = rangeDates(range, today, { from: sp.from, to: sp.to });
  const start = dateAtHour(from, 0, tz).toISOString();
  const end = dateAtHour(addDays(to, 1), 0, tz).toISOString();

  const supabase = await createClient();
  const { data: person } = await supabase.from("agency_members").select("*").eq("agency_id", agency.id).eq("user_id", id).maybeSingle();
  if (!person) notFound();

  const [{ data: timeRows }, { data: engRows }, { data: doneRows }, { data: openRows }, { data: clients }] = await Promise.all([
    supabase.from("time_entries").select("client_id, description, started_at, ended_at").eq("user_id", id).gte("started_at", start).lt("started_at", end).order("started_at"),
    supabase.from("engagement_logs").select("client_id, day, actions, links").eq("logged_by", id).gte("day", from).lte("day", to),
    supabase.from("tasks").select("id, title, client_id, due_at, completed_at").eq("assignee_id", id).eq("status", "done").gte("completed_at", start).lt("completed_at", end).order("completed_at", { ascending: false }),
    supabase.from("tasks").select("id, title, client_id, due_at").eq("assignee_id", id).neq("status", "done").lt("due_at", new Date().toISOString()).order("due_at"),
    supabase.from("clients").select("id, name"),
  ]);
  const short = agency.brand.shortName ?? agency.name;
  const clientName = (cid: string | null) => (cid ? clients?.find((c) => c.id === cid)?.name ?? "Former client" : `${short} (internal)`);
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

  // Time
  const time = timeRows ?? [];
  const totalMins = time.reduce((n, e) => n + minutesBetween(e.started_at, e.ended_at), 0);
  const clientMinutes = new Map<string, number>();
  time.forEach((e) => clientMinutes.set(e.client_id ?? "internal", (clientMinutes.get(e.client_id ?? "internal") ?? 0) + minutesBetween(e.started_at, e.ended_at)));
  const weekOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const byWeek = new Map<string, number>();
  time.forEach((e) => { const w = weekOf(dayOf(e.started_at)); byWeek.set(w, (byWeek.get(w) ?? 0) + minutesBetween(e.started_at, e.ended_at)); });
  const daysTracked = new Set(time.map((e) => dayOf(e.started_at))).size;

  // Engagement
  const eng = engRows ?? [];
  const engByClient = new Map<string, { days: number; links: number; actions: Record<string, number> }>();
  eng.forEach((r) => {
    const k = clientName(r.client_id);
    const row = engByClient.get(k) ?? { days: 0, links: 0, actions: {} };
    row.days++;
    row.links += r.links.length;
    r.actions.forEach((a: string) => (row.actions[a] = (row.actions[a] ?? 0) + 1));
    engByClient.set(k, row);
  });
  const engDays = new Set(eng.map((r) => r.day)).size;

  // Tasks
  const done = doneRows ?? [];
  const onTime = done.filter((t) => !t.due_at || new Date(t.completed_at!).getTime() <= new Date(t.due_at).getTime()).length;
  const overdue = openRows ?? [];

  const q = (over: Record<string, string>) => `/team/team/${id}/report?${new URLSearchParams({ range, ...(range === "custom" ? { from, to } : {}), ...over })}`;
  const hours = (m: number) => `${formatMinutes(m)}`;

  return (
    <section className="report-page">
      <div className="no-print" style={{ display: "grid", gap: 14 }}>
        <Link href="/team/team" className="note">← Back to the team</Link>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <nav className="view-switch" aria-label="Time frame" style={{ flexWrap: "wrap" }}>
            {RANGES.filter((r) => r.key !== "custom").map((r) => (
              <Link key={r.key} href={q({ range: r.key })} aria-current={range === r.key ? "page" : undefined} scroll={false}>{r.label}</Link>
            ))}
          </nav>
          <PrintButton />
        </div>
        <form className="row" style={{ alignItems: "flex-end" }} action={`/team/team/${id}/report`}>
          <input type="hidden" name="range" value="custom" />
          <div className="field"><label htmlFor="tr-from">From</label><input className="input" id="tr-from" name="from" type="date" defaultValue={from} /></div>
          <div className="field"><label htmlFor="tr-to">To</label><input className="input" id="tr-to" name="to" type="date" defaultValue={to} /></div>
          <button className="btn sm line">Use these dates</button>
        </form>
      </div>

      <article className="report">
        <header className="report-head">
          <div className="team-who">
            <Avatar name={person.display_name} path={person.avatar_path} style={{ width: 52, height: 52 }} />
            <div>
              <p className="eyebrow">Internal · team report</p>
              <h1>{person.display_name}</h1>
              <p className="note">{person.title || ROLE_LABEL[person.role as Role]} · {fmtDay(from)} – {fmtDay(to, { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
          </div>
          <div className="report-logos"><Logo brand={agency.brand} name={agency.name} height={44} /></div>
        </header>

        <div className="report-summary">
          <div><b>{hours(totalMins)}</b><span>hours tracked · {daysTracked} day{daysTracked === 1 ? "" : "s"}</span></div>
          <div><b>{done.length}</b><span>tasks completed · {onTime} on time</span></div>
          <div><b>{engDays}</b><span>day{engDays === 1 ? "" : "s"} of engagement logged</span></div>
          <div><b>{overdue.length}</b><span>open tasks overdue now</span></div>
        </div>

        <section className="report-section">
          <h2>Time tracked</h2>
          {time.length ? (
            <div className="cgrid">
              <div>
                <h3>By client</h3>
                <ClientDonut emptyText="No time tracked in this period." slices={[...clientMinutes].map(([cid, minutes]) => ({ id: cid, name: clientName(cid === "internal" ? null : cid), minutes }))} />
              </div>
              <div>
                <h3>By week</h3>
                <table className="report-list"><tbody>
                  {[...byWeek].sort((a, b) => a[0].localeCompare(b[0])).map(([w, m]) => (
                    <tr key={w}><td>Week of {fmtDay(w)}</td><td className="kn">{hours(m)}</td></tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          ) : <p className="note">No time tracked in this period.</p>}
        </section>

        <section className="report-section">
          <h2>Daily engagement</h2>
          {eng.length ? (
            <div className="tablewrap">
              <table className="report-list">
                <thead><tr><th scope="col">Account</th><th scope="col">Days</th>{ENGAGEMENT_ACTIONS.map((a) => <th scope="col" key={a}>{a}</th>)}<th scope="col">Links</th></tr></thead>
                <tbody>
                  {[...engByClient].sort((a, b) => b[1].days - a[1].days).map(([name, r]) => (
                    <tr key={name}>
                      <td>{name}</td><td className="kn"><b>{r.days}</b></td>
                      {ENGAGEMENT_ACTIONS.map((a) => <td key={a} className="kn">{r.actions[a] ? <span className={`eg-tag ${ACTION_CLASS[a]}`}>{r.actions[a]}</span> : <span className="note">—</span>}</td>)}
                      <td className="kn">{r.links}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="note">No daily engagement logged in this period.</p>}
        </section>

        <section className="report-section">
          <h2>Tasks completed</h2>
          {done.length ? (
            <table className="report-list">
              <thead><tr><th scope="col">Task</th><th scope="col">Client</th><th scope="col">Finished</th><th scope="col">On time?</th></tr></thead>
              <tbody>
                {done.map((t) => {
                  const late = t.due_at && new Date(t.completed_at!).getTime() > new Date(t.due_at).getTime();
                  return (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: "normal" }}>{t.title}</td>
                      <td>{clientName(t.client_id)}</td>
                      <td className="kn">{fmtDay(dayOf(t.completed_at!))}</td>
                      <td>{!t.due_at ? <span className="note">No due date</span> : late ? <span className="pill warn">Late</span> : <span className="pill ok">On time</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="note">No tasks completed in this period.</p>}
          {overdue.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Overdue right now</h3>
              <ul className="list">{overdue.map((t) => <li key={t.id}><span style={{ whiteSpace: "normal" }}>{t.title} <span className="note">· {clientName(t.client_id)}</span></span><span className="r pill crit">Was due {fmtDay(dayOf(t.due_at!))}</span></li>)}</ul>
            </>
          )}
        </section>

        <footer className="report-foot note">Prepared by {agency.name} · {fmtDay(today, { month: "long", day: "numeric", year: "numeric" })}</footer>
      </article>
    </section>
  );
}
