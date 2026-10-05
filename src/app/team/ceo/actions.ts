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

  // Payment history: each month listed comes back as paid (ticked) or not, with its amount.
  const months = form.getAll("month").map(String).filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (months.length) {
    const now = new Date().toISOString();
    const rows = months.map((m) => {
      const paid = form.get(`paid:${m}`) === "on";
      const amt = Number(String(form.get(`amount:${m}`) ?? "").replace(/[$,\s]/g, ""));
      return {
        agency_id: v.agency.id, client_id: clientId, month: monthKeyDate(m), status: paid ? "paid" : "unpaid",
        amount: Number.isFinite(amt) && amt > 0 ? amt : null, updated_at: now,
      };
    });
    // Keep what Dubsado already reported for paid months; only fill in or change what was set here.
    const { data: existing } = await supabase.from("client_invoices").select("month, status, paid_at, source").eq("client_id", clientId).in("month", rows.map((r) => r.month));
    const was = new Map((existing ?? []).map((e) => [e.month, e]));
    const upserts = rows.filter((r) => r.status === "paid" || was.has(r.month)).map((r) => {
      const prev = was.get(r.month);
      const on = String(form.get(`date:${r.month.slice(0, 7)}`) ?? "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(on) && on.slice(0, 7) === r.month.slice(0, 7) ? `${on}T12:00:00Z` : null;
      return { ...r, paid_at: r.status === "paid" ? date ?? prev?.paid_at ?? `${r.month}T12:00:00Z` : null, source: prev?.status === "paid" && r.status === "paid" && !date ? prev.source : "manual" };
    });
    if (upserts.length) {
      const { error: invErr } = await supabase.from("client_invoices").upsert(upserts, { onConflict: "client_id,month" });
      if (invErr) return { error: "The fee saved, but the payment history couldn't be." };
    }
  }
  revalidatePath("/team/ceo");
  return { ok: "Saved." };
}

/**
 * Mark an invoice paid by hand, on the date it was paid. The payment counts for
 * the month of that date (paid Sep 28 → September), so it never lands in the
 * wrong month. Or mark a month unpaid again.
 */
export async function setInvoicePaid(clientId: string, month: string, paid: boolean, amount: number | null, paidOn?: string): Promise<Result> {
  const v = await requireCeo();
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  if (paid && paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Pick the date it was paid." };
  const forMonth = paid && paidOn ? paidOn.slice(0, 7) : month;
  const supabase = await createClient();
  const { error } = await supabase.from("client_invoices").upsert(
    {
      agency_id: v.agency.id, client_id: clientId, month: monthKeyDate(forMonth), amount,
      status: paid ? "paid" : "unpaid", paid_at: paid ? (paidOn ? `${paidOn}T12:00:00Z` : new Date().toISOString()) : null,
      source: "manual", updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,month" },
  );
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/team/ceo");
  return { ok: paid ? `Marked paid for ${new Date(`${forMonth}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" })}.` : "Marked unpaid." };
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

/**
 * Save past revenue from a spreadsheet. Lines for a portal client and month that's
 * already logged as paid are left out, so nothing is counted twice.
 */
export async function importRevenue(batchName: string, rows: { paid_on: string; amount: number; client_name: string | null; note: string | null }[]): Promise<Result & { added?: number; skipped?: number }> {
  const v = await requireCeo();
  const clean = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.paid_on) && Number.isFinite(r.amount) && r.amount !== 0).slice(0, 5000);
  if (!clean.length) return { error: "There were no lines with a date and an amount." };
  const supabase = await createClient();
  const [{ data: clients }, { data: paid }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("client_invoices").select("client_id, month").eq("status", "paid"),
  ]);
  const byName = new Map((clients ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const logged = new Set((paid ?? []).map((p) => `${p.client_id}|${String(p.month).slice(0, 7)}`));
  const batch = crypto.randomUUID();
  let skipped = 0;
  const insert = clean.flatMap((r) => {
    const clientId = r.client_name ? byName.get(r.client_name.trim().toLowerCase()) ?? null : null;
    if (clientId && logged.has(`${clientId}|${r.paid_on.slice(0, 7)}`)) { skipped++; return []; }
    return [{ agency_id: v.agency.id, paid_on: r.paid_on, amount: r.amount, client_name: r.client_name?.slice(0, 200) ?? null, client_id: clientId, note: r.note?.slice(0, 300) ?? null, batch_id: batch, batch_name: batchName.slice(0, 120) || "Imported revenue", created_by: v.userId }];
  });
  for (let i = 0; i < insert.length; i += 500) {
    const { error } = await supabase.from("revenue_entries").insert(insert.slice(i, i + 500));
    if (error) return { error: "The import couldn't be saved. Nothing was added." };
  }
  revalidatePath("/team/ceo");
  return { ok: `Added ${insert.length} line${insert.length === 1 ? "" : "s"}${skipped ? `, left out ${skipped} already logged in the portal` : ""}.`, added: insert.length, skipped };
}

/** Take back a whole import. */
export async function removeRevenueBatch(batchId: string): Promise<Result> {
  await requireCeo();
  await (await createClient()).from("revenue_entries").delete().eq("batch_id", batchId);
  revalidatePath("/team/ceo");
  return { ok: "Import removed." };
}
