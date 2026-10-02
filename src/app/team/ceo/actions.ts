"use server";

import { revalidatePath } from "next/cache";
import { canSeeCeo, isOwner, monthKeyDate } from "@/lib/ceo";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

async function requireCeo() {
  const v = await requireTeam();
  if (!canSeeCeo(v.agency, v.userId, v.member.role)) throw new Error("Only the owner (and admins they share with) can do that.");
  return v;
}

/** A client's monthly fee and the day their invoice is due. */
export async function saveBilling(_: Result, form: FormData): Promise<Result> {
  const v = await requireCeo();
  const clientId = String(form.get("client") ?? "");
  const fee = Number(String(form.get("fee") ?? "").replace(/[$,\s]/g, "") || 0);
  const dayText = String(form.get("day") ?? "").trim();
  const day = dayText ? Number(dayText) : null;
  if (!Number.isFinite(fee) || fee < 0) return { error: "The monthly fee needs to be a number." };
  if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return { error: "The billing day is 1 to 31." };
  const supabase = await createClient();
  const { error } = await supabase.from("client_billing").upsert({ client_id: clientId, agency_id: v.agency.id, monthly_fee: fee, billing_day: day, updated_at: new Date().toISOString() });
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/team/ceo");
  return { ok: "Saved." };
}

/** Mark this month's invoice paid or unpaid by hand. */
export async function setInvoicePaid(clientId: string, month: string, paid: boolean, amount: number | null): Promise<Result> {
  const v = await requireCeo();
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  const supabase = await createClient();
  const { error } = await supabase.from("client_invoices").upsert(
    {
      agency_id: v.agency.id, client_id: clientId, month: monthKeyDate(month), amount,
      status: paid ? "paid" : "unpaid", paid_at: paid ? new Date().toISOString() : null, source: "manual", updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,month" },
  );
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/team/ceo");
  return { ok: paid ? "Marked paid." : "Marked unpaid." };
}

/** The owner chooses which admins can open the CEO dashboard. */
export async function saveCeoSharing(_: Result, form: FormData): Promise<Result> {
  const v = await requireTeam();
  if (!isOwner(v.agency, v.userId)) return { error: "Only the owner can share this dashboard." };
  const supabase = await createClient();
  const { data: admins } = await supabase.from("agency_members").select("user_id").eq("agency_id", v.agency.id).eq("role", "admin");
  const allowed = new Set((admins ?? []).map((a) => a.user_id));
  const ids = form.getAll("share").map(String).filter((id) => allowed.has(id) && id !== v.userId);
  const { error } = await supabase.from("agencies").update({ ceo_shared_with: ids }).eq("id", v.agency.id);
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/team", "layout");
  return { ok: ids.length ? `Shared with ${ids.length} admin${ids.length === 1 ? "" : "s"}.` : "Only you can see this dashboard." };
}
