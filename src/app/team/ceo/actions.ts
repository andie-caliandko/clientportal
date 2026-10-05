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

/** Read a contract's kind and dates from a form: a retainer (months) or a one-time project (end date). */
function readTerm(form: FormData, start: string): { kind: "retainer" | "project" | "ongoing"; months: number | null; end_date: string | null } | { error: string } {
  const raw = form.get("kind");
  const kind = raw === "project" ? "project" : raw === "ongoing" ? "ongoing" : "retainer";
  if (kind === "ongoing") return { kind, months: null, end_date: null };
  if (kind === "project") {
    const end = String(form.get("end") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: "Pick when the project wraps up." };
    if (end < start) return { error: "The project has to end after it starts." };
    return { kind, months: null, end_date: end };
  }
  const months = Number(form.get("months"));
  if (!(Number.isInteger(months) && months >= 1 && months <= 60)) return { error: "Contract length is 1 to 60 months." };
  return { kind, months, end_date: null };
}

/** Set (or correct) a client's current contract. */
export async function saveContract(_: Result, form: FormData): Promise<Result> {
  const v = await requireCeo();
  const clientId = String(form.get("client") ?? "");
  const id = String(form.get("id") ?? "");
  const start = String(form.get("start") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Pick the start date." };
  const term = readTerm(form, start);
  if ("error" in term) return { error: term.error };
  const note = String(form.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("client_contracts").update({ start_date: start, ...term, note, renewal_flagged_at: null }).eq("id", id)
    : await supabase.from("client_contracts").insert({ agency_id: v.agency.id, client_id: clientId, start_date: start, ...term, note });
  if (error) return { error: "That contract couldn't be saved." };
  // A client's first term starts on the start date from their client page; keep the two the same.
  const { data: first } = await supabase.from("client_contracts").select("id, start_date").eq("client_id", clientId).order("start_date").limit(1).maybeSingle();
  if (first && (!id || first.id === id)) {
    await supabase.from("clients").update({ start_date: start }).eq("id", clientId);
    revalidatePath(`/team/clients/${clientId}`);
  }
  revalidatePath("/team/ceo");
  return { ok: "Saved." };
}

/** Renew: this term is marked renewed and the next starts the day after it ends (a retainer or another project). */
export async function renewContract(_: Result, form: FormData): Promise<Result> {
  const v = await requireCeo();
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { data: c } = await supabase.from("client_contracts").select("client_id, kind, start_date, months, end_date, term_number, status").eq("id", id).maybeSingle();
  if (!c) return { error: "That contract wasn't found." };
  const { endOf } = await import("@/lib/contracts");
  const end = endOf(c);
  if (!end) return { error: "Ongoing contracts don't need renewing. Edit it to set a term instead." };
  const start = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const term = readTerm(form, start);
  if ("error" in term) return { error: term.error };
  await supabase.from("client_contracts").update({ status: "renewed" }).eq("id", id);
  const { error } = await supabase.from("client_contracts").insert({
    agency_id: v.agency.id, client_id: c.client_id, start_date: start, ...term,
    term_number: (c.term_number ?? 1) + 1, note: String(form.get("note") ?? "").trim() || null,
  });
  if (error) return { error: "The renewal couldn't be saved." };
  // Any open renewal or follow-up task for this client is done.
  await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("client_id", c.client_id).eq("source", "renewal").neq("status", "done");
  revalidatePath("/team/ceo");
  revalidatePath("/team");
  return { ok: "Renewed." };
}

/** Not renewing: the contract ends as planned. */
export async function endContract(id: string): Promise<Result> {
  await requireCeo();
  const supabase = await createClient();
  const { data } = await supabase.from("client_contracts").update({ status: "ended" }).eq("id", id).select("client_id").maybeSingle();
  if (data) await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("client_id", data.client_id).eq("source", "renewal").neq("status", "done");
  revalidatePath("/team/ceo");
  return { ok: "Marked as not renewing." };
}
