"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { dateAtHour, dateAtMinute } from "@/lib/approval";
import { createMemberEvent, createOutOfOffice, deleteMemberEvent, updateMemberEvent } from "@/lib/google";
import { emailClient } from "@/lib/notify";
import { notifyClient } from "@/lib/notifications";
import { requireTeam } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{2}):(\d{2})$/;
const minutes = (t: string) => {
  const m = t.match(TIME);
  return m ? +m[1] * 60 + +m[2] : null;
};
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** A teammate adds something to their own Google Calendar from the Calendar page. */
export async function addMyEvent(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const title = String(form.get("title") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const start = minutes(String(form.get("start") ?? ""));
  const end = minutes(String(form.get("end") ?? ""));
  if (!title) return { error: "Give it a name." };
  if (!DATE.test(date) || start === null || end === null) return { error: "Pick a date and times." };
  if (end <= start) return { error: "The end time needs to be after the start time." };
  const tz = v.agency.timezone;
  try {
    await createMemberEvent(v.userId, {
      title,
      start: dateAtMinute(date, start, tz).toISOString(),
      end: dateAtMinute(date, end, tz).toISOString(),
      timeZone: tz,
      meet: form.get("meet") === "on",
    });
  } catch (err) {
    console.error("Adding an event failed", err);
    return { error: "Google Calendar didn't accept that. Try reconnecting your calendar." };
  }
  revalidatePath("/team/calendar");
  return { ok: "Added to your Google Calendar." };
}

/** A teammate marks themselves out of office for one or more days. */
export async function addMyOutOfOffice(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "") || from;
  if (!DATE.test(from) || !DATE.test(to)) return { error: "Pick the days you'll be out." };
  if (to < from) return { error: "The last day needs to be on or after the first day." };
  const tz = v.agency.timezone;
  try {
    await createOutOfOffice(v.userId, {
      start: dateAtHour(from, 0, tz).toISOString(),
      end: dateAtHour(nextDay(to), 0, tz).toISOString(),
      timeZone: tz,
      message: String(form.get("message") ?? "").trim() || undefined,
      allDay: { from, to: nextDay(to) },
    });
  } catch (err) {
    console.error("Adding out of office failed", err);
    return { error: "Google Calendar didn't accept that. Try reconnecting your calendar." };
  }
  revalidatePath("/team/calendar");
  return { ok: "You're marked out of office. Google will decline new meetings for those days." };
}

/** The hours clients can book calls with this teammate. */
export async function saveBookingHours(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const start = Number(form.get("start"));
  const end = Number(form.get("end"));
  const days = form.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  if (!(start >= 0 && end <= 24 && end > start)) return { error: "The end hour needs to be after the start hour." };
  if (!days.length) return { error: "Pick at least one day." };
  const { error } = await createAdminClient()
    .from("agency_members")
    .update({ book_start: start, book_end: end, book_days: days })
    .eq("user_id", v.userId)
    .eq("agency_id", v.agency.id);
  if (error) return { error: "Your hours couldn't be saved." };
  revalidatePath("/team/calendar");
  return { ok: "Saved. Clients only see open times inside these hours." };
}

/** You can change your own events; admins can change anyone's. */
async function canChange(ownerId: string) {
  const v = await requireTeam();
  if (ownerId !== v.userId && v.member.role !== "admin") return null;
  const { data } = await createAdminClient().from("agency_members").select("user_id").eq("user_id", ownerId).eq("agency_id", v.agency.id).maybeSingle();
  return data ? v : null;
}

/** Edit an event from the Calendar page. */
export async function editCalendarEvent(_: Result, form: FormData): Promise<Result> {
  const owner = String(form.get("owner") ?? "");
  const eventId = String(form.get("event") ?? "");
  const v = await canChange(owner);
  if (!v) return { error: "You can only change your own events." };
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Give it a name." };
  const tz = v.agency.timezone;
  const date = String(form.get("date") ?? "");
  let timed: { start: string; end: string } | undefined;
  let allDay: { from: string; toExclusive: string } | undefined;
  if (form.get("allDay") === "on") {
    const last = String(form.get("lastDate") ?? "") || date;
    if (!DATE.test(date) || !DATE.test(last) || last < date) return { error: "Check the dates." };
    allDay = { from: date, toExclusive: nextDay(last) };
  } else {
    const start = minutes(String(form.get("start") ?? ""));
    const end = minutes(String(form.get("end") ?? ""));
    if (!DATE.test(date) || start === null || end === null) return { error: "Pick a date and times." };
    if (end <= start) return { error: "The end time needs to be after the start time." };
    timed = { start: dateAtMinute(date, start, tz).toISOString(), end: dateAtMinute(date, end, tz).toISOString() };
  }
  try {
    await updateMemberEvent(owner, eventId, { title, description: String(form.get("description") ?? ""), timeZone: tz, timed, allDay });
  } catch (err) {
    console.error("Editing an event failed", err);
    return { error: "Google Calendar didn't accept that change. You may only be able to edit this one in Google." };
  }
  revalidateTag(`meetings-${v.agency.id}`);
  revalidatePath("/team/calendar");
  return { ok: "Saved to Google Calendar." };
}

export async function deleteCalendarEvent(owner: string, eventId: string): Promise<Result> {
  const v = await canChange(owner);
  if (!v) return { error: "You can only delete your own events." };
  try {
    await deleteMemberEvent(owner, eventId);
  } catch (err) {
    console.error("Deleting an event failed", err);
    return { error: "Google Calendar didn't let us delete that. Try deleting it in Google." };
  }
  revalidateTag(`meetings-${v.agency.id}`);
  revalidatePath("/team/calendar");
  return { ok: "Deleted." };
}

export async function disconnectMyGoogle() {
  const v = await requireTeam();
  await createAdminClient().from("member_google").delete().eq("user_id", v.userId);
  revalidateTag(`meetings-${v.agency.id}`);
  revalidatePath("/team/calendar");
}

// ---------------------------------------------------------------------------
// Asking a client to book a call
// ---------------------------------------------------------------------------

/** The team asks a client to pick a time for a call; they only see times the host is free. */
export async function sendCallRequest(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: "Creators have view-only access." };
  const clientId = String(form.get("client") ?? "");
  const hostId = String(form.get("host") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const note = String(form.get("note") ?? "").trim() || null;
  const duration = Number(form.get("duration"));
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!title) return { error: "Name the call, like Monthly strategy call." };
  if (![15, 30, 45, 60, 90].includes(duration)) return { error: "Pick how long the call is." };
  if (!DATE.test(from) || !DATE.test(to) || to < from) return { error: "Pick the first and last day they can choose from." };

  const supabase = await createClient();
  const { data: canEdit } = await supabase.rpc("can_edit_client", { c: clientId });
  if (!canEdit) return { error: "You don't have access to this client." };
  const admin = createAdminClient();
  const [{ data: host }, { data: linked }, { data: client }] = await Promise.all([
    admin.from("agency_members").select("display_name").eq("user_id", hostId).eq("agency_id", v.agency.id).maybeSingle(),
    admin.from("member_google").select("user_id").eq("user_id", hostId).maybeSingle(),
    admin.from("clients").select("name").eq("id", clientId).maybeSingle(),
  ]);
  if (!host || !client) return { error: "Pick who's hosting the call." };
  if (!linked) return { error: `${host.display_name.split(" ")[0]} needs to connect their Google Calendar on the Calendar page first.` };

  const { error } = await supabase.from("call_requests").insert({
    agency_id: v.agency.id, client_id: clientId, host_id: hostId, title, note,
    duration_min: duration, window_start: from, window_end: to, created_by: v.userId,
  });
  if (error) return { error: "The request couldn't be saved." };

  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/portal/meetings`;
  await notifyClient(clientId, { kind: "task", title: `Pick a time: ${title}`, body: `With ${host.display_name}`, link: "/portal/meetings" });
  await emailClient(
    clientId,
    `Pick a time for your ${title}`,
    `${host.display_name} would like to set up a ${duration}-minute ${title} with you.${note ? `\n\n${note}` : ""}\n\nChoose a time that works for you here:\n${link}\n\nYou'll get a Google Calendar invite with the Google Meet link once you pick.`,
  );
  revalidatePath(`/team/clients/${clientId}`);
  return { ok: "Sent. They'll get an email and see it in their portal." };
}

export async function cancelCallRequest(form: FormData) {
  await requireTeam();
  const id = String(form.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("call_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "open").select("client_id").maybeSingle();
  if (data) revalidatePath(`/team/clients/${data.client_id}`);
}
