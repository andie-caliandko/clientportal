import "server-only";
import { dateAtHour } from "./approval";
import { calendarChanged, createMemberAllDayEvent, deleteMemberEvent, updateMemberEvent } from "./google";
import { addDays, daysBetween, nextShootDate, planShootSteps, SERIES_HORIZON_DAYS, shootDates, timeLabel, type ShootRepeat } from "./shoots";
import { createAdminClient } from "./supabase/server";

export type Shoot = {
  id: string; agency_id: string; client_id: string; shoot_date: string; start_time: string | null;
  end_date?: string | null; location: string | null; details: string | null; repeat: ShootRepeat | null; series_id: string | null; status: string; created_by: string | null;
  crew?: string[] | null; photographer?: string | null;
};

const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

async function agencyTz(agencyId: string) {
  const { data } = await createAdminClient().from("agencies").select("timezone").eq("id", agencyId).maybeSingle();
  return data?.timezone ?? "America/New_York";
}

/**
 * (Re)make a shoot's planning tasks for the client's account manager. Open ones are
 * replaced; steps already checked off stay done and aren't made again.
 */
export async function planShootTasks(shoot: Shoot) {
  const admin = createAdminClient();
  const tz = await agencyTz(shoot.agency_id);
  const [{ data: client }, { data: existing }] = await Promise.all([
    admin.from("clients").select("name, account_manager_id").eq("id", shoot.client_id).maybeSingle(),
    admin.from("tasks").select("id, title, status").eq("shoot_id", shoot.id),
  ]);
  const done = new Set((existing ?? []).filter((t) => t.status === "done").map((t) => t.title.split(" · ")[0]));
  const open = (existing ?? []).filter((t) => t.status !== "done").map((t) => t.id);
  if (open.length) await admin.from("tasks").delete().in("id", open);
  if (shoot.status !== "scheduled") return;
  const when = shootDates(shoot.shoot_date, shoot.end_date);
  const rows = planShootSteps(shoot.shoot_date, todayIn(tz), shoot.end_date)
    .filter((s) => !done.has(s.title))
    .map((s) => ({
      agency_id: shoot.agency_id, client_id: shoot.client_id, assignee_id: client?.account_manager_id ?? null,
      title: `${s.title} · ${when} shoot`, note: s.note, source: "shoot", auto: true, shoot_id: shoot.id,
      due_at: dateAtHour(s.due, 17, tz).toISOString(),
      show_from: s.showFrom ? dateAtHour(s.showFrom, 8, tz).toISOString() : null,
    }));
  if (rows.length) await admin.from("tasks").insert(rows);
}

/**
 * Keep a repeating series scheduled ahead (SERIES_HORIZON_DAYS), copying the latest
 * shoot's time, place and details. Returns how many shoots were added.
 */
export async function extendSeries(seriesId: string) {
  const admin = createAdminClient();
  const { data: latest } = await admin.from("content_shoots").select("*").eq("series_id", seriesId).order("shoot_date", { ascending: false }).limit(1).maybeSingle();
  const last = latest as Shoot | null;
  if (!last?.repeat) return 0;
  const tz = await agencyTz(last.agency_id);
  const horizon = new Date(Date.parse(`${todayIn(tz)}T00:00:00Z`) + SERIES_HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
  // Each shoot in the series lasts as many days as the latest one.
  const length = last.end_date ? daysBetween(last.shoot_date, last.end_date) : 0;
  let date = last.shoot_date, added = 0;
  while ((date = nextShootDate(date, last.repeat)) <= horizon && added < 24) {
    const { data: made } = await admin.from("content_shoots").insert({
      agency_id: last.agency_id, client_id: last.client_id, shoot_date: date, end_date: length > 0 ? addDays(date, length) : null, start_time: last.start_time, location: last.location,
      details: last.details, repeat: last.repeat, series_id: seriesId, created_by: last.created_by,
      crew: last.crew ?? [], photographer: last.photographer ?? null,
    }).select("*").single();
    if (made) {
      await planShootTasks(made as Shoot);
      await syncShootCalendars(made.id);
    }
    added++;
  }
  return added;
}

/** Daily: every repeating series stays scheduled ahead. */
export async function extendAllSeries() {
  const admin = createAdminClient();
  const { data } = await admin.from("content_shoots").select("series_id").not("repeat", "is", null).not("series_id", "is", null).eq("status", "scheduled");
  let added = 0;
  for (const id of new Set((data ?? []).map((r) => r.series_id as string))) added += await extendSeries(id);
  return added;
}

/**
 * Put a shoot on the Google Calendar of each teammate going (all-day, across the shoot's days),
 * move it when the shoot moves, and take it off for anyone no longer going or if it's cancelled.
 * Teammates without a connected calendar are skipped. Never throws: a calendar hiccup mustn't block saving.
 */
export async function syncShootCalendars(shootId: string) {
  const admin = createAdminClient();
  const [{ data: row }, { data: existing }] = await Promise.all([
    admin.from("content_shoots").select("*, clients(name)").eq("id", shootId).maybeSingle(),
    admin.from("shoot_calendar_events").select("user_id, event_id").eq("shoot_id", shootId),
  ]);
  const shoot = row as (Shoot & { clients: { name: string } | null }) | null;
  const going = new Set(shoot && shoot.status === "scheduled" ? shoot.crew ?? [] : []);
  const had = new Map((existing ?? []).map((e) => [e.user_id as string, e.event_id as string]));
  const touched = new Set<string>();

  for (const [userId, eventId] of had) {
    if (going.has(userId)) continue;
    try { await deleteMemberEvent(userId, eventId); } catch { /* already gone or calendar disconnected */ }
    await admin.from("shoot_calendar_events").delete().eq("shoot_id", shootId).eq("user_id", userId);
    touched.add(userId);
  }
  if (shoot && going.size) {
    const { data: connected } = await admin.from("member_google").select("user_id").in("user_id", [...going]);
    const last = shoot.end_date && shoot.end_date > shoot.shoot_date ? shoot.end_date : shoot.shoot_date;
    const tz = await agencyTz(shoot.agency_id);
    const title = `Content shoot: ${shoot.clients?.name ?? "Client"}${shoot.start_time ? ` · ${timeLabel(shoot.start_time)}` : ""}`;
    const description = [
      shoot.location && `Location: ${shoot.location}`,
      shoot.photographer && `Photographer: ${shoot.photographer}`,
      shoot.details,
      `Shoot plan: ${process.env.NEXT_PUBLIC_SITE_URL ?? "https://clients.cali-ko.com"}/team/shoots/${shoot.id}`,
    ].filter(Boolean).join("\n");
    for (const { user_id: userId } of connected ?? []) {
      try {
        const eventId = had.get(userId);
        if (eventId) {
          await updateMemberEvent(userId, eventId, { title, description, timeZone: tz, allDay: { from: shoot.shoot_date, toExclusive: addDays(last, 1) } });
        } else {
          const made = await createMemberAllDayEvent(userId, { title, description, from: shoot.shoot_date, toExclusive: addDays(last, 1) });
          await admin.from("shoot_calendar_events").upsert({ shoot_id: shootId, user_id: userId, event_id: made.id });
        }
        touched.add(userId);
      } catch (err) {
        console.error("Couldn't put a shoot on a calendar", err);
      }
    }
  }
  for (const userId of touched) calendarChanged(userId);
}

/** Take shoots off everyone's calendars before they're deleted. */
export async function clearShootCalendars(shootIds: string[]) {
  if (!shootIds.length) return;
  const admin = createAdminClient();
  const { data } = await admin.from("shoot_calendar_events").select("user_id, event_id").in("shoot_id", shootIds);
  for (const e of data ?? []) {
    try { await deleteMemberEvent(e.user_id, e.event_id); } catch { /* already gone */ }
    calendarChanged(e.user_id);
  }
}
