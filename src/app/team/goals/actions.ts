"use server";

import { revalidatePath } from "next/cache";
import { periodStart, type Period } from "@/lib/goals";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };
const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").replace(/[$,%\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Add or change one of your own goals. */
export async function saveGoal(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const period = (form.get("period") === "quarter" ? "quarter" : "month") as Period;
  const start = String(form.get("start") ?? "");
  const target = num(form.get("target"));
  const progress = num(form.get("progress")) ?? 0;
  if (!title) return { error: "Name the goal." };
  if (Number.isNaN(target) || Number.isNaN(progress)) return { error: "Target and progress need to be numbers." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Pick the month or quarter." };
  const row = {
    title, target, progress, period, period_start: periodStart(start, period),
    note: String(form.get("note") ?? "").trim() || null, done: form.get("done") === "on",
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("team_goals").update(row).eq("id", id).eq("user_id", v.userId)
    : await supabase.from("team_goals").insert({ ...row, agency_id: v.agency.id, user_id: v.userId });
  if (error) return { error: "That goal couldn't be saved." };
  revalidatePath("/team/goals");
  return { ok: id ? "Saved." : "Goal added." };
}

export async function setGoalDone(id: string, done: boolean) {
  const v = await requireTeam();
  await (await createClient()).from("team_goals").update({ done }).eq("id", id).eq("user_id", v.userId);
  revalidatePath("/team/goals");
}

export async function deleteGoal(id: string) {
  const v = await requireTeam();
  await (await createClient()).from("team_goals").delete().eq("id", id).eq("user_id", v.userId);
  revalidatePath("/team/goals");
}
