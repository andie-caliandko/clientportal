/** A contract's last day: start plus its length in months, minus a day. Jan 15 for 6 months → Jul 14. */
export function contractEnd(start: string, months: number) {
  const [y, m, d] = start.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(d, last));
  next.setUTCDate(next.getUTCDate() - 1);
  return next.toISOString().slice(0, 10);
}

/** The day a new term starts when this one is renewed: the day after it ends. */
export const renewalStart = (start: string, months: number) =>
  new Date(Date.parse(`${contractEnd(start, months)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * When to start the renewal conversation: the start of the second-to-last
 * month (month 5 of 6, month 11 of 12, month 2 of 3).
 */
export function renewalFlagDate(start: string, months: number) {
  const [y, m, d] = start.split("-").map(Number);
  const flag = new Date(Date.UTC(y, m - 1 + Math.max(0, months - 2), 1));
  const last = new Date(Date.UTC(flag.getUTCFullYear(), flag.getUTCMonth() + 1, 0)).getUTCDate();
  flag.setUTCDate(Math.min(d, last));
  return flag.toISOString().slice(0, 10);
}

export type ContractState = "upcoming" | "active" | "renewal" | "ending" | "ended" | "renewed";
export type ContractRow = { kind?: string | null; start_date: string; months: number | null; end_date?: string | null; status: string };

/** A one-time project's follow-up: two weeks before it wraps up. */
export const projectFollowUp = (end: string) => new Date(Date.parse(`${end}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);

/** The contract's last day. Ongoing contracts have none. */
export const endOf = (c: ContractRow) => (c.kind === "ongoing" ? null : c.kind === "project" ? c.end_date! : contractEnd(c.start_date, c.months ?? 1));

/** Whole months from the start to today, counting the current one (month 1 is the first). */
export function monthNumber(start: string, today: string) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.max(1, (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0) + 1);
}

/** Where a client is in their contract today: month X of Y, and whether it's time to talk renewal (or follow up). */
export function contractStatus(c: ContractRow, today: string) {
  // Ongoing: month to month, no end and no renewal flag.
  if (c.kind === "ongoing") {
    const ended = c.status === "ended";
    return {
      end: null as string | null, flag: null as string | null, month: monthNumber(c.start_date, today), totalMonths: null as number | null,
      daysLeft: Infinity, state: (ended ? "ended" : today < c.start_date ? "upcoming" : "active") as ContractState, progress: 1,
    };
  }
  const isProject = c.kind === "project";
  const end = endOf(c)!;
  const flag = isProject ? projectFollowUp(end) : renewalFlagDate(c.start_date, c.months ?? 1);
  const totalMonths = isProject ? Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / (30.44 * 86_400_000))) : c.months ?? 1;
  const [sy, sm, sd] = c.start_date.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const elapsed = (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0);
  const month = Math.min(totalMonths, Math.max(1, elapsed + 1));
  const daysLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  let state: ContractState;
  if (c.status === "renewed") state = "renewed";
  else if (c.status === "ended" || today > end) state = "ended";
  else if (today < c.start_date) state = "upcoming";
  else if (daysLeft <= 14) state = "ending";
  else if (today >= flag) state = "renewal";
  else state = "active";
  return { end, flag, month, totalMonths, daysLeft, state, progress: Math.max(0, Math.min(1, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`) + 86_400_000))) };
}
