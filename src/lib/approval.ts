// Content approval deadlines.
//
// A client gets `hours` of clock time to approve a content calendar. When
// `skipWeekends` is on, Saturday and Sunday (in the agency's time zone) don't
// count: a link sent Thursday at 11 AM with a 48-hour window is due Monday at
// 11 AM. Anything sent on a weekend starts its clock Monday at 9 AM, so it's
// due Wednesday at 9 AM rather than at midnight.

const MINUTE = 60_000;

/** Wall-clock time in `tz`, expressed as a UTC timestamp (so getUTC* reads local fields). */
function toWall(instant: Date, tz: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return new Date(
    Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second),
  );
}

/** Real instant for a wall-clock time in `tz`. */
function fromWall(wall: Date, tz: string): Date {
  // Guess using the offset at the wall time, then correct once for DST shifts.
  let guess = new Date(wall.getTime() - (toWall(wall, tz).getTime() - wall.getTime()));
  const drift = toWall(guess, tz).getTime() - wall.getTime();
  if (drift !== 0) guess = new Date(guess.getTime() - drift);
  return guess;
}

export function approvalDueAt(
  sentAt: Date,
  { hours = 48, skipWeekends = true, timeZone = "America/New_York", weekendStartHour = 9 } = {},
): Date {
  if (!skipWeekends) return new Date(sentAt.getTime() + hours * 60 * MINUTE);

  const wall = toWall(sentAt, timeZone);
  // Sent on a weekend: start counting Monday morning.
  const startDay = wall.getUTCDay();
  if (startDay === 0 || startDay === 6) {
    const toMonday = startDay === 6 ? 2 : 1;
    wall.setTime(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + toMonday, weekendStartHour));
  }
  let left = hours * 60 * MINUTE;
  while (left > 0) {
    const day = wall.getUTCDay();
    const nextMidnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
    if (day === 0 || day === 6) {
      wall.setTime(nextMidnight);
      continue;
    }
    const step = Math.min(left, nextMidnight - wall.getTime());
    wall.setTime(wall.getTime() + step);
    left -= step;
  }
  return fromWall(wall, timeZone);
}

export function formatDue(due: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(due)
    .replace(/, (\d{1,2}:\d{2})/, " at $1");
}

/** A calendar date ("2026-10-02") at a wall-clock hour in the agency's time zone. */
export function dateAtHour(date: string, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return fromWall(new Date(Date.UTC(y, m - 1, d, hour)), timeZone);
}

/** Days after the due date (or assignment date) when overdue client tasks get a reminder. */
export const REMINDER_DAYS = [2, 5, 7];

/** How many reminders a task should have had by `now`. */
export function remindersDue(dueAt: Date, now: Date): number {
  const days = (now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000);
  return REMINDER_DAYS.filter((d) => days >= d).length;
}
