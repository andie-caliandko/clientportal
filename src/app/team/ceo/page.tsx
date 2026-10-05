import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeCeo, invoiceState, isOwner, monthKeyDate } from "@/lib/ceo";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { EditBilling, PaidToggle, ShareCeo, type PastMonth } from "./CeoForms";
import { AddClientButton } from "../TeamForms";
import { RenewContract, SetContract } from "./ContractForms";
import { contractStatus } from "@/lib/contracts";
import { ImportRevenue, RemoveBatch } from "./RevenueImport";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
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
  const [{ data: clients }, { data: billing }, { data: invoices }, { data: members }, { data: signups }, { data: contractRows }, { data: imported }] = await Promise.all([
    supabase.from("clients").select("id, name, account_manager_id, start_date, archived_at").is("archived_at", null).order("name"),
    supabase.from("client_billing").select("client_id, monthly_fee, billing_day"),
    supabase.from("client_invoices").select("client_id, month, amount, status, paid_at, source"),
    supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agency.id).order("display_name"),
    supabase.from("client_signups").select("id, email, name, project, contract_signed_at, paid_at, amount").is("client_id", null).order("created_at", { ascending: false }),
    supabase.from("client_contracts").select("id, client_id, kind, start_date, months, end_date, status, term_number, note").order("start_date", { ascending: false }),
    supabase.from("revenue_entries").select("paid_on, amount, batch_id, batch_name, created_at"),
  ]);
  // Each client's current contract (the newest term), and how many terms they've had.
  const contractFor = (cid: string) => (contractRows ?? []).find((c) => c.client_id === cid) ?? null;
  const termsFor = (cid: string) => (contractRows ?? []).filter((c) => c.client_id === cid).length;
  const fees = new Map((billing ?? []).map((b) => [b.client_id, { fee: Number(b.monthly_fee), day: b.billing_day as number | null }]));
  const inv = (cid: string, m: string) => (invoices ?? []).find((i) => i.client_id === cid && i.month === monthKeyDate(m));
  const rows = (clients ?? []).map((c) => {
    const f0 = fees.get(c.id) ?? { fee: 0, day: null };
    // One-time projects aren't monthly revenue.
    const isProject = contractFor(c.id)?.kind === "project";
    const f = { ...f0, fee: isProject ? 0 : f0.fee, projectFee: isProject ? f0.fee : 0 };
    if (isProject) {
      // A one-time project is paid once: show that payment (whenever it was), not a bill every month.
      const payment = (invoices ?? []).filter((x) => x.client_id === c.id && x.status === "paid").sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))[0];
      return { ...c, ...f, isProject, invoice: payment, paid: !!payment, paidMonth: payment ? payment.month.slice(0, 7) : month, state: (payment ? "paid" : "due") as ReturnType<typeof invoiceState> };
    }
    const i = inv(c.id, month);
    const paid = i?.status === "paid";
    return { ...c, ...f, isProject, invoice: i, paid, paidMonth: month, state: invoiceState(paid, f.day, month, today) };
  });
  const projectClients = new Set(rows.filter((r) => r.isProject).map((r) => r.id));
  const mrr = rows.reduce((n, r) => n + r.fee, 0);
  // Collected in a month: every invoice marked paid for it, at the amount paid (or the client's fee
  // if no amount was entered). One calculation for the number up top and the chart, so they always match.
  // A project payment with no amount entered never borrows the fee, so it can't be counted twice.
  const collectedIn = (m: string) =>
    (invoices ?? []).filter((i) => i.month === monthKeyDate(m) && i.status === "paid")
      .reduce((n, i) => n + Number(i.amount ?? (projectClients.has(i.client_id) ? 0 : fees.get(i.client_id)?.fee ?? 0)), 0)
    + (imported ?? []).filter((r) => r.paid_on.startsWith(m)).reduce((n, r) => n + Number(r.amount), 0);
  const collected = collectedIn(month);
  // Year to date: everything logged in the portal this year, plus revenue imported from a spreadsheet.
  const portalPaid = (invoices ?? []).filter((i) => i.status === "paid");
  const portalTotal = (filter: (month: string) => boolean) =>
    portalPaid.filter((i) => filter(String(i.month).slice(0, 7))).reduce((n, i) => n + Number(i.amount ?? (projectClients.has(i.client_id) ? 0 : fees.get(i.client_id)?.fee ?? 0)), 0);
  const importedTotal = (filter: (day: string) => boolean) => (imported ?? []).filter((r) => filter(r.paid_on)).reduce((n, r) => n + Number(r.amount), 0);
  const year = today.slice(0, 4);
  const yearTotal = portalTotal((m) => m.startsWith(year)) + importedTotal((d) => d.startsWith(year));
  const batches = [...new Map((imported ?? []).map((r) => [r.batch_id, r])).values()].map((b) => ({
    id: b.batch_id, name: b.batch_name ?? "Imported revenue", created: b.created_at,
    lines: (imported ?? []).filter((r) => r.batch_id === b.batch_id).length,
    total: (imported ?? []).filter((r) => r.batch_id === b.batch_id).reduce((n, r) => n + Number(r.amount), 0),
  }));
  const owed = rows.filter((r) => !r.paid && r.fee > 0).reduce((n, r) => n + r.fee, 0);
  const paidCount = rows.filter((r) => r.paid && (!r.isProject || r.paidMonth === month)).length;
  const late = rows.filter((r) => r.state === "late" && r.fee > 0);
  const name = (id: string | null) => members?.find((m) => m.user_id === id)?.display_name ?? "—";
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  // Collected in each of the last six months, for the trend.
  const trend = Array.from({ length: 6 }, (_, k) => shiftMonth(month, k - 5)).map((m) => ({
    m, total: collectedIn(m),
  }));
  const peak = Math.max(1, ...trend.map((t) => t.total), mrr);

  // Payment history: every month from their start (or a year back) through this month, newest first.
  const historyFor = (cid: string, start: string | null): PastMonth[] => {
    const yearBack = shiftMonth(month, -11);
    const first = start && start.slice(0, 7) < month ? (start.slice(0, 7) < shiftMonth(month, -35) ? shiftMonth(month, -35) : start.slice(0, 7)) : yearBack;
    const list: PastMonth[] = [];
    for (let m = month; m >= first; m = shiftMonth(m, -1)) {
      const i = inv(cid, m);
      list.push({ month: m, label: monthLabel(m), paid: i?.status === "paid", amount: i?.amount != null ? Number(i.amount) : null, source: i?.source ?? null,
        paidOn: i?.status === "paid" && i.paid_at ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(i.paid_at)) : null });
    }
    return list;
  };

  // Contracts: what each client is on and where they are in it.
  const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const contractInfo = (cid: string) => {
    const c = contractFor(cid);
    if (!c) return null;
    const st = contractStatus(c, today);
    const project = c.kind === "project";
    const terms = termsFor(cid);
    const label =
      st.state === "renewal" ? { t: project ? "Follow up" : "Renewal talk due", cls: "warn" }
      : st.state === "ending" ? { t: `${project ? "Wraps up" : "Ends"} in ${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"}`, cls: "crit" }
      : st.state === "ended" ? { t: c.status === "ended" ? "Not renewing" : "Ended", cls: "info" }
      : st.state === "upcoming" ? { t: `Starts ${nice(c.start_date)}`, cls: "info" }
      : { t: "On track", cls: "ok" };
    const ongoing = c.kind === "ongoing";
    const nextStart = st.end ? new Date(Date.parse(`${st.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null;
    return { c, st, project, ongoing, terms, label: ongoing && st.state === "active" ? { t: "Ongoing", cls: "ok" } : label, nextStart };
  };

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

      <div className="stats ceo-totals">
        <div className="stat"><b>{money(yearTotal)}</b><span>Brought in this year, {year} year to date{(imported ?? []).some((r) => r.paid_on.startsWith(year)) ? " · includes imported revenue" : ""}</span></div>
      </div>

      <div className="stats">
        <div className="stat"><b>{money(mrr)}</b><span>Monthly recurring revenue · {rows.filter((r) => r.fee > 0).length} paying clients</span></div>
        <div className="stat"><b>{money(collected)}</b><span>Collected for {monthLabel(month).split(" ")[0]}</span></div>
        <div className={`stat ${owed ? "warn" : ""}`}><b>{money(owed)}</b><span>Still outstanding</span></div>
        <div className={`stat ${late.length ? "crit" : ""}`}><b>{paidCount} of {rows.length}</b><span>Paid this month{late.length ? ` · ${late.length} late` : ""}</span></div>
      </div>

      {(signups ?? []).length > 0 && (
        <div className="panel new-signups">
          <div>
            <p className="eyebrow">From Dubsado</p>
            <h2 style={{ marginTop: 4 }}>New clients to set up</h2>
            <p className="note">They signed or paid in Dubsado but don&apos;t have a portal yet. Setting one up links their contract and payment.</p>
          </div>
          <div className="tablewrap">
            <table className="ceo-table">
              <thead><tr><th scope="col">New client</th><th scope="col">Contract</th><th scope="col">Invoice</th><th scope="col"><span className="sr-only">Set up</span></th></tr></thead>
              <tbody>
                {(signups ?? []).map((n) => (
                  <tr key={n.id}>
                    <td><b>{n.name || n.project || n.email}</b><br /><span className="note">{n.email}{n.project && n.name ? ` · ${n.project}` : ""}</span></td>
                    <td>{n.contract_signed_at ? <span className="pill ok">Signed {new Date(n.contract_signed_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}</span> : <span className="pill warn">Not yet</span>}</td>
                    <td>{n.paid_at ? <span className="pill ok">Paid{n.amount ? ` ${money(Number(n.amount))}` : ""} · {new Date(n.paid_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}</span> : <span className="pill warn">Not paid yet</span>}</td>
                    <td className="team-edit">
                      <AddClientButton label="Set up portal" members={members ?? []} agencyId={agency.id} meId={userId}
                        defaults={{ name: n.project ?? n.name ?? "", contactName: n.name ?? "", contactEmail: n.email }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Clients this month</h2>
        <div className="tablewrap">
          <table className="ceo-table">
            <thead><tr><th scope="col">Client</th><th scope="col">Account manager</th><th scope="col">Contract</th><th scope="col" className="kn">Monthly fee</th><th scope="col">Invoice due</th><th scope="col">{monthLabel(month).split(" ")[0]} invoice</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/team/clients/${r.id}`}><b>{r.name}</b></Link></td>
                  <td>{name(r.account_manager_id)}</td>
                  <td className="ceo-contract">
                    {(() => {
                      const k = contractInfo(r.id);
                      if (!k) return <SetContract clientId={r.id} clientName={r.name} contract={null} clientStart={r.start_date} />;
                      return (
                        <>
                          <span>{k.ongoing ? "Ongoing, no set end" : k.project ? "One-time project" : `${k.c.months}-month retainer`}{k.terms > 1 ? ` · ${ordinal(k.c.term_number ?? k.terms)} term` : ""}</span>
                          <span className="note">{k.st.state === "upcoming" ? `Starts ${nice(k.c.start_date)}`
                            : k.ongoing ? `Month ${k.st.month} · since ${nice(k.c.start_date)}`
                            : k.project ? `${Math.max(0, k.st.daysLeft)} days left · ends ${nice(k.st.end!)}`
                            : `Month ${k.st.month} of ${k.c.months} · ends ${nice(k.st.end!)}`}</span>
                          <span className="ceo-contract-row">
                            <span className={`pill ${k.label.cls}`}>{k.label.t}</span>
                            {k.c.status === "active" && k.nextStart && <RenewContract clientName={r.name} contract={k.c} nextStartLabel={nice(k.nextStart)} />}
                            <SetContract clientId={r.id} clientName={r.name} contract={k.c.status === "active" ? k.c : null} clientStart={r.start_date} />
                          </span>
                        </>
                      );
                    })()}
                  </td>
                  <td className="kn">
                    <EditBilling clientId={r.id} clientName={r.name} fee={r.fee || r.projectFee} day={r.day} history={historyFor(r.id, r.start_date)}
                      label={r.fee ? <><b>{money(r.fee)}</b><span className="note">Edit</span></> : r.projectFee ? <><b>{money(r.projectFee)}</b><span className="note">project fee · Edit</span></> : <span className="fee-set">Set fee</span>} />
                  </td>
                  <td>{r.day ? `Day ${r.day}` : <span className="note">—</span>}</td>
                  <td>
                    {r.isProject && !r.paid ? <span className="pill warn">Not paid yet</span> : <span className={`pill ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>}
                    {r.paid && r.invoice?.paid_at && (
                      <span className="note"> {new Date(r.invoice.paid_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", ...(r.isProject ? { year: "numeric" } : {}) })} · {r.isProject ? "project payment" : r.invoice.source === "dubsado" ? "Dubsado" : "marked by hand"}</span>
                    )}
                  </td>
                  <td className="team-edit">
                    <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end", alignItems: "center" }}>
                      <PaidToggle clientId={r.id} clientName={r.name} month={r.paidMonth} paid={r.paid} amount={(r.paid ? Number(r.invoice?.amount ?? 0) || null : null) ?? (r.fee || r.projectFee || null)} project={r.isProject} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="note">No active clients.</p>}
      </div>

      {(contractRows ?? []).length > 0 && (() => {
        // A window from 3 months back to 12 months ahead, one column per month.
        const first = shiftMonth(today.slice(0, 7), -3);
        const months = Array.from({ length: 15 }, (_, k) => shiftMonth(first, k));
        const from = Date.parse(`${first}-01T00:00:00Z`);
        const to = Date.parse(`${shiftMonth(first, 15)}-01T00:00:00Z`);
        const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(`${d}T00:00:00Z`) - from) / (to - from)) * 100));
        const withContracts = (clients ?? []).map((cl) => ({ cl, k: contractInfo(cl.id) })).filter((x) => x.k);
        return (
          <div className="panel">
            <h2>Contract timeline</h2>
            <p className="note">Each bar is a client&apos;s current term. The marker is when to start the renewal talk (month 5 of 6) or, for one-time projects, the follow-up.</p>
            <div className="tablewrap">
              <div className="ct-timeline">
                <div className="ct-head">
                  <span />
                  <div className="ct-months">{months.map((m) => <span key={m}>{new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}{m.endsWith("-01") ? ` ’${m.slice(2, 4)}` : ""}</span>)}</div>
                </div>
                {withContracts.map(({ cl, k }) => (
                  <div className="ct-row" key={cl.id}>
                    <span className="ct-name">{cl.name}</span>
                    <div className="ct-track">
                      <span className="ct-today" style={{ left: `${pos(today)}%` }} aria-hidden="true" />
                      {/* Ongoing contracts run off the right edge: no end. */}
                      <span className={`ct-bar ${k!.label.cls} ${k!.ongoing ? "ongoing" : ""}`} style={{ left: `${pos(k!.c.start_date)}%`, width: `${Math.max(1, (k!.st.end ? pos(k!.st.end) : 100) - pos(k!.c.start_date))}%` }}
                        title={`${cl.name}: ${nice(k!.c.start_date)} – ${k!.st.end ? nice(k!.st.end) : "ongoing"} · ${k!.label.t}`}>
                        <span className="ct-bar-label">{k!.ongoing ? "Ongoing" : k!.project ? "Project" : `${k!.c.months} mo`}</span>
                      </span>
                      {k!.c.status === "active" && k!.st.flag && <span className="ct-flag" style={{ left: `${pos(k!.st.flag)}%` }} title={`${k!.project ? "Follow up" : "Renewal talk"} from ${nice(k!.st.flag)}`} aria-label={`${k!.project ? "Follow up" : "Renewal talk"} from ${nice(k!.st.flag)}`} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ul className="ct-key" aria-label="Key">
              <li><i className="ct-bar ok" /> On track</li><li><i className="ct-bar warn" /> Renewal talk due</li><li><i className="ct-bar crit" /> Ending soon</li><li><i className="ct-flag-key" /> Renewal marker</li><li><i className="ct-today-key" /> Today</li>
            </ul>
          </div>
        );
      })()}

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
          <h3 style={{ marginTop: 8 }}>Past revenue</h3>
          <p className="note">Money from earlier this year, before the portal, imported from a spreadsheet. It counts toward the year-to-date total and the 6-month chart.</p>
          <ImportRevenue clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))} loggedKeys={portalPaid.map((i) => `${i.client_id}|${String(i.month).slice(0, 7)}`)} />
          {batches.length > 0 && (
            <ul className="list">
              {batches.map((b) => (
                <li key={b.id}>
                  <span><b>{b.name}</b><br /><span className="note">{b.lines} lines · imported {new Date(b.created).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}</span></span>
                  <span className="r kn"><b>{money(b.total)}</b> <RemoveBatch batchId={b.id} name={b.name} /></span>
                </li>
              ))}
            </ul>
          )}
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
