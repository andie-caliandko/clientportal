import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeCeo, invoiceState, isOwner, monthKeyDate } from "@/lib/ceo";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { EditBilling, PaidToggle, ShareCeo } from "./CeoForms";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const STATE = { paid: { label: "Paid", cls: "ok" }, due: { label: "Due", cls: "warn" }, late: { label: "Late", cls: "crit" }, upcoming: { label: "Not yet due", cls: "info" } } as const;

/** The owner's view of the business this month: clients, recurring revenue, and who has paid. */
export default async function CeoDashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { agency, member, userId } = await requireTeam();
  if (!canSeeCeo(agency, userId, member.role)) redirect("/team");
  const sp = await searchParams;
  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);

  const supabase = await createClient();
  const [{ data: clients }, { data: billing }, { data: invoices }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, name, account_manager_id, start_date, archived_at").is("archived_at", null).order("name"),
    supabase.from("client_billing").select("client_id, monthly_fee, billing_day"),
    supabase.from("client_invoices").select("client_id, month, amount, status, paid_at, source").gte("month", monthKeyDate(shiftMonth(month, -5))).lte("month", monthKeyDate(month)),
    supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agency.id).order("display_name"),
  ]);
  const fees = new Map((billing ?? []).map((b) => [b.client_id, { fee: Number(b.monthly_fee), day: b.billing_day as number | null }]));
  const inv = (cid: string, m: string) => (invoices ?? []).find((i) => i.client_id === cid && i.month === monthKeyDate(m));
  const rows = (clients ?? []).map((c) => {
    const f = fees.get(c.id) ?? { fee: 0, day: null };
    const i = inv(c.id, month);
    const paid = i?.status === "paid";
    return { ...c, ...f, invoice: i, paid, state: invoiceState(paid, f.day, month, today), collected: paid ? Number(i?.amount ?? f.fee) : 0 };
  });
  const mrr = rows.reduce((n, r) => n + r.fee, 0);
  const collected = rows.reduce((n, r) => n + r.collected, 0);
  const owed = rows.filter((r) => !r.paid && r.fee > 0).reduce((n, r) => n + r.fee, 0);
  const paidCount = rows.filter((r) => r.paid).length;
  const late = rows.filter((r) => r.state === "late" && r.fee > 0);
  const name = (id: string | null) => members?.find((m) => m.user_id === id)?.display_name ?? "—";
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  // Collected in each of the last six months, for the trend.
  const trend = Array.from({ length: 6 }, (_, k) => shiftMonth(month, k - 5)).map((m) => ({
    m, total: (invoices ?? []).filter((i) => i.month === monthKeyDate(m) && i.status === "paid").reduce((n, i) => n + Number(i.amount ?? fees.get(i.client_id)?.fee ?? 0), 0),
  }));
  const peak = Math.max(1, ...trend.map((t) => t.total), mrr);

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">{isOwner(agency, userId) ? "Only you" : "Shared with you"} · {monthLabel(month)}</p>
          <h1 style={{ marginTop: 6 }}>CEO dashboard</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <Link className="btn sm line" href={`/team/ceo?month=${shiftMonth(month, -1)}`} aria-label="Previous month" scroll={false}>←</Link>
          {month !== today.slice(0, 7) && <Link className="btn sm line" href="/team/ceo" scroll={false}>This month</Link>}
          <Link className="btn sm line" href={`/team/ceo?month=${shiftMonth(month, 1)}`} aria-label="Next month" scroll={false}>→</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{money(mrr)}</b><span>Monthly recurring revenue · {rows.filter((r) => r.fee > 0).length} paying clients</span></div>
        <div className="stat"><b>{money(collected)}</b><span>Collected for {monthLabel(month).split(" ")[0]}</span></div>
        <div className={`stat ${owed ? "warn" : ""}`}><b>{money(owed)}</b><span>Still outstanding</span></div>
        <div className={`stat ${late.length ? "crit" : ""}`}><b>{paidCount} of {rows.length}</b><span>Paid this month{late.length ? ` · ${late.length} late` : ""}</span></div>
      </div>

      <div className="panel">
        <h2>Clients this month</h2>
        <div className="tablewrap">
          <table className="ceo-table">
            <thead><tr><th scope="col">Client</th><th scope="col">Account manager</th><th scope="col" className="kn">Monthly fee</th><th scope="col">Invoice due</th><th scope="col">{monthLabel(month).split(" ")[0]} invoice</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/team/clients/${r.id}`}><b>{r.name}</b></Link></td>
                  <td>{name(r.account_manager_id)}</td>
                  <td className="kn">{r.fee ? money(r.fee) : <span className="note">Not set</span>}</td>
                  <td>{r.day ? `Day ${r.day}` : <span className="note">—</span>}</td>
                  <td>
                    <span className={`pill ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                    {r.paid && r.invoice?.paid_at && (
                      <span className="note"> {new Date(r.invoice.paid_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })} · {r.invoice.source === "dubsado" ? "Dubsado" : "marked by hand"}</span>
                    )}
                  </td>
                  <td className="team-edit">
                    <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end", alignItems: "center" }}>
                      <PaidToggle clientId={r.id} month={month} paid={r.paid} amount={r.fee || null} />
                      <EditBilling clientId={r.id} clientName={r.name} fee={r.fee} day={r.day} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="note">No active clients.</p>}
      </div>

      <div className="cgrid pairs">
        <div className="panel">
          <h2>Collected, last 6 months</h2>
          <div className="ceo-bars" role="img" aria-label={trend.map((t) => `${monthLabel(t.m)}: ${money(t.total)}`).join(", ")}>
            {trend.map((t) => (
              <div key={t.m} className={`ceo-bar ${t.m === month ? "now" : ""}`} title={`${monthLabel(t.m)}: ${money(t.total)}`}>
                <span className="ceo-bar-val">{t.total ? money(t.total) : ""}</span>
                <i style={{ "--h": t.total / peak } as React.CSSProperties} />
                <span className="ceo-bar-label">{new Date(`${t.m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}</span>
              </div>
            ))}
          </div>
          <p className="note">This month&apos;s recurring revenue is {money(mrr)}, so a full month collected reaches that.</p>
        </div>
        <div className="panel">
          <h2>Paid status from Dubsado</h2>
          <p className="note">
            Payments come in through Zapier: Dubsado &ldquo;Payment Received&rdquo; → Webhooks by Zapier (POST) to <code>/api/webhooks/dubsado-payment</code>,
            with the same secret as the contract zap, sending the client&apos;s email, the amount and the payment date. Matching is by the client&apos;s Dubsado email.
            You can also mark a client paid by hand.
          </p>
          {isOwner(agency, userId) && (
            <>
              <h3 style={{ marginTop: 8 }}>Share this dashboard</h3>
              <ShareCeo admins={(members ?? []).filter((m) => m.role === "admin" && m.user_id !== userId)} shared={agency.ceo_shared_with ?? []} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
