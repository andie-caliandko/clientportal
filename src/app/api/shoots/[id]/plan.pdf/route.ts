import { NextResponse } from "next/server";
import { getViewer } from "@/lib/session";
import { cleanPlan } from "@/lib/shootPlan";
import { shootDates, timeLabel } from "@/lib/shoots";
import { shootPlanPdf } from "@/lib/shootPlanPdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Download a shoot plan as a PDF. The team gets the working draft; clients only ever get the
 * version that was sent to them (RLS keeps drafts out of their reach). `?sent=1` gets the sent version for anyone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in first", { status: 401 });
  const supabase = await createClient();
  const { data: shoot } = await supabase.from("content_shoots")
    .select("id, shoot_date, end_date, start_time, clients(name)").eq("id", id).maybeSingle();
  if (!shoot) return new NextResponse("Not found", { status: 404 });
  const [{ data: draft }, { data: shared }] = await Promise.all([
    v.kind === "team" && !new URL(req.url).searchParams.has("sent") ? supabase.from("shoot_plans").select("content").eq("shoot_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("shoot_plan_shares").select("content").eq("shoot_id", id).maybeSingle(),
  ]);
  const source = draft ?? shared;
  if (!source) return new NextResponse("There's no plan for this shoot yet.", { status: 404 });
  const plan = cleanPlan(source.content);
  const client = (shoot.clients as unknown as { name: string } | null)?.name ?? "Client";
  const day = new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const when = [shoot.end_date && shoot.end_date > shoot.shoot_date ? shootDates(shoot.shoot_date, shoot.end_date) : day, timeLabel(shoot.start_time)].filter(Boolean).join(" · ");
  const pdf = await shootPlanPdf({
    agency: v.agency.brand.shortName ?? v.agency.name, client, title: plan.title || "Content Shoot", when, plan,
    accent: v.agency.brand.colors?.primary,
  });
  const file = `${client.replace(/[^\w\s-]/g, "").trim() || "Client"} shoot plan ${shoot.shoot_date}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
