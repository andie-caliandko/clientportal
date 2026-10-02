import { NextResponse, type NextRequest } from "next/server";
import { clientActivity } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/server";
import { recordSignup } from "@/lib/signups";

// Zapier calls this when a contract is signed in Dubsado.
// Zap: Dubsado "Contract Signed" -> Webhooks by Zapier POST
//   URL:     https://<your portal>/api/webhooks/dubsado
//   Headers: x-webhook-secret: <ZAPIER_WEBHOOK_SECRET>
//   Body:    { "email": "<client email from Dubsado>", "name": "<client name, optional>", "project": "<project title, optional>" }
// Someone who isn't in the portal yet is added to "New clients to set up" on the CEO dashboard.
export async function POST(request: NextRequest) {
  if (request.headers.get("x-webhook-secret") !== process.env.ZAPIER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { email, name, project } = (await request.json().catch(() => ({}))) as { email?: string; name?: string; project?: string };
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createAdminClient();
  // Match on the Dubsado email saved for the client first, then on portal contacts.
  const { data: byDubsado } = await admin
    .from("clients")
    .select("id, agency_id, name")
    .ilike("dubsado_email", email.trim())
    .limit(1)
    .maybeSingle();
  if (byDubsado) return markContract(admin, byDubsado.id, byDubsado.agency_id, byDubsado.name);

  const { data: cu } = await admin
    .from("client_users")
    .select("client_id, display_name, client:clients(agency_id)")
    .ilike("email", email.trim())
    .limit(1)
    .maybeSingle();
  if (!cu) {
    // A new client: their portal needs setting up.
    await recordSignup({ email, name, project, contract: true });
    return NextResponse.json({ ok: true, newClient: true });
  }

  return markContract(admin, cu.client_id, (cu.client as unknown as { agency_id: string }).agency_id, cu.display_name);
}

async function markContract(admin: ReturnType<typeof createAdminClient>, clientId: string, agencyId: string, who: string) {
  const { data: step } = await admin
    .from("onboarding_steps")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("kind", "contract")
    .maybeSingle();
  if (step) {
    await admin.from("client_step_status").upsert({ client_id: clientId, step_id: step.id }, { ignoreDuplicates: true });
  }
  await clientActivity(clientId, {
    task: `Contract signed: ${who}`,
    source: "dubsado",
    subject: "contract signed",
    body: `${who} signed their contract in Dubsado.`,
  });
  return NextResponse.json({ ok: true });
}
