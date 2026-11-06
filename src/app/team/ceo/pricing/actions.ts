"use server";

import { isOwner } from "@/lib/ceo";
import { cleanOffers, cleanQuote, cleanSettings } from "@/lib/pricing";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: boolean };

async function requireOwner() {
  const v = await requireTeam();
  // Pricing is the owner's alone, like the CEO tracker.
  if (!isOwner(v.agency, v.userId)) throw new Error("Only the owner can do that.");
  return v;
}

async function patch(agencyId: string, key: string, data: Record<string, unknown>): Promise<Result> {
  const { error } = await (await createClient()).rpc("ceo_sheet_patch", { a: agencyId, k: key, patch: data });
  return error ? { error: "That couldn't be saved. Try again." } : { ok: true };
}

/** Some of the rate settings (salary goal, hours, margin, team hours, client counts). Others stay as they are. */
export async function savePricingSettings(input: Record<string, unknown>): Promise<Result> {
  const v = await requireOwner();
  const clean = cleanSettings(input);
  return clean ? patch(v.agency.id, "pricing", clean) : { error: "That couldn't be saved." };
}

/** The whole offer suite, in order. */
export async function saveOffers(list: unknown): Promise<Result> {
  const v = await requireOwner();
  const clean = cleanOffers(list);
  return clean ? patch(v.agency.id, "offers", { list: clean }) : { error: "That couldn't be saved." };
}

export async function saveQuote(input: unknown): Promise<Result> {
  const v = await requireOwner();
  const q = cleanQuote(input);
  if (!q) return { error: "That quote couldn't be saved." };
  const { id, ...data } = q;
  return patch(v.agency.id, `quote:${id}`, data);
}

export async function deleteQuote(id: string): Promise<Result> {
  const v = await requireOwner();
  if (!/^[\w-]{1,40}$/.test(id)) return { error: "That quote wasn't found." };
  const { error } = await (await createClient()).from("ceo_sheets").delete().eq("agency_id", v.agency.id).eq("key", `quote:${id}`);
  return error ? { error: "That quote couldn't be deleted." } : { ok: true };
}
