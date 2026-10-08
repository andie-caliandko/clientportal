export type RhythmWeek = { week: number; title: string; items: { title: string; detail?: string }[] };

/** Today's date parts in the agency's time zone. */
function today(timeZone: string, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

const DAY = 86_400_000;

/** The date (UTC midnight) of the first Monday of a month. */
function firstMonday(y: number, m: number) {
  const first = Date.UTC(y, m - 1, 1);
  const dow = new Date(first).getUTCDay(); // 0 = Sunday
  return first + ((8 - dow) % 7) * DAY;
}

/**
 * The rhythm month a day belongs to. Week 1 starts on the month's first Monday,
 * so days before it (say Oct 1–4 when Oct 5 is a Monday) are still last month's week 4.
 */
function rhythmMonth(y: number, m: number, d: number) {
  if (Date.UTC(y, m - 1, d) >= firstMonday(y, m)) return { y, m };
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

/** Which rhythm week (1–4) a day falls in: Monday to Sunday from the first Monday; week 4 runs until next month's first Monday. */
function weekFor(y: number, m: number, d: number) {
  const r = rhythmMonth(y, m, d);
  return { month: r, week: Math.min(4, Math.floor((Date.UTC(y, m - 1, d) - firstMonday(r.y, r.m)) / (7 * DAY)) + 1) };
}

/** This week of the monthly rhythm, in the agency's time zone. */
export function weekOfMonth(timeZone: string, now = new Date()) {
  const { y, m, d } = today(timeZone, now);
  return weekFor(y, m, d).week;
}

/** The rhythm month we're in (yyyy-mm-01), which check-offs are saved under. */
export function monthKey(timeZone: string, now = new Date()) {
  const { y, m, d } = today(timeZone, now);
  const r = rhythmMonth(y, m, d);
  return `${r.y}-${String(r.m).padStart(2, "0")}-01`;
}

/** "Oct 5–11", or "Oct 26–Nov 1" when a week crosses into the next month. */
export function weekRange(week: number, timeZone: string, now = new Date()) {
  const { y, m, d } = today(timeZone, now);
  const r = rhythmMonth(y, m, d);
  const start = firstMonday(r.y, r.m) + (week - 1) * 7 * DAY;
  const next = r.m === 12 ? firstMonday(r.y + 1, 1) : firstMonday(r.y, r.m + 1);
  const end = week < 4 ? start + 6 * DAY : next - DAY;
  const mo = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = (t: number) => new Date(t).getUTCDate();
  return mo(start) === mo(end) ? `${mo(start)} ${day(start)}–${day(end)}` : `${mo(start)} ${day(start)}–${mo(end)} ${day(end)}`;
}

export type DueItem = { id: string; title: string; label: string; daysAway: number; week: number | null };

/** Turns calendar events into "Wed, Oct 21 · in 3 days" items, tagged with their rhythm week if they fall in this rhythm month. */
export function describeDueDates(events: { id: string; title: string; date: string; allDay: boolean }[], timeZone: string, now = new Date()): DueItem[] {
  const t = today(timeZone, now);
  const current = rhythmMonth(t.y, t.m, t.d);
  const todayUtc = Date.UTC(t.y, t.m - 1, t.d);
  return events.map((e) => {
    const [y, m, d] = e.allDay
      ? e.date.slice(0, 10).split("-").map(Number)
      : new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
          .format(new Date(e.date))
          .split("-")
          .map(Number);
    const dayUtc = Date.UTC(y, m - 1, d);
    return {
      id: e.id,
      title: e.title,
      label: new Date(dayUtc).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      daysAway: Math.round((dayUtc - todayUtc) / 86_400_000),
      week: (() => {
        const w = weekFor(y, m, d);
        return w.month.y === current.y && w.month.m === current.m ? w.week : null;
      })(),
    };
  });
}
