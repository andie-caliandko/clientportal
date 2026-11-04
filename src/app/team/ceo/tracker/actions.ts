"use server";

import { isOwner } from "@/lib/ceo";
import { cleanPatch, LEAD_STATUSES } from "@/lib/ceoTracker";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: boolean };

async function requireCeo() {
  const v = await requireTeam();
  // The tracker is the owner's alone, even when the CEO dashboard is shared.
  if (!isOwner(v.agency, v.userId)) throw new Error("Only the owner can do that.");
  return v;
}

/** Save some fields of a month (or the vision). Fields not sent are left as they are. */
export async function patchSheet(key: string, patch: Record<string, unknown>): Promise<Result> {
  const v = await requireCeo();
  const clean = cleanPatch(key, patch);
  if (!clean) return { error: "That couldn't be saved." };
  const { error } = await (await createClient()).rpc("ceo_sheet_patch", { a: v.agency.id, k: key, patch: clean });
  return error ? { error: "That couldn't be saved. Try again." } : { ok: true };
}

/** One box in the daily lead generation or habit tracker. Zero clears it. */
export async function setDaily(day: string, rowKey: string, value: number): Promise<Result> {
  const v = await requireCeo();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !rowKey || rowKey.length > 120 || !Number.isFinite(value) || value < 0 || value > 100000) return { error: "That couldn't be saved." };
  const supabase = await createClient();
  const { error } = value
    ? await supabase.from("ceo_daily").upsert({ agency_id: v.agency.id, day, row_key: rowKey, value })
    : await supabase.from("ceo_daily").delete().eq("agency_id", v.agency.id).eq("day", day).eq("row_key", rowKey);
  return error ? { error: "That couldn't be saved. Try again." } : { ok: true };
}

export type LeadInput = {
  name?: string; business?: string; first_contact?: string | null; last_contact?: string | null; next_contact?: string | null;
  temperature?: string; source?: string; status?: string; notes?: string;
};

function cleanLead(input: LeadInput) {
  const date = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const out: Record<string, unknown> = {};
  for (const k of ["name", "business", "source", "notes"] as const) if (k in input) out[k] = String(input[k] ?? "").slice(0, k === "notes" ? 4000 : 200);
  for (const k of ["first_contact", "last_contact", "next_contact"] as const) if (k in input) out[k] = date(input[k]);
  if (input.temperature && ["hot", "warm", "cold"].includes(input.temperature)) out.temperature = input.temperature;
  if (input.status) out.status = LEAD_STATUSES.includes(input.status) ? input.status : String(input.status).slice(0, 60);
  return out;
}

export async function addLead(input: LeadInput): Promise<Result & { id?: string }> {
  const v = await requireCeo();
  const row = cleanLead(input);
  if (!String(row.name ?? "").trim() && !String(row.business ?? "").trim()) return { error: "Add their name or business." };
  const { data, error } = await (await createClient()).from("ceo_leads").insert({ ...row, agency_id: v.agency.id }).select("id").single();
  return error ? { error: "That lead couldn't be added." } : { ok: true, id: data.id };
}

export async function updateLead(id: string, input: LeadInput): Promise<Result> {
  const v = await requireCeo();
  const { error } = await (await createClient()).from("ceo_leads").update(cleanLead(input)).eq("id", id).eq("agency_id", v.agency.id);
  return error ? { error: "That couldn't be saved." } : { ok: true };
}

export async function deleteLead(id: string): Promise<Result> {
  const v = await requireCeo();
  const { error } = await (await createClient()).from("ceo_leads").delete().eq("id", id).eq("agency_id", v.agency.id);
  return error ? { error: "That lead couldn't be removed." } : { ok: true };
}
