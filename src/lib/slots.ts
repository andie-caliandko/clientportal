import { dateAtMinute } from "./approval";

export type Busy = { start: string; end: string };

export type SlotRules = {
  /** First and last day clients may pick ("2026-10-05"), inclusive. */
  from: string;
  to: string;
  timeZone: string;
  /** Bookable weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Bookable hours in the time zone, e.g. 9 and 17. */
  startHour: number;
  endHour: number;
  durationMin: number;
  /** Start times are this many minutes apart. */
  stepMin?: number;
  /** No calls sooner than this many hours from now. */
  noticeHours?: number;
  now?: Date;
};

const DAY = 86_400_000;

/** Open start times (ISO) inside the rules that don't overlap anything busy. */
export function openSlots(rules: SlotRules, busy: Busy[]): string[] {
  const { from, to, timeZone, days, startHour, endHour, durationMin, stepMin = 30, noticeHours = 12, now = new Date() } = rules;
  const earliest = now.getTime() + noticeHours * 3_600_000;
  const taken = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const out: string[] = [];
  const last = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= last; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!days.includes(new Date(t).getUTCDay())) continue;
    for (let m = startHour * 60; m + durationMin <= endHour * 60; m += stepMin) {
      const start = dateAtMinute(date, m, timeZone).getTime();
      const end = start + durationMin * 60_000;
      if (start < earliest) continue;
      if (taken.some(([bs, be]) => start < be && end > bs)) continue;
      out.push(new Date(start).toISOString());
    }
  }
  return out;
}
