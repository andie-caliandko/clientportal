import { NextResponse, type NextRequest } from "next/server";
import { notifyUser } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/server";
import { recordSignup } from "@/lib/signups";

// Zapier calls this when a client pays an invoice in Dubsado, so the CEO
// dashboard shows them as paid for that month.
// Zap: Dubsado "Payment Received" (or "Invoice Paid") -> Webhooks by Zapier POST
//   URL:     https://<your portal>/api/webhooks/dubsado-payment
//   Headers: x-webhook-secret: <ZAPIER_WEBHOOK_SECRET>
//   Body:    { "email": "<client email>", "amount": "<amount paid>", "paid_at": "<payment date>", "name": "<client name, optional>", "invoice": "<invoice name, optional>" }
// Someone who isn't in the portal yet is added to "New clients to set up" on the CEO dashboard.
export async function POST(request: NextRequest) {
  if (request.headers.get("x-webhook-secret") !== process.env.ZAPIER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string; amount?: string | number; paid_at?: string; invoice?: string; name?: string; project?: string };
  const email = body.email?.trim();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createAdminClient();
  // Match the Dubsado email saved for the client, then their portal contacts.
  let client = (await admin.from("clients").select("id, name, agency_id, agency:agencies(timezone, owner_id)").ilike("dubsado_email", email).limit(1).maybeSingle()).data;
  if (!client) {
    const { data: cu } = await admin.from("client_users").select("client_id").ilike("email", email).limit(1).maybeSingle();
    if (cu) client = (await admin.from("clients").select("id, name, agency_id, agency:agencies(timezone, owner_id)").eq("id", cu.client_id).maybeSingle()).data;
  }
  const paidAt = body.paid_at && !Number.isNaN(Date.parse(body.paid_at)) ? new Date(body.paid_at) : new Date();
  const amount = Number(String(body.amount ?? "").replace(/[$,\s]/g, ""));
  if (!client) {
    // A new client: their portal needs setting up.
    await recordSignup({ email, name: body.name, project: body.project, paid: { amount: Number.isFinite(amount) && amount > 0 ? amount : null, at: paidAt } });
    return NextResponse.json({ ok: true, newClient: true });
  }

  const agency = client.agency as unknown as { timezone: string; owner_id: string | null };
  const month = `${new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(paidAt).slice(0, 7)}-01`;
  await admin.from("client_invoices").upsert(
    {
      agency_id: client.agency_id, client_id: client.id, month, status: "paid", paid_at: paidAt.toISOString(),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null, source: "dubsado",
      note: body.invoice?.slice(0, 200) ?? null, updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,month" },
  );
  await notifyUser(client.agency_id, client.id, agency.owner_id, {
    kind: "task", title: `${client.name} paid${Number.isFinite(amount) && amount > 0 ? ` $${amount.toLocaleString("en-US")}` : ""}`, body: body.invoice ?? null, link: "/team/ceo",
  });
  return NextResponse.json({ ok: true });
}
