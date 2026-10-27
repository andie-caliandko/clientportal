"use server";

import { revalidatePath } from "next/cache";
import { notifyClient } from "@/lib/notifications";
import { requireEditor } from "@/lib/session";
import { isShootRepeat } from "@/lib/shoots";
import { extendSeries, planShootTasks, type Shoot } from "@/lib/shoots.server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

async function canEdit(clientId: string) {
  const { data } = await (await createClient()).rpc("can_edit_client", { c: clientId });
  return !!data;
}

function refresh(clientId: string) {
  revalidatePath("/team/shoots");
  revalidatePath(`/team/clients/${clientId}`);
  revalidatePath("/team");
  revalidatePath("/portal", "layout");
}

/** Schedule a content shoot, or change one. Repeating shoots schedule their next dates too. */
export async function saveShoot(_: Result, form: FormData): Promise<Result> {
  const v = await requireEditor();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const id = get("id"), clientId = get("client"), date = get("date");
  const repeatIn = get("repeat");
  const repeat = repeatIn && isShootRepeat(repeatIn) ? repeatIn : null;
  if (!clientId) return { error: "Choose a client." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick the shoot date." };
  if (!(await canEdit(clientId))) return { error: "You can't schedule shoots for this client." };
  const fields = {
    shoot_date: date,
    start_time: /^\d{2}:\d{2}$/.test(get("time")) ? get("time") : null,
    location: get("location").slice(0, 200) || null,
    details: get("details").slice(0, 1000) || null,
  };
  const admin = createAdminClient();

  if (!id) {
    const { data: made, error } = await admin.from("content_shoots")
      .insert({ ...fields, agency_id: v.agency.id, client_id: clientId, repeat, created_by: v.userId }).select("*").single();
    if (error || !made) return { error: "That shoot couldn't be saved." };
    if (repeat) await admin.from("content_shoots").update({ series_id: made.id }).eq("id", made.id);
    await planShootTasks({ ...(made as Shoot), series_id: repeat ? made.id : null });
    if (repeat) await extendSeries(made.id);
    await notifyClient(clientId, { kind: "task", title: "Content shoot scheduled", body: `${nice(date)}${fields.location ? ` · ${fields.location}` : ""}`, link: "/portal" });
    refresh(clientId);
    return { ok: repeat ? "Shoot scheduled, with the next ones in the series." : "Shoot scheduled." };
  }

  const { data: before } = await admin.from("content_shoots").select("*").eq("id", id).eq("client_id", clientId).maybeSingle();
  const old = before as Shoot | null;
  if (!old) return { error: "That shoot wasn't found." };
  const { data: saved, error } = await admin.from("content_shoots").update(fields).eq("id", id).select("*").single();
  if (error || !saved) return { error: "That shoot couldn't be saved." };

  if (old.series_id) {
    // Later shoots in the series keep the new time, place and details.
    await admin.from("content_shoots").update({ start_time: fields.start_time, location: fields.location, details: fields.details })
      .eq("series_id", old.series_id).eq("status", "scheduled").gt("shoot_date", old.shoot_date);
  }
  if (repeat !== old.repeat) {
    // The schedule changed from here on: drop the later shoots (their tasks go too) and start again from this one.
    if (old.series_id) {
      await admin.from("content_shoots").delete().eq("series_id", old.series_id).eq("status", "scheduled").gt("shoot_date", old.shoot_date);
      await admin.from("content_shoots").update({ repeat: null }).eq("series_id", old.series_id).lt("shoot_date", old.shoot_date);
    }
    await admin.from("content_shoots").update({ repeat, series_id: repeat ? id : null }).eq("id", id);
    if (repeat) await extendSeries(id);
  }
  if (old.shoot_date !== date) {
    await planShootTasks({ ...(saved as Shoot), repeat, series_id: repeat ? (repeat !== old.repeat ? id : old.series_id) : null });
    await notifyClient(clientId, { kind: "task", title: "Content shoot moved", body: `Now ${nice(date)}`, link: "/portal" });
  }
  refresh(clientId);
  return { ok: "Shoot saved." };
}

/** Cancel one shoot, or this one and every later one in its series. Open planning tasks are removed. */
export async function cancelShoot(id: string, following = false): Promise<Result> {
  await requireEditor();
  const admin = createAdminClient();
  const { data } = await admin.from("content_shoots").select("*").eq("id", id).maybeSingle();
  const shoot = data as Shoot | null;
  if (!shoot || !(await canEdit(shoot.client_id))) return { error: "That shoot wasn't found." };
  if (following && shoot.series_id) {
    await admin.from("content_shoots").delete().eq("series_id", shoot.series_id).eq("status", "scheduled").gt("shoot_date", shoot.shoot_date);
    await admin.from("content_shoots").update({ repeat: null }).eq("series_id", shoot.series_id);
  }
  await admin.from("content_shoots").update({ status: "cancelled" }).eq("id", id);
  await planShootTasks({ ...shoot, status: "cancelled" });
  await notifyClient(shoot.client_id, { kind: "task", title: following ? "Content shoots cancelled" : "Content shoot cancelled", body: following ? `From ${nice(shoot.shoot_date)} on` : nice(shoot.shoot_date), link: "/portal" });
  refresh(shoot.client_id);
  return { ok: "Cancelled." };
}
