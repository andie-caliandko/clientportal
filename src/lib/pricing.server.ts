import "server-only";
import { createClient } from "./supabase/server";
import type { Line, Offer, PricingSettings, Quote } from "./pricing";

/** Settings, offers and quotes, plus team pay and expenses from the CEO tracker (the latest month that has them). */
export async function loadPricing(agencyId: string, month: string) {
  const supabase = await createClient();
  const [{ data: docs }, { data: months }] = await Promise.all([
    supabase.from("ceo_sheets").select("key, data, updated_at").eq("agency_id", agencyId).or("key.in.(pricing,offers),key.like.quote:%"),
    supabase.from("ceo_sheets").select("key, data").eq("agency_id", agencyId).gte("key", "2000-01").lte("key", month).order("key", { ascending: false }),
  ]);
  const doc = (k: string) => (docs ?? []).find((d) => d.key === k)?.data as Record<string, unknown> | undefined;
  const latest = (field: "team" | "expenses") => {
    const m = (months ?? []).find((x) => Array.isArray((x.data as Record<string, unknown>)?.[field]));
    return { lines: ((m?.data as Record<string, Line[]> | undefined)?.[field] ?? []).filter((l) => l.amount), month: m?.key ?? null };
  };
  const quotes = (docs ?? []).filter((d) => d.key.startsWith("quote:"))
    .map((d) => ({ ...(d.data as Quote), id: d.key.slice(6), updated: d.updated_at as string }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  return {
    settings: (doc("pricing") ?? {}) as PricingSettings,
    offers: ((doc("offers")?.list ?? []) as Offer[]),
    quotes,
    team: latest("team"),
    expenses: latest("expenses"),
  };
}
