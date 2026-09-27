import "server-only";
import { dateAtHour } from "./approval";
import { memberBusy } from "./google";
import { openSlots } from "./slots";
import { createAdminClient } from "./supabase/server";

export type CallRequest = {
  id: string; agency_id: string; client_id: string; host_id: string; title: string; note: string | null;
  duration_min: number; window_start: string; window_end: string; status: "open" | "booked" | "cancelled";
  event_id: string | null; event_start: string | null; event_end: string | null; meet_link: string | null;
  created_at: string;
};

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Open times for a call request, from the host's bookable hours and Google free/busy. */
export async function requestSlots(req: CallRequest, timeZone: string): Promise<string[]> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const from = req.window_start > today ? req.window_start : today;
  // Never look more than 5 weeks out.
  const to = [req.window_end, addDays(from, 35)].sort()[0];
  if (to < from) return [];
  const { data: host } = await createAdminClient()
    .from("agency_members")
    .select("book_start, book_end, book_days")
    .eq("user_id", req.host_id)
    .maybeSingle();
  if (!host) return [];
  const busy = await memberBusy(req.host_id, dateAtHour(from, 0, timeZone).toISOString(), dateAtHour(addDays(to, 1), 0, timeZone).toISOString());
  if (!busy) return [];
  return openSlots(
    { from, to, timeZone, days: host.book_days, startHour: host.book_start, endHour: host.book_end, durationMin: req.duration_min, stepMin: 30, noticeHours: 12 },
    busy,
  );
}
