/** When the next invite reminder is due: 48 hours after the invite, then a week after that. Null once both are sent. */
export function nextInviteReminder(invitedAt: string, reminders: number, lastReminder: string | null): Date | null {
  if (reminders === 0) return new Date(new Date(invitedAt).getTime() + 48 * 3_600_000);
  if (reminders === 1) return new Date(new Date(lastReminder ?? invitedAt).getTime() + 7 * 86_400_000);
  return null;
}
