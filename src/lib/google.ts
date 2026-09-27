import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/server";

// Calendar: read due dates and schedules, and add events (client calls, time
// off) to the connected person's own calendar. Drive (agency connection only):
// file client uploads into each client's folder.
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];
const AGENCY_SCOPES = [...CALENDAR_SCOPES, "https://www.googleapis.com/auth/drive"];

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = () => `${process.env.NEXT_PUBLIC_SITE_URL}/api/google/callback`;

/** "agency": an admin connects the agency account (also their own calendar). "member": a teammate connects their calendar. */
export function googleAuthUrl(state: string, purpose: "agency" | "member" = "agency") {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: (purpose === "agency" ? AGENCY_SCOPES : CALENDAR_SCOPES).join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const data = (await res.json()) as { refresh_token?: string; id_token?: string };
  const email = data.id_token ? JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString()).email : null;
  return { refreshToken: data.refresh_token ?? null, email: email as string | null };
}

// Access tokens last an hour; reuse them instead of refreshing on every call.
const tokens = new Map<string, { value: string; expires: number }>();

export async function accessToken(refreshToken: string) {
  const hit = tokens.get(refreshToken);
  if (hit && hit.expires > Date.now()) return hit.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(refreshToken, { value: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000 });
  return data.access_token;
}

export async function integration(agencyId: string) {
  const { data } = await createAdminClient()
    .from("agency_integrations")
    .select("google_email, google_refresh_token, deadlines_calendar_id, deadlines_calendar_name")
    .eq("agency_id", agencyId)
    .maybeSingle();
  return data;
}

export async function googleStatus(agencyId: string) {
  const i = await integration(agencyId);
  return {
    connected: !!i?.google_refresh_token,
    email: i?.google_email ?? null,
    calendarId: i?.deadlines_calendar_id ?? null,
    calendarName: i?.deadlines_calendar_name ?? null,
  };
}

export async function listCalendars(agencyId: string) {
  const i = await integration(agencyId);
  if (!i?.google_refresh_token) return [];
  const token = await accessToken(i.google_refresh_token);
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: { id: string; summary: string; description?: string }[] };
  return (data.items ?? []).map((c) => ({ id: c.id, name: c.summary, description: c.description ?? "" }));
}

export type DueDate = { id: string; title: string; date: string; allDay: boolean };

/**
 * Upcoming events on the agency's due-dates calendar. Google expands repeating
 * events (and the one-off moves you make to them) for us. Cached for 15 minutes.
 */
export const getDueDates = (agencyId: string, fromIso: string, toIso: string) =>
  unstable_cache(
    async (): Promise<DueDate[]> => {
      const i = await integration(agencyId);
      if (!i?.google_refresh_token || !i.deadlines_calendar_id) return [];
      try {
        const token = await accessToken(i.google_refresh_token);
        const params = new URLSearchParams({
          timeMin: fromIso,
          timeMax: toIso,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        });
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(i.deadlines_calendar_id)}/events?${params}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          items?: { id: string; summary?: string; status?: string; start: { date?: string; dateTime?: string } }[];
        };
        return (data.items ?? [])
          .filter((e) => e.status !== "cancelled")
          .map((e) => ({
            id: e.id,
            title: e.summary ?? "Untitled",
            date: e.start.date ?? e.start.dateTime!,
            allDay: !!e.start.date,
          }));
      } catch (err) {
        console.error("Couldn't load due dates from Google Calendar", err);
        return [];
      }
    },
    ["due-dates", agencyId, fromIso.slice(0, 10), toIso.slice(0, 10)],
    { revalidate: 900, tags: [`due-dates-${agencyId}`] },
  )();

export type Meeting = { id: string; title: string; start: string; end: string; allDay: boolean; meetLink: string | null };

// ---------------------------------------------------------------------------
// Each teammate's own calendar
// ---------------------------------------------------------------------------

/** Which teammates have connected their Google Calendar (user id → Google email). */
export async function connectedMembers(agencyId: string): Promise<Map<string, string | null>> {
  const { data } = await createAdminClient().from("member_google").select("user_id, google_email").eq("agency_id", agencyId);
  return new Map((data ?? []).map((r) => [r.user_id, r.google_email]));
}

async function memberAuth(userId: string) {
  const { data } = await createAdminClient().from("member_google").select("refresh_token, google_email").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { token: await accessToken(data.refresh_token), email: data.google_email as string | null };
}

async function gcal<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

type GEvent = {
  id: string; summary?: string; status?: string; eventType?: string; hangoutLink?: string; htmlLink?: string;
  transparency?: string;
  start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string };
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
};

export type CalEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean;
  /** Out of office: Google's Out of office events, or anything titled OOO / PTO / vacation. */
  ooo: boolean;
  meetLink: string | null;
  link: string | null;
};

const OOO_WORDS = /\b(ooo|out of (the )?office|pto|vacation|time off|holiday)\b/i;

function toCalEvent(e: GEvent): CalEvent {
  return {
    id: e.id,
    title: e.summary ?? (e.eventType === "outOfOffice" ? "Out of office" : "Busy"),
    start: e.start.dateTime ?? e.start.date!,
    end: e.end.dateTime ?? e.end.date!,
    allDay: !e.start.dateTime,
    ooo: e.eventType === "outOfOffice" || OOO_WORDS.test(e.summary ?? ""),
    meetLink: e.hangoutLink ?? null,
    link: e.htmlLink ?? null,
  };
}

/** A teammate's events between two times, from their main Google Calendar. Null if not connected. */
export async function memberEvents(userId: string, fromIso: string, toIso: string): Promise<CalEvent[] | null> {
  const auth = await memberAuth(userId);
  if (!auth) return null;
  const params = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const data = await gcal<{ items?: GEvent[] }>(auth.token, `/calendars/primary/events?${params}`);
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.eventType !== "workingLocation")
    // Hide invitations they've declined.
    .filter((e) => !(e.attendees ?? []).some((a) => a.self && a.responseStatus === "declined"))
    .map(toCalEvent);
}

/** When a teammate is busy (their main calendar), for offering open times to clients. */
export async function memberBusy(userId: string, fromIso: string, toIso: string) {
  const auth = await memberAuth(userId);
  if (!auth) return null;
  const data = await gcal<{ calendars: Record<string, { busy?: { start: string; end: string }[] }> }>(auth.token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: "primary" }] }),
  });
  return Object.values(data.calendars ?? {}).flatMap((c) => c.busy ?? []);
}

/** Adds an event to a teammate's own calendar. With `attendees`, Google emails them the invite. */
export async function createMemberEvent(userId: string, input: {
  title: string; description?: string; start: string; end: string; timeZone: string;
  attendees?: string[]; meet?: boolean;
}) {
  const auth = await memberAuth(userId);
  if (!auth) throw new Error("Google Calendar isn't connected.");
  const body = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.start, timeZone: input.timeZone },
    end: { dateTime: input.end, timeZone: input.timeZone },
    attendees: input.attendees?.map((email) => ({ email })),
    ...(input.meet ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
  const params = new URLSearchParams({ sendUpdates: input.attendees?.length ? "all" : "none", ...(input.meet ? { conferenceDataVersion: "1" } : {}) });
  return toCalEvent(await gcal<GEvent>(auth.token, `/calendars/primary/events?${params}`, { method: "POST", body: JSON.stringify(body) }));
}

/**
 * Marks a teammate out of office from `start` to `end`. Uses Google's own Out
 * of office event (which declines new meetings for them); accounts that don't
 * support it get a regular all-day "Out of office" event instead.
 */
export async function createOutOfOffice(userId: string, input: { start: string; end: string; timeZone: string; message?: string; allDay: { from: string; to: string } }) {
  const auth = await memberAuth(userId);
  if (!auth) throw new Error("Google Calendar isn't connected.");
  try {
    return toCalEvent(await gcal<GEvent>(auth.token, "/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({
        summary: "Out of office",
        eventType: "outOfOffice",
        start: { dateTime: input.start, timeZone: input.timeZone },
        end: { dateTime: input.end, timeZone: input.timeZone },
        transparency: "opaque",
        outOfOfficeProperties: { autoDeclineMode: "declineOnlyNewConflictingInvitations", declineMessage: input.message || "I'm out of the office." },
      }),
    }));
  } catch {
    return toCalEvent(await gcal<GEvent>(auth.token, "/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({ summary: "Out of office", description: input.message, start: { date: input.allDay.from }, end: { date: input.allDay.to }, transparency: "opaque" }),
    }));
  }
}

/**
 * A client's calls: events on their team's calendars that include one of the
 * client's contacts. Cached for 5 minutes.
 */
export const getClientMeetings = (agencyId: string, hostIds: string[], emails: string[]) =>
  unstable_cache(
    async (): Promise<Meeting[]> => {
      const wanted = new Set(emails.map((e) => e.toLowerCase()));
      if (!wanted.size) return [];
      const now = Date.now();
      const from = new Date(now - 90 * 86_400_000).toISOString();
      const to = new Date(now + 120 * 86_400_000).toISOString();
      const seen = new Map<string, Meeting>();
      for (const host of [...new Set(hostIds)]) {
        try {
          const auth = await memberAuth(host);
          if (!auth) continue;
          const params = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
          const data = await gcal<{ items?: GEvent[] }>(auth.token, `/calendars/primary/events?${params}`);
          for (const e of data.items ?? []) {
            if (e.status === "cancelled" || !(e.attendees ?? []).some((a) => a.email && wanted.has(a.email.toLowerCase()))) continue;
            const ev = toCalEvent(e);
            // The same call can be on several teammates' calendars; show it once.
            const key = `${ev.start}|${ev.title}`;
            if (!seen.has(key)) seen.set(key, { id: ev.id, title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay, meetLink: ev.meetLink });
          }
        } catch (err) {
          console.error("Couldn't load a teammate's calendar", err);
        }
      }
      return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
    },
    ["client-meetings-v2", agencyId, ...hostIds, ...emails],
    { revalidate: 300, tags: [`meetings-${agencyId}`] },
  )();
