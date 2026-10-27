import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { cleanPlan, samePlan } from "@/lib/shootPlan";
import { shootDates, timeLabel } from "@/lib/shoots";
import { createClient } from "@/lib/supabase/server";
import { PlanEditor } from "./PlanEditor";

/** Plan one shoot: shot list, timeline and notes. Private to the team until someone sends it to the client. */
export default async function ShootPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { agency } = await requireTeam();
  const { id } = await params;
  const supabase = await createClient();
  const { data: shoot } = await supabase.from("content_shoots")
    .select("id, client_id, shoot_date, end_date, start_time, location, details, status, clients(name)").eq("id", id).maybeSingle();
  if (!shoot) notFound();
  const [{ data: draft }, { data: shared }] = await Promise.all([
    supabase.from("shoot_plans").select("overview, shots, timeline, updated_at").eq("shoot_id", id).maybeSingle(),
    supabase.from("shoot_plan_shares").select("overview, shots, timeline, shared_at").eq("shoot_id", id).maybeSingle(),
  ]);
  const plan = cleanPlan(draft ?? shared);
  const client = shoot.clients as unknown as { name: string } | null;
  const when = shoot.end_date && shoot.end_date > shoot.shoot_date ? shootDates(shoot.shoot_date, shoot.end_date)
    : new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const sentAt = shared?.shared_at
    ? new Date(shared.shared_at).toLocaleDateString("en-US", { timeZone: agency.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <Link href="/team/shoots" className="note">← Content shoots</Link>
          <p className="eyebrow" style={{ marginTop: 10 }}><Link href={`/team/clients/${shoot.client_id}`}>{client?.name}</Link></p>
          <h1 style={{ marginTop: 6 }}>Shoot plan</h1>
          <p className="note">{[when, timeLabel(shoot.start_time), shoot.location].filter(Boolean).join(" · ")}{shoot.status === "cancelled" ? " · Cancelled" : ""}</p>
        </div>
      </div>
      <PlanEditor
        shootId={shoot.id}
        initial={plan}
        sent={shared ? { at: sentAt!, plan: cleanPlan(shared) } : null}
        changedSinceSent={!!shared && !samePlan(plan, cleanPlan(shared))}
      />
    </section>
  );
}
