import Link from "next/link";
import { dateAtHour } from "@/lib/approval";
import { connectedMembers, googleConfigured, memberEvents, type CalEvent } from "@/lib/google";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/app/Avatar";
import { ConfirmButton } from "../TeamForms";
import { disconnectMyGoogle } from "./actions";
import { AddToSchedule, BookingHours } from "./ScheduleForms";
import { TogetherWeek, type WeekItem } from "./TogetherWeek";
import { MonthGrid } from "./MonthGrid";
import { EventChip, type EventInfo } from "./EventDialog";
import { memberColors } from "@/lib/memberColors";

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

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; week?: string; google?: string; view?: string; range?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  const { date: dateParam, week, google, view: viewParam, range: rangeParam } = await searchParams;
  const range = rangeParam === "day" || rangeParam === "month" ? rangeParam : "week";
  // Month is one shared grid; By person is for a day or a week.
  const view = viewParam === "people" && range !== "month" ? "people" : "together";
  const tz = agency.timezone;
  const isAdmin = member.role === "admin";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [nowH, nowM] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const nowMinutes = nowH * 60 + nowM;
  const picked = dateParam ?? week;
  const anchor = picked && /^\d{4}-\d{2}-\d{2}$/.test(picked) ? picked : today;
  // Weeks run Monday to Sunday; a month shows the full weeks it touches.
  const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const monthFirst = `${anchor.slice(0, 7)}-01`;
  const monthNext = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7), 1)).toISOString().slice(0, 10);
  const monthPrev = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  const first = range === "day" ? anchor : range === "week" ? mondayOf(anchor) : mondayOf(monthFirst);
  const count = range === "day" ? 1 : range === "week" ? 7 : (Date.parse(mondayOf(addDays(monthNext, 6))) - Date.parse(first)) / DAY;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const from = dateAtHour(first, 0, tz).toISOString();
  const to = dateAtHour(addDays(first, count), 0, tz).toISOString();
  const step = {
    prev: range === "day" ? addDays(anchor, -1) : range === "week" ? addDays(first, -7) : monthPrev,
    next: range === "day" ? addDays(anchor, 1) : range === "week" ? addDays(first, 7) : monthNext,
  };

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
  // Whole days, so the same look-ahead is reused between page loads.
  const outFrom = dateAtHour(today, 0, tz).toISOString();
  const outHorizon = dateAtHour(addDays(today, 45), 0, tz).toISOString();
  const loaded = await Promise.all(
    everyone.map(async (p) => {
      if (!connected.has(p.user_id)) return [p.user_id, { week: null, out: [] as CalEvent[] }] as const;
      try {
        const [wk, ahead] = await Promise.all([
          people.some((x) => x.user_id === p.user_id) ? memberEvents(p.user_id, from, to) : Promise.resolve(null),
          memberEvents(p.user_id, outFrom, outHorizon).then((list) => list?.filter((e) => new Date(e.end).getTime() > Date.now()) ?? null),
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
  // Timed events that start or end on another day read "All day", "Until 7 AM" or "From 7 AM".
  const label = (e: CalEvent, d: string) => {
    if (e.allDay) return "All day";
    const s0 = new Date(e.start).getTime(), e0 = new Date(e.end).getTime();
    const startsBefore = s0 < dayStart(d), endsAfter = e0 > dayStart(addDays(d, 1));
    if (startsBefore && endsAfter) return "All day";
    if (startsBefore) return `Until ${time(e.end)}`;
    if (endsAfter) return `From ${time(e.start)}`;
    return `${time(e.start)}–${time(e.end)}`;
  };
  const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const outRange = (e: CalEvent) => {
    const first = e.allDay ? e.start : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(e.start));
    const lastExcl = e.allDay ? e.end : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(new Date(e.end).getTime() - 1));
    const last = e.allDay ? addDays(lastExcl, -1) : lastExcl;
    const f = (d: string) => dayLabel(d, { weekday: "short", month: "short", day: "numeric" });
    return first === last ? f(first) : `${f(first)} – ${f(last)}`;
  };
  // What the event pop-up needs, with form values in the agency's time zone.
  const wallDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const wallTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const longDay = (d: string) => dayLabel(d, { weekday: "short", month: "short", day: "numeric" });
  const infoFor = (p: Person, e: CalEvent): EventInfo => {
    const date = e.allDay ? e.start : wallDate(e.start);
    const lastDate = e.allDay ? addDays(e.end, -1) : wallDate(e.end);
    const when = e.allDay
      ? date === lastDate ? `${longDay(date)} · All day` : `${longDay(date)} – ${longDay(lastDate)}`
      : date === lastDate ? `${longDay(date)} · ${time(e.start)} – ${time(e.end)}` : `${longDay(date)} ${time(e.start)} – ${longDay(lastDate)} ${time(e.end)}`;
    return {
      owner: p.user_id, id: e.id, title: e.title, who: p.user_id === userId ? "You" : p.display_name, when, ooo: e.ooo,
      meetLink: e.meetLink, link: e.link, description: e.description, mine: e.mine, organizer: e.organizer,
      recurring: e.recurring, guests: e.guests, canChange: p.user_id === userId || isAdmin,
      allDay: e.allDay, date, lastDate, start: e.allDay ? "09:00" : wallTime(e.start), end: e.allDay ? "10:00" : wallTime(e.end),
    };
  };

  // One grid for everyone: all-day items on top, timed ones placed by the hour.
  const colors = memberColors(everyone.map((p) => p.user_id));
  const together: Record<string, WeekItem[]> = Object.fromEntries(days.map((d) => [d, []]));
  for (const p of people) {
    for (const e of cal.get(p.user_id)?.week ?? []) {
      for (const d of days) {
        if (!onDay(e, d)) continue;
        const s0 = new Date(e.start).getTime(), e0 = new Date(e.end).getTime();
        const d0 = dayStart(d), d1 = dayStart(addDays(d, 1));
        const whole = e.allDay || (s0 <= d0 && e0 >= d1);
        together[d].push({
          key: `${p.user_id}-${e.id}-${d}`,
          title: e.title,
          who: p.user_id === userId ? "You" : p.display_name.split(" ")[0],
          color: colors.get(p.user_id) ?? 0,
          ooo: e.ooo,
          timeLabel: label(e, d),
          info: infoFor(p, e),
          ...(whole ? {} : { start: (Math.max(s0, d0) - d0) / 60_000, end: (Math.min(e0, d1) - d0) / 60_000 }),
        });
      }
    }
  }
  const legend = people.filter((p) => connected.has(p.user_id)).map((p) => ({ name: p.user_id === userId ? "You" : p.display_name, color: colors.get(p.user_id) ?? 0 }));
  const q = (params: Record<string, string>) =>
    `/team/calendar?${new URLSearchParams({ ...(picked ? { date: anchor } : {}), ...(view === "people" ? { view } : {}), ...(range !== "week" ? { range } : {}), ...params })}`;
  const heading = range === "day"
    ? dayLabel(anchor, { weekday: "long", month: "long", day: "numeric" })
    : range === "week"
      ? `${dayLabel(days[0], { month: "short", day: "numeric" })} – ${dayLabel(days[6], { month: days[0].slice(5, 7) === days[6].slice(5, 7) ? undefined : "short", day: "numeric" })}`
      : dayLabel(monthFirst, { month: "long", year: "numeric" });

  const whosOut = everyone.flatMap((p) => (cal.get(p.user_id)?.out ?? []).map((e) => ({ p, e }))).sort((a, b) => a.e.start.localeCompare(b.e.start));
  const iAmConnected = connected.has(userId);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{isAdmin ? "Everyone" : "Your calendar"} · {heading}</p>
          <h1 style={{ marginTop: 6 }}>Calendar</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <nav className="view-switch" aria-label="Range">
            <Link href={q({ range: "day" })} aria-current={range === "day" ? "page" : undefined}>Day</Link>
            <Link href={q({ range: "week" })} aria-current={range === "week" ? "page" : undefined}>Week</Link>
            <Link href={q({ range: "month" })} aria-current={range === "month" ? "page" : undefined}>Month</Link>
          </nav>
          {isAdmin && range !== "month" && (
            <nav className="view-switch" aria-label="View">
              <Link href={q({ view: "together" })} aria-current={view === "together" ? "page" : undefined}>Together</Link>
              <Link href={q({ view: "people" })} aria-current={view === "people" ? "page" : undefined}>By person</Link>
            </nav>
          )}
          <Link className="btn sm line" href={q({ date: step.prev })} aria-label={`Previous ${range}`}>←</Link>
          <Link className="btn sm line" href={q({ date: today })}>Today</Link>
          <Link className="btn sm line" href={q({ date: step.next })} aria-label={`Next ${range}`}>→</Link>
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

      {range === "month" ? (
        <MonthGrid
          days={days}
          month={anchor.slice(0, 7)}
          today={today}
          items={together}
          legend={legend}
          dayHref={(d) => q({ date: d, range: "day" })}
        />
      ) : view === "together" ? (
        <TogetherWeek
          days={days.map((d) => ({ date: d, weekday: dayLabel(d, { weekday: "short" }), label: dayLabel(d, { month: "short", day: "numeric" }) }))}
          today={today}
          nowMinutes={nowMinutes}
          items={together}
          legend={legend}
        />
      ) : (
      <div className="sched-wrap">
        <table className={`sched ${days.length === 1 ? "one" : ""}`}>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Person</span></th>
              {days.map((d) => (
                <th scope="col" key={d} className={d === today ? "today" : ""} aria-current={d === today ? "date" : undefined}>
                  <small>{d === today ? `Today · ${dayLabel(d, { weekday: "short" })}` : dayLabel(d, { weekday: "short" })}</small> {dayLabel(d, { month: "short", day: "numeric" })}
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
                          <EventChip key={e.id} info={infoFor(p, e)} className={`ev ${e.ooo ? "ooo" : ""}`} title={e.title}>
                            {e.ooo ? <b>Out of office</b> : (
                              <>
                                <span className="ev-time">{label(e, d)}</span>
                                <span className="ev-title">{e.title}</span>
                              </>
                            )}
                          </EventChip>
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
      )}

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
