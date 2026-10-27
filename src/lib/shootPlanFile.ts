import "server-only";
import { cleanPlan } from "./shootPlan";
import { shootPlanPdf } from "./shootPlanPdf";
import { shootDates, timeLabel } from "./shoots";
import { createAdminClient } from "./supabase/server";
import type { Agency } from "./types";

/**
 * A shoot's plan as a branded PDF: the team's draft, or the version sent to the client.
 * Callers check who's asking (RLS-checked reads, or the team's own actions). Null if there's no plan.
 */
export async function buildShootPlanPdf(shootId: string, version: "draft" | "sent") {
  const admin = createAdminClient();
  const { data: shoot } = await admin.from("content_shoots")
    .select("id, shoot_date, end_date, start_time, crew, photographer, clients(name, agencies(*))").eq("id", shootId).maybeSingle();
  if (!shoot) return null;
  const clientRow = shoot.clients as unknown as { name: string; agencies: Agency } | null;
  const agency = clientRow?.agencies;
  if (!agency) return null;
  const [{ data: draft }, { data: shared }] = await Promise.all([
    version === "draft" ? admin.from("shoot_plans").select("content").eq("shoot_id", shootId).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("shoot_plan_shares").select("content").eq("shoot_id", shootId).maybeSingle(),
  ]);
  const source = draft ?? shared;
  if (!source) return null;
  const plan = cleanPlan(source.content);
  const client = clientRow?.name ?? "Client";
  const day = new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const when = [shoot.end_date && shoot.end_date > shoot.shoot_date ? shootDates(shoot.shoot_date, shoot.end_date) : day, timeLabel(shoot.start_time)].filter(Boolean).join(" · ");
  const crewIds = (shoot.crew ?? []) as string[];
  const { data: crew } = crewIds.length
    ? await admin.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id).in("user_id", crewIds)
    : { data: [] as { user_id: string; display_name: string }[] };
  const pdf = await shootPlanPdf({
    crew: crewIds.map((id) => (crew ?? []).find((c) => c.user_id === id)?.display_name).filter((x): x is string => !!x),
    photographer: shoot.photographer,
    agency: agency.brand?.shortName ?? agency.name, client, title: plan.title || "Content Shoot", when, plan,
    primary: agency.brand?.colors?.primary,
  });
  const fileName = `${client.replace(/[^\w\s&-]/g, "").trim() || "Client"} shoot plan ${shoot.shoot_date}.pdf`;
  return { pdf, fileName };
}
