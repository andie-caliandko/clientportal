/** "1:30", "1.5", "1h 30m", "90m" or "90" (minutes) → minutes. Null if it isn't a length of time. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):([0-5]\d)$/))) return +m[1] * 60 + +m[2];
  if ((m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/)) && (m[1] || m[2])) {
    return Math.round((m[1] ? +m[1] * 60 : 0) + (m[2] ? +m[2] : 0));
  }
  if ((m = t.match(/^\d+(?:\.\d+)?$/))) return t.includes(".") ? Math.round(+t * 60) : +t;
  return null;
}

/** 95 → "1:35", for totals. */
export function formatMinutes(total: number) {
  const mins = Math.max(0, Math.round(total));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

/** Minutes between two times (a running timer counts up to now). */
export function minutesBetween(start: string, end: string | null, now = Date.now()) {
  return Math.max(0, ((end ? new Date(end).getTime() : now) - new Date(start).getTime()) / 60_000);
}
