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

/** A scorecard just for this person (instead of their position's). */
export async function saveCard(userId: string, card: unknown): Promise<Result> {
  const v = await requireViewer();
  const clean = cleanCard(card);
  if (!clean) return { error: "That couldn't be saved." };
  const { error } = await (await createClient()).from("team_scorecards")
    .upsert({ agency_id: v.agency.id, user_id: userId, ...clean, custom: true, updated_at: new Date().toISOString() });
  if (error) return { error: "That couldn't be saved. Try again." };
  revalidatePath("/team/ceo/scorecards");
  return { ok: "Saved." };
}

/** Put someone in a position (or back to the automatic match), dropping any scorecard of their own. */
export async function setPosition(userId: string, templateId: string | null): Promise<Result> {
  const v = await requireViewer();
  const { error } = await (await createClient()).from("team_scorecards")
    .upsert({ agency_id: v.agency.id, user_id: userId, template_id: templateId, custom: false, updated_at: new Date().toISOString() });
  if (error) return { error: "That couldn't be saved. Try again." };
  revalidatePath("/team/ceo/scorecards");
  return { ok: "Saved." };
}

/** A position's scorecard: new, or changed for everyone in it. */
export async function saveTemplate(id: string | null, input: { card: unknown; auto_role?: string | null; auto_title?: string | null }): Promise<Result & { id?: string }> {
  const v = await requireViewer();
  const clean = cleanCard(input.card);
  if (!clean || !clean.role_title.trim()) return { error: "Give the position a name." };
  const row = {
    agency_id: v.agency.id, title: clean.role_title.trim(), mission: clean.mission, kpis: clean.kpis,
    auto_role: ["account_manager", "admin", "creator"].includes(input.auto_role ?? "") ? input.auto_role : null,
    auto_title: input.auto_title?.trim().slice(0, 80) || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const res = id
    ? await supabase.from("team_scorecard_templates").update(row).eq("id", id).eq("agency_id", v.agency.id).select("id").single()
    : await supabase.from("team_scorecard_templates").insert(row).select("id").single();
  if (res.error) return { error: "That couldn't be saved. Try again." };
  revalidatePath("/team/ceo/scorecards");
  return { ok: "Saved.", id: res.data.id };
}

export async function deleteTemplate(id: string): Promise<Result> {
  const v = await requireViewer();
  const { error } = await (await createClient()).from("team_scorecard_templates").delete().eq("id", id).eq("agency_id", v.agency.id);
  if (error) return { error: "That position couldn't be removed." };
  revalidatePath("/team/ceo/scorecards");
  return { ok: "Removed." };
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
