import Link from "next/link";
import { dateAtHour } from "@/lib/approval";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatMinutes, minutesBetween } from "@/lib/time";
import { PersonSelect } from "../engagement/PersonSelect";
import { AddTime, EditTime, TimerCard, type Running } from "./TimeForms";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

type Entry = { id: string; user_id: string; client_id: string | null; description: string; started_at: string; ended_at: string | null };

/** Time tracker: your week, a timer, and (for admins) everyone's hours. */
export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string; who?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  const isAdmin = member.role === "admin";
  const sp = await searchParams;
  const tz = agency.timezone;
  const short = agency.brand.shortName ?? agency.name;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  const monday = addDays(anchor, -((new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const who = isAdmin ? sp.who ?? userId : userId;

  const supabase = await createClient();
  let q = supabase.from("time_entries").select("id, user_id, client_id, description, started_at, ended_at")
    .gte("started_at", dateAtHour(monday, 0, tz).toISOString()).lt("started_at", dateAtHour(addDays(monday, 7), 0, tz).toISOString())
    .order("started_at");
  if (who !== "all") q = q.eq("user_id", who);
  const [{ data: rows }, { data: clients }, { data: members }, { data: running }] = await Promise.all([
    q,
    supabase.from("clients").select("id, name").is("archived_at", null).order("name"),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id).order("display_name"),
    supabase.from("time_entries").select("id, client_id, description, started_at").eq("user_id", userId).is("ended_at", null).maybeSingle(),
  ]);
  const entries = (rows ?? []) as Entry[];
  const clientName = (id: string | null) => (id ? clients?.find((c) => c.id === id)?.name ?? "Former client" : `${short} (internal)`);
  const personName = (id: string) => members?.find((m) => m.user_id === id)?.display_name ?? "Former teammate";
  const mins = (e: Entry) => minutesBetween(e.started_at, e.ended_at);
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const label = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const total = entries.reduce((n, e) => n + mins(e), 0);
  const sumBy = (key: (e: Entry) => string) => {
    const m = new Map<string, number>();
    entries.forEach((e) => m.set(key(e), (m.get(key(e)) ?? 0) + mins(e)));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const q2 = (over: Record<string, string>) => `/team/time?${new URLSearchParams({ week: monday, ...(isAdmin && who !== userId ? { who } : {}), ...over })}`;
  const canEdit = (e: Entry) => e.user_id === userId && who === userId;
  const formFields = (e: Entry) => ({
    id: e.id, client_id: e.client_id, description: e.description, date: dayOf(e.started_at),
    start: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(e.started_at)),
    duration: formatMinutes(mins(e)),
  });

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{who === "all" ? "Everyone" : who === userId ? "Your time" : `${personName(who)}'s time`} · week of {label(monday, { month: "short", day: "numeric" })}</p>
          <h1 style={{ marginTop: 6 }}>Time tracker</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          {isAdmin && <PersonSelect param="who" label="Show" value={who} options={[{ value: userId, label: "Me" }, ...(members ?? []).filter((m) => m.user_id !== userId).map((m) => ({ value: m.user_id, label: m.display_name })), { value: "all", label: "Everyone" }]} />}
          <Link className="btn sm line" href={q2({ week: addDays(monday, -7) })} aria-label="Previous week" scroll={false}>←</Link>
          <Link className="btn sm line" href={q2({ week: today })} scroll={false}>This week</Link>
          <Link className="btn sm line" href={q2({ week: addDays(monday, 7) })} aria-label="Next week" scroll={false}>→</Link>
        </div>
      </div>

      {/* Tracking your own time; looking at someone else's is view only. */}
      {who === userId ? (
        <TimerCard running={(running as Running | null) ?? null} clients={clients ?? []} agencyName={short} />
      ) : (
        <p className="readonly">You&apos;re looking at {who === "all" ? "everyone's" : `${personName(who)}'s`} time. Switch Show to Me to track your own.</p>
      )}

      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <p className="time-total"><b>{formatMinutes(total)}</b> <span className="note">this week</span></p>
        {who === userId && <AddTime clients={clients ?? []} agencyName={short} today={today} />}
      </div>

      <div className="cgrid">
        <div className="panel">
          <h2>By client</h2>
          {entries.length ? (
            <ul className="list">{sumBy((e) => clientName(e.client_id)).map(([name, m]) => <li key={name}><span>{name}</span><span className="r kn"><b>{formatMinutes(m)}</b></span></li>)}</ul>
          ) : <p className="note">No time logged this week.</p>}
        </div>
        {who === "all" ? (
          <div className="panel">
            <h2>By person</h2>
            {entries.length ? (
              <ul className="list">{sumBy((e) => personName(e.user_id)).map(([name, m]) => <li key={name}><span>{name}</span><span className="r kn"><b>{formatMinutes(m)}</b></span></li>)}</ul>
            ) : <p className="note">No time logged this week.</p>}
          </div>
        ) : (
          <div className="panel">
            <h2>By day</h2>
            <ul className="list">{days.map((d) => {
              const m = entries.filter((e) => dayOf(e.started_at) === d).reduce((n, e) => n + mins(e), 0);
              return <li key={d}><span>{label(d, { weekday: "long" })}{d === today ? " · today" : ""}</span><span className="r kn">{m ? <b>{formatMinutes(m)}</b> : <span className="note">—</span>}</span></li>;
            })}</ul>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Entries</h2>
        {days.filter((d) => entries.some((e) => dayOf(e.started_at) === d)).map((d) => {
          const list = entries.filter((e) => dayOf(e.started_at) === d);
          return (
            <div key={d} className="time-day">
              <h3>{label(d, { weekday: "long", month: "short", day: "numeric" })} <span className="note">{formatMinutes(list.reduce((n, e) => n + mins(e), 0))}</span></h3>
              <div className="tablewrap">
                <table className="time-table">
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id}>
                        <td className="kn">{time(e.started_at)} – {e.ended_at ? time(e.ended_at) : <span className="pill ok">Running</span>}</td>
                        {who === "all" && <td>{personName(e.user_id)}</td>}
                        <td>{clientName(e.client_id)}</td>
                        <td style={{ whiteSpace: "normal" }}>{e.description || <span className="note">No description</span>}</td>
                        <td className="kn"><b>{formatMinutes(mins(e))}</b></td>
                        <td className="team-edit">{canEdit(e) && e.ended_at && <EditTime entry={formFields(e)} clients={clients ?? []} agencyName={short} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {!entries.length && <p className="note">Nothing logged this week yet. Start the timer above, or add time by hand.</p>}
      </div>
    </section>
  );
}
