import type { Agency } from "./types";

/** The CEO dashboard is the owner's; they can share it with chosen admins. */
export function canSeeCeo(agency: Pick<Agency, "owner_id" | "ceo_shared_with">, userId: string, role: string) {
  if (agency.owner_id && agency.owner_id === userId) return true;
  return role === "admin" && (agency.ceo_shared_with ?? []).includes(userId);
}

export const isOwner = (agency: Pick<Agency, "owner_id">, userId: string) => !!agency.owner_id && agency.owner_id === userId;

/** "2026-10" → "2026-10-01", the key invoices are stored under. */
export const monthKeyDate = (month: string) => `${month}-01`;

/** Is a client's invoice late this month? Late once their billing day has passed and it's still unpaid. */
export function invoiceState(paid: boolean, billingDay: number | null, month: string, today: string) {
  if (paid) return "paid" as const;
  if (today.slice(0, 7) > month) return "late" as const;
  if (today.slice(0, 7) < month) return "upcoming" as const;
  if (billingDay && Number(today.slice(8, 10)) > billingDay) return "late" as const;
  return "due" as const;
}
