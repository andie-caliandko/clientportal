import Link from "next/link";
import { dateAtHour } from "@/lib/approval";
import { connectedMembers, googleConfigured, memberEvents, type CalEvent } from "@/lib/google";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/app/Avatar";
import { ConfirmButton } from "../TeamForms";
import { disconnectMyGoogle } from "./actions";
import { AddToSchedule, BookingHours } from "./ScheduleForms";

const DAY = 86_400_000;
const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Your Google Calendar is connected.",
  denied: "Only teammates can connect a calendar here.",
  expired: "That took too long. Try connecting again.",
  cancelled: "Connecting was cancelled.",
  failed: "Google didn't finish connecting. Try again.",
  "not-configured": "Google isn't set up on the server yet.",
};

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

type Person = { user_id: string; display_name: string; title: string | null; role: string; avatar_path: string | null; book_start: number; book_end: number; book_days: number[] };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; google?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  const { week, google } = await searchParams;
  const tz = agency.timezone;
  const isAdmin = member.role === "admin";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // Weeks run Monday to Sunday.
  const anchor = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today;
  const monday = addDays(anchor, -((new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = dateAtHour(monday, 0, tz).toISOString();
  const to = dateAtHour(addDays(monday, 7), 0, tz).toISOString();

  const supabase = await createClient();
  const [{ data: rows }, connected] = await Promise.all([
    supabase.from("agency_members").select("user_id, display_name, title, role, avatar_path, book_start, book_end, book_days").eq("agency_id", agency.id).order("display_name"),
    connectedMembers(agency.id),
  ]);
  const everyone = (rows ?? []) as Person[];
  const me = everyone.find((p) => p.user_id === userId)!;
  // Admins see everyone's week (theirs first); everyone else sees their own.
  const people = isAdmin ? [me, ...everyone.filter((p) => p.user_id !== userId)] : [me];

  // Everyone's calendar is read for "Who's out", but only admins see other people's events.
  const outHorizon = new Date(Date.now() + 45 * DAY).toISOString();
  const loaded = await Promise.all(
    everyone.map(async (p) => {
      if (!connected.has(p.user_id)) return [p.user_id, { week: null, out: [] as CalEvent[] }] as const;
      try {
        const [wk, ahead] = await Promise.all([
          people.some((x) => x.user_id === p.user_id) ? memberEvents(p.user_id, from, to) : Promise.resolve(null),
          memberEvents(p.user_id, new Date().toISOString(), outHorizon),
        ]);
        return [p.user_id, { week: wk, out: (ahead ?? []).filter((e) => e.ooo) }] as const;
      } catch (err) {
        console.error("Couldn't load a calendar", err);
        return [p.user_id, { week: null, out: [] as CalEvent[], failed: true }] as const;
      }
    }),
  );
  const cal = new Map<string, { week: CalEvent[] | null; out: CalEvent[]; failed?: boolean }>(loaded);

  const dayStart = (d: string) => dateAtHour(d, 0, tz).getTime();
  const onDay = (e: CalEvent, d: string) =>
    e.allDay ? e.start <= d && d < e.end : new Date(e.start).getTime() < dayStart(addDays(d, 1)) && new Date(e.end).getTime() > dayStart(d);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).replace(":00", "");
  const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const outRange = (e: CalEvent) => {
    const first = e.allDay ? e.start : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(e.start));
    const lastExcl = e.allDay ? e.end : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(new Date(e.end).getTime() - 1));
    const last = e.allDay ? addDays(lastExcl, -1) : lastExcl;
    const f = (d: string) => dayLabel(d, { weekday: "short", month: "short", day: "numeric" });
    return first === last ? f(first) : `${f(first)} – ${f(last)}`;
  };
  const whosOut = everyone.flatMap((p) => (cal.get(p.user_id)?.out ?? []).map((e) => ({ p, e }))).sort((a, b) => a.e.start.localeCompare(b.e.start));
  const iAmConnected = connected.has(userId);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{isAdmin ? "Everyone's week" : "Your week"} · from Google Calendar</p>
          <h1 style={{ marginTop: 6 }}>Calendar</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <Link className="btn sm line" href={`/team/calendar?week=${addDays(monday, -7)}`} aria-label="Previous week">←</Link>
          <Link className="btn sm line" href="/team/calendar">This week</Link>
          <Link className="btn sm line" href={`/team/calendar?week=${addDays(monday, 7)}`} aria-label="Next week">→</Link>
        </div>
      </div>
      {google && GOOGLE_MESSAGES[google] && <p className={google === "connected" ? "flash" : "readonly"}>{GOOGLE_MESSAGES[google]}</p>}

      {!iAmConnected && (
        <div className="panel">
          <h2>Connect your Google Calendar</h2>
          <p className="note" style={{ maxWidth: "62ch" }}>
            Your schedule shows here, you can add events and time off, and clients can book calls with you in the open times. Anything added here goes
            straight onto your Google Calendar.
          </p>
          {googleConfigured() ? <div><a className="btn sm" href="/api/google/connect?for=me">Connect my Google Calendar</a></div> : <p className="readonly">Google isn&apos;t set up on the server yet.</p>}
        </div>
      )}

      {whosOut.length > 0 && (
        <div className="panel">
          <h2>Who&apos;s out</h2>
          <ul className="people">
            {whosOut.map(({ p, e }) => (
              <li key={`${p.user_id}-${e.id}`}>
                <Avatar name={p.display_name} path={p.avatar_path} style={{ width: 32, height: 32 }} />
                <span><b>{p.display_name}</b><span className="note">Out {outRange(e)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {iAmConnected && <AddToSchedule today={today} />}

      <div className="sched-wrap">
        <table className="sched">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Person</span></th>
              {days.map((d) => (
                <th scope="col" key={d} className={d === today ? "today" : ""}>
                  <small>{dayLabel(d, { weekday: "short" })}</small> {dayLabel(d, { month: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const c = cal.get(p.user_id);
              return (
                <tr key={p.user_id}>
                  <th scope="row">
                    <span className="sched-who">
                      <Avatar name={p.display_name} path={p.avatar_path} style={{ width: 32, height: 32 }} />
                      <span><b>{p.user_id === userId ? "You" : p.display_name}</b>
                        {!connected.has(p.user_id) && <span className="note">Not connected</span>}
                        {c?.failed && <span className="note">Couldn&apos;t load</span>}
                      </span>
                    </span>
                  </th>
                  {days.map((d) => {
                    const items = (c?.week ?? []).filter((e) => onDay(e, d));
                    const out = items.some((e) => e.ooo);
                    return (
                      <td key={d} className={`${out ? "out" : ""} ${d === today ? "today" : ""}`}>
                        {items.map((e) => (
                          <div key={e.id} className={`ev ${e.ooo ? "ooo" : ""}`}>
                            {e.ooo ? <b>Out of office</b> : (
                              <>
                                <span className="ev-time">{e.allDay ? "All day" : `${time(e.start)}–${time(e.end)}`}</span>
                                <span className="ev-title">{e.title}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {iAmConnected && (
        <div className="cgrid">
          <div className="panel">
            <h2>When clients can book me</h2>
            <p className="note">When you ask a client to pick a time, they only see open times inside these hours ({tz.replace("_", " ")} time), and never when you&apos;re busy or out.</p>
            <BookingHours start={me.book_start} end={me.book_end} days={me.book_days} />
          </div>
          <div className="panel">
            <h2>Your Google connection</h2>
            <p><span className="dot" /> Connected as <b>{connected.get(userId) ?? "your Google account"}</b></p>
            <form action={disconnectMyGoogle}><ConfirmButton label="Disconnect my calendar" confirmLabel="Disconnect your calendar?" /></form>
          </div>
        </div>
      )}
    </section>
  );
}
