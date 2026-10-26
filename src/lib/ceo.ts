import type { Agency } from "./types";

/** The CEO dashboard is the owner's; they can share it with chosen admins. */
export function canSeeCeo(agency: Pick<Agency, "owner_id" | "ceo_shared_with">, userId: string, role: string) {
  if (agency.owner_id && agency.owner_id === userId) return true;
  return role === "admin" && (agency.ceo_shared_with ?? []).includes(userId);
}

export const isOwner = (agency: Pick<Agency, "owner_id">, userId: string) => !!agency.owner_id && agency.owner_id === userId;

/** "2026-10" → "2026-10-01", the key invoices are stored under. */
export const monthKeyDate = (month: string) => `${month}-01`;

/**
 * The day a month's invoice is due: their billing day, except in the month they
 * start, when it's never before their start date. Null when there's no billing day.
 */
export function dueDate(billingDay: number | null, month: string, start?: string | null) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startsThisMonth = !!start && start.slice(0, 7) === month;
  const startDay = startsThisMonth ? Number(start!.slice(8, 10)) : 0;
  if (!billingDay && !startsThisMonth) return null;
  const day = Math.min(last, Math.max(billingDay ?? 0, startDay));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Is a client's invoice for a month late? Late once its due date has passed and it's still unpaid.
 * Months before their retainer starts are never due.
 */
export function invoiceState(paid: boolean, billingDay: number | null, month: string, today: string, start?: string | null) {
  if (paid) return "paid" as const;
  if (start && start.slice(0, 7) > month) return "upcoming" as const;
  if (today.slice(0, 7) < month) return "upcoming" as const;
  if (today.slice(0, 7) > month) return "late" as const;
  const due = dueDate(billingDay, month, start);
  if (due && today > due) return "late" as const;
  return "due" as const;
}

/** Has a client started by a month? (No start date means they have.) */
export const startedBy = (start: string | null | undefined, month: string) => !start || start.slice(0, 7) <= month;
