"use server";

import { revalidatePath } from "next/cache";
import { dateAtMinute } from "@/lib/approval";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/time";

type Result = { error?: string; ok?: string };

const refresh = () => revalidatePath("/team", "layout");
const clientOrNull = (v: FormDataEntryValue | null) => (v && String(v) !== "internal" ? String(v) : null);

/** Start a timer (stopping any that's already running). */
export async function startTimer(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("time_entries").update({ ended_at: now }).eq("user_id", v.userId).is("ended_at", null);
  const { error } = await supabase.from("time_entries").insert({
    agency_id: v.agency.id, user_id: v.userId, client_id: clientOrNull(form.get("client")),
    description: String(form.get("description") ?? "").trim(), started_at: now,
  });
  if (error) return { error: "The timer didn't start. Try again." };
  refresh();
  return { ok: "Timer started." };
}

export async function stopTimer(): Promise<Result> {
  const v = await requireTeam();
  const supabase = await createClient();
  await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("user_id", v.userId).is("ended_at", null);
  refresh();
  return { ok: "Timer stopped." };
}

/** Read the date, start time and length from a time form (agency time zone). */
function readTimes(form: FormData, tz: string) {
  const date = String(form.get("date") ?? "");
  const start = String(form.get("start") ?? "");
  const mins = parseDuration(String(form.get("duration") ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick the day." };
  const m = start.match(/^(\d{2}):(\d{2})$/);
  if (!m) return { error: "Add the start time." };
  if (mins === null || mins <= 0) return { error: "Add how long, like 1:30 or 45m." };
  if (mins > 24 * 60) return { error: "That's more than a day. Split it into separate entries." };
  const startedAt = dateAtMinute(date, +m[1] * 60 + +m[2], tz);
  return { started_at: startedAt.toISOString(), ended_at: new Date(startedAt.getTime() + mins * 60_000).toISOString() };
}

/** Add time by hand, for work that wasn't timed. */
export async function addTimeEntry(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const times = readTimes(form, v.agency.timezone);
  if ("error" in times) return { error: times.error };
  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    agency_id: v.agency.id, user_id: v.userId, client_id: clientOrNull(form.get("client")),
    description: String(form.get("description") ?? "").trim(), ...times,
  });
  if (error) return { error: "That time couldn't be saved." };
  refresh();
  return { ok: "Time added." };
}

export async function updateTimeEntry(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const times = readTimes(form, v.agency.timezone);
  if ("error" in times) return { error: times.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_entries")
    .update({ client_id: clientOrNull(form.get("client")), description: String(form.get("description") ?? "").trim(), ...times })
    .eq("id", String(form.get("id"))).select("id").maybeSingle();
  if (error || !data) return { error: "That couldn't be saved. You can only change your own time." };
  refresh();
  return { ok: "Saved." };
}

export async function deleteTimeEntry(id: string): Promise<Result> {
  await requireTeam();
  const supabase = await createClient();
  await supabase.from("time_entries").delete().eq("id", id);
  refresh();
  return { ok: "Deleted." };
}
