import "server-only";
import { dateAtHour } from "./approval";
import { nextShootDate, planShootSteps, SERIES_HORIZON_DAYS, type ShootRepeat } from "./shoots";
import { createAdminClient } from "./supabase/server";

export type Shoot = {
  id: string; agency_id: string; client_id: string; shoot_date: string; start_time: string | null;
  location: string | null; details: string | null; repeat: ShootRepeat | null; series_id: string | null; status: string; created_by: string | null;
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
  const when = new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const rows = planShootSteps(shoot.shoot_date, todayIn(tz))
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
  let date = last.shoot_date, added = 0;
  while ((date = nextShootDate(date, last.repeat)) <= horizon && added < 24) {
    const { data: made } = await admin.from("content_shoots").insert({
      agency_id: last.agency_id, client_id: last.client_id, shoot_date: date, start_time: last.start_time, location: last.location,
      details: last.details, repeat: last.repeat, series_id: seriesId, created_by: last.created_by,
    }).select("*").single();
    if (made) await planShootTasks(made as Shoot);
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
