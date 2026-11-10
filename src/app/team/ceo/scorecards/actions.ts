"use server";

import { revalidatePath } from "next/cache";
import { canSeeScorecards, isOwner } from "@/lib/ceo";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { cleanCard, cleanValues } from "@/lib/teamScorecard";

type Result = { error?: string; ok?: string };

async function requireViewer() {
  const v = await requireTeam();
  if (!canSeeScorecards(v.agency, v.userId, v.member.role)) throw new Error("Only the owner (and admins they share with) can do that.");
  return v;
}

/** A teammate's role, mission and KPIs. */
export async function saveCard(userId: string, card: unknown): Promise<Result> {
  const v = await requireViewer();
  const clean = cleanCard(card);
  if (!clean) return { error: "That couldn't be saved." };
  const { error } = await (await createClient()).from("team_scorecards")
    .upsert({ agency_id: v.agency.id, user_id: userId, ...clean, updated_at: new Date().toISOString() });
  if (error) return { error: "That couldn't be saved. Try again." };
  revalidatePath("/team/ceo/scorecards");
  return { ok: "Saved." };
}

/** Numbers entered for a month (merged with what's there) and the month's notes. */
export async function saveMonth(userId: string, month: string, patch: { values?: Record<string, unknown>; note?: string }): Promise<Result> {
  const v = await requireViewer();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "That couldn't be saved." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("team_scorecard_months").select("values, note").eq("agency_id", v.agency.id).eq("user_id", userId).eq("month", month).maybeSingle();
  const values = { ...((row?.values ?? {}) as Record<string, number | null>), ...(cleanValues(patch.values ?? {}) ?? {}) };
  const { error } = await supabase.from("team_scorecard_months").upsert({
    agency_id: v.agency.id, user_id: userId, month, values,
    note: patch.note !== undefined ? String(patch.note).slice(0, 8000) : row?.note ?? "",
    updated_at: new Date().toISOString(),
  });
  return error ? { error: "That couldn't be saved. Try again." } : { ok: "Saved." };
}

/** The owner chooses which admins can open team scorecards. */
export async function saveScorecardSharing(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (!isOwner(v.agency, v.userId)) return { error: "Only the owner can share team scorecards." };
  const supabase = await createClient();
  const { data: admins } = await supabase.from("agency_members").select("user_id").eq("agency_id", v.agency.id).eq("role", "admin");
  const allowed = new Set((admins ?? []).map((a) => a.user_id));
  const ids = form.getAll("share").map(String).filter((id) => allowed.has(id) && id !== v.userId);
  const { error } = await supabase.from("agencies").update({ scorecards_shared_with: ids }).eq("id", v.agency.id);
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/team", "layout");
  return { ok: ids.length ? `Shared with ${ids.length} admin${ids.length === 1 ? "" : "s"}.` : "Only you can see team scorecards." };
}
