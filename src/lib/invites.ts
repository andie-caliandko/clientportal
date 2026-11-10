/** How long a portal invite link works. */
export const INVITE_DAYS = 7;
/** The reminder goes out this many days before the link expires. */
export const REMIND_DAYS_BEFORE = 2;

const DAY = 86_400_000;

/** When an invite sent now expires. */
export const inviteExpiry = (from = new Date()) => new Date(from.getTime() + INVITE_DAYS * DAY);

/** The one reminder is due 2 days before the link expires, as long as it hasn't expired yet or been sent. */
export function inviteReminderDue(expiresAt: string | null, reminders: number, now = new Date()) {
  if (!expiresAt || reminders > 0) return false;
  const end = new Date(expiresAt).getTime();
  return now.getTime() >= end - REMIND_DAYS_BEFORE * DAY && now.getTime() < end;
}

/** Why an invite link can't be used, if it can't. */
export function inviteProblem(row: { joined_at: string | null; invite_expires_at: string | null } | null, now = new Date()): "invalid" | "joined" | "expired" | null {
  if (!row) return "invalid";
  if (row.joined_at) return "joined";
  if (!row.invite_expires_at || new Date(row.invite_expires_at).getTime() <= now.getTime()) return "expired";
  return null;
}
