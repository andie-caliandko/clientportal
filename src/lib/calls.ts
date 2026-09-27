import "server-only";
import { dateAtHour } from "./approval";
import { memberBusy, memberBusyNow, memberEvent } from "./google";
import { openSlots } from "./slots";
import { createAdminClient } from "./supabase/server";

export type CallRequest = {
  id: string; agency_id: string; client_id: string; host_id: string; title: string; note: string | null;
  duration_min: number; window_start: string; window_end: string; status: "open" | "booked" | "cancelled";
  event_id: string | null; event_start: string | null; event_end: string | null; meet_link: string | null;
  /** "pick": the client chose a time. "invite": the team sent an invite for a set time. */
  kind: "pick" | "invite";
  accepted_at: string | null;
  guests: string[];
  created_at: string;
};

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Open times for a call request, from the host's bookable hours and Google free/busy. */
export async function requestSlots(req: CallRequest, timeZone: string, opts: { fresh?: boolean } = {}): Promise<string[]> {
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
  const busy = await (opts.fresh ? memberBusyNow : memberBusy)(req.host_id, dateAtHour(from, 0, timeZone).toISOString(), dateAtHour(addDays(to, 1), 0, timeZone).toISOString());
  if (!busy) return [];
  return openSlots(
    { from, to, timeZone, days: host.book_days, startHour: host.book_start, endHour: host.book_end, durationMin: req.duration_min, stepMin: 30, noticeHours: 12 },
    busy,
  );
}

export type Meeting = { id: string; title: string; start: string; end: string; meetLink: string | null };

/**
 * The calls a client has said yes to: ones they booked here, and invites one of
 * their contacts accepted in Google. Nothing else from the team's calendars
 * shows. Upcoming calls are checked against Google, so a call moved or
 * cancelled there shows that way here.
 */
export async function bookedMeetings(clientId: string): Promise<{ upcoming: Meeting[]; past: Meeting[] }> {
  const admin = createAdminClient();
  const [{ data }, { data: contacts }] = await Promise.all([
    admin.from("call_requests").select("*").eq("client_id", clientId).eq("status", "booked").not("event_start", "is", null).order("event_start", { ascending: true }),
    admin.from("client_users").select("email").eq("client_id", clientId),
  ]);
  const rows = (data ?? []) as CallRequest[];
  const theirs = new Set((contacts ?? []).map((c) => c.email.toLowerCase()));
  const now = Date.now();

  const checked = await Promise.all(
    rows.map(async (r): Promise<Meeting | null> => {
      const saved: Meeting = { id: r.id, title: r.title, start: r.event_start!, end: r.event_end!, meetLink: r.meet_link };
      const upcoming = new Date(r.event_end!).getTime() >= now;
      const waitingOnYes = r.kind === "invite" && !r.accepted_at;
      // Past calls they already said yes to don't need another look at Google.
      if (!upcoming && !waitingOnYes) return saved;
      const live = r.event_id ? await memberEvent(r.host_id, r.event_id) : undefined;
      if (live === undefined) return waitingOnYes ? null : saved;
      if (live === null) {
        await admin.from("call_requests").update({ status: "cancelled" }).eq("id", r.id);
        return null;
      }
      const changes: Record<string, unknown> = {};
      if (waitingOnYes) {
        if (!live.attendees.some((a) => theirs.has(a.email) && a.response === "accepted")) return null;
        changes.accepted_at = new Date().toISOString();
      }
      const start = new Date(live.start).toISOString(), end = new Date(live.end).toISOString();
      if (start !== new Date(r.event_start!).toISOString() || end !== new Date(r.event_end!).toISOString() || live.meetLink !== r.meet_link) {
        Object.assign(changes, { event_start: start, event_end: end, meet_link: live.meetLink });
      }
      if (Object.keys(changes).length) await admin.from("call_requests").update(changes).eq("id", r.id);
      return { id: r.id, title: r.title, start, end, meetLink: live.meetLink };
    }),
  );
  const yes = checked.filter((m): m is Meeting => !!m);
  return {
    upcoming: yes.filter((m) => new Date(m.end).getTime() >= now),
    past: yes.filter((m) => new Date(m.end).getTime() < now).reverse().slice(0, 10),
  };
}

/** Who has replied to a direct invite, from Google. Null when we couldn't check. */
export async function inviteReplies(r: CallRequest) {
  if (!r.event_id) return null;
  const live = await memberEvent(r.host_id, r.event_id);
  if (!live) return null;
  const count = (response: string) => live.attendees.filter((a) => a.response === response).length;
  return { accepted: count("accepted"), declined: count("declined"), total: live.attendees.length };
}
