import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/server";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = () => `${process.env.NEXT_PUBLIC_SITE_URL}/api/google/callback`;

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
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

async function accessToken(refreshToken: string) {
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
  return ((await res.json()) as { access_token: string }).access_token;
}

async function integration(agencyId: string) {
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

/**
 * A client's calls: events on the given calendars (usually their account
 * manager's) that include one of the client's contacts. Cached for 15 minutes.
 */
export const getClientMeetings = (agencyId: string, calendarIds: string[], emails: string[]) =>
  unstable_cache(
    async (): Promise<Meeting[]> => {
      const i = await integration(agencyId);
      const wanted = new Set(emails.map((e) => e.toLowerCase()));
      if (!i?.google_refresh_token || !wanted.size) return [];
      try {
        const token = await accessToken(i.google_refresh_token);
        const now = Date.now();
        const params = new URLSearchParams({
          timeMin: new Date(now - 90 * 86_400_000).toISOString(),
          timeMax: new Date(now + 120 * 86_400_000).toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        });
        const seen = new Map<string, Meeting>();
        for (const cal of [...new Set(calendarIds)]) {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (!res.ok) continue;
          const data = (await res.json()) as {
            items?: {
              id: string; summary?: string; status?: string; hangoutLink?: string;
              start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string };
              attendees?: { email?: string }[];
            }[];
          };
          for (const e of data.items ?? []) {
            if (e.status === "cancelled" || seen.has(e.id)) continue;
            if (!(e.attendees ?? []).some((a) => a.email && wanted.has(a.email.toLowerCase()))) continue;
            seen.set(e.id, {
              id: e.id,
              title: e.summary ?? "Meeting",
              start: e.start.dateTime ?? e.start.date!,
              end: e.end.dateTime ?? e.end.date!,
              allDay: !e.start.dateTime,
              meetLink: e.hangoutLink ?? null,
            });
          }
        }
        return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
      } catch (err) {
        console.error("Couldn't load client meetings from Google Calendar", err);
        return [];
      }
    },
    ["client-meetings", agencyId, ...calendarIds, ...emails],
    { revalidate: 900, tags: [`due-dates-${agencyId}`] },
  )();
