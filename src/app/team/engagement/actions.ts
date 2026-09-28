"use server";

import { revalidatePath } from "next/cache";
import { ENGAGEMENT_ACTIONS, parseLinks } from "@/lib/engagement";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

/** Log (or change, or clear) one day's engagement on one account. */
export async function saveEngagement(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (v.member.role === "creator") return { error: "Creators have view-only access." };
  const clientId = String(form.get("client") ?? "");
  const day = String(form.get("day") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day." };
  const actions = form.getAll("action").map(String).filter((a) => (ENGAGEMENT_ACTIONS as readonly string[]).includes(a));
  const links = parseLinks(String(form.get("links") ?? ""));
  const note = String(form.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  if (!actions.length && !links.length && !note) {
    await supabase.from("engagement_logs").delete().eq("client_id", clientId).eq("day", day);
  } else {
    const { error } = await supabase.from("engagement_logs").upsert(
      { agency_id: v.agency.id, client_id: clientId, day, actions, links, note, // Whoever saves it is who logged it.
        logged_by: v.userId, updated_at: new Date().toISOString() },
      { onConflict: "client_id,day" },
    );
    if (error) return { error: "That couldn't be saved. Are you on this account's team?" };
  }
  revalidatePath("/team/engagement");
  return { ok: "Saved." };
}
