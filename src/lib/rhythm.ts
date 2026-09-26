export type RhythmWeek = { week: number; title: string; items: { title: string; detail?: string }[] };

/** Today's date parts in the agency's time zone. */
function today(timeZone: string, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

/** Days 1-7 are week 1, 8-14 week 2, 15-21 week 3, and 22 to the end of the month week 4. */
export function weekOfMonth(timeZone: string, now = new Date()) {
  return Math.min(4, Math.ceil(today(timeZone, now).d / 7));
}

/** First day of the current month in the agency's time zone, as yyyy-mm-01. */
export function monthKey(timeZone: string, now = new Date()) {
  const { y, m } = today(timeZone, now);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function weekRange(week: number, timeZone: string, now = new Date()) {
  const { y, m } = today(timeZone, now);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${week * 7 - 6}–${week === 4 ? last : week * 7}`;
}

export type DueItem = { id: string; title: string; label: string; daysAway: number; week: number | null };

/** Turns calendar events into "Wed, Oct 21 · in 3 days" items, tagged with their week if they fall this month. */
export function describeDueDates(events: { id: string; title: string; date: string; allDay: boolean }[], timeZone: string, now = new Date()): DueItem[] {
  const t = today(timeZone, now);
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
      week: y === t.y && m === t.m ? Math.min(4, Math.ceil(d / 7)) : null,
    };
  });
}
