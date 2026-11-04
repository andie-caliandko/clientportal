import Link from "next/link";
import { fmtMoney, fmtNum, fmtPct, yearSummary, type MonthData, type MonthSummary } from "@/lib/ceoTracker";

type M = { month: string; saved: boolean; data: MonthData; s: MonthSummary };
type Fmt = (n: number | null | undefined) => string;
const whole: Fmt = (n) => fmtNum(n, 0);

/** Each row: how a month shows it, and how the year adds it up. */
const ROWS: { group: string; rows: { label: string; m: (x: M) => number | null | undefined; y: (y: ReturnType<typeof yearSummary>) => number | null; fmt: Fmt }[] }[] = [
  { group: "Revenue", rows: [
    { label: "Goal monthly revenue", m: (x) => x.s.goal || null, y: () => null, fmt: fmtMoney },
    { label: "Starting monthly revenue", m: (x) => x.s.starting || null, y: () => null, fmt: fmtMoney },
    { label: "Projected (CEO dashboard)", m: (x) => x.s.projected || null, y: (y) => y.income, fmt: fmtMoney },
    { label: "Actual ending revenue", m: (x) => x.s.ending || null, y: (y) => y.revenue, fmt: fmtMoney },
    { label: "Profit margin", m: (x) => x.s.margin, y: (y) => y.margin, fmt: fmtPct },
  ] },
  { group: "Mindset", rows: [
    { label: "Happiness", m: (x) => x.data.happiness, y: (y) => y.happiness, fmt: (n) => fmtNum(n) },
    { label: "Routine consistency", m: (x) => x.data.routine, y: (y) => y.routine, fmt: fmtPct },
    { label: "CEO identity rating", m: (x) => x.data.identity, y: (y) => y.identity, fmt: (n) => fmtNum(n) },
  ] },
  { group: "Lead gen", rows: [
    { label: "Inbound leads", m: (x) => x.s.inboundLeads, y: (y) => y.inboundLeads, fmt: whole },
    { label: "Touch points", m: (x) => x.s.touchPoints, y: (y) => y.touchPoints, fmt: whole },
    { label: "Disco calls had from outbound", m: (x) => x.s.callsHad, y: (y) => y.callsHad, fmt: whole },
    { label: "Touch points per booked call", m: (x) => x.s.touchPerCall, y: (y) => y.touchPerCall, fmt: (n) => fmtNum(n) },
    { label: "Disco calls had from inbound", m: (x) => x.s.inboundCalls, y: (y) => y.inboundCalls, fmt: whole },
  ] },
  { group: "Delivery", rows: [
    { label: "Clients", m: (x) => x.data.clients, y: (y) => y.clientsServed, fmt: whole },
    { label: "Clients upgraded", m: (x) => x.data.upgraded, y: (y) => y.upgraded, fmt: whole },
    { label: "Cancellations", m: (x) => x.data.cancellations, y: (y) => y.cancellations, fmt: whole },
    { label: "Churn", m: (x) => x.s.churn, y: (y) => y.churn, fmt: fmtPct },
  ] },
  { group: "Sales", rows: [
    { label: "Disco calls offered", m: (x) => x.s.callsOffered, y: (y) => y.callsOffered, fmt: whole },
    { label: "Disco calls had", m: (x) => x.s.callsHad, y: (y) => y.callsHad, fmt: whole },
    { label: "Show rate", m: (x) => x.s.showRate, y: (y) => y.showRate, fmt: fmtPct },
    { label: "New clients", m: (x) => x.s.signed, y: (y) => y.signed, fmt: whole },
    { label: "Close rate", m: (x) => x.s.closeRate, y: (y) => y.closeRate, fmt: fmtPct },
  ] },
  { group: "Pay", rows: [
    { label: "Team pay", m: (x) => x.s.salary || null, y: (y) => y.salary, fmt: fmtMoney },
    { label: "OPEX", m: (x) => x.s.opex || null, y: (y) => y.opex, fmt: fmtMoney },
    { label: "Profit", m: (x) => (x.s.incomeTotal ? x.s.profit : null), y: (y) => y.profit, fmt: fmtMoney },
    { label: "Taxes to set aside", m: (x) => x.s.taxes || null, y: (y) => y.taxes, fmt: fmtMoney },
    { label: "You could pay yourself", m: (x) => (x.s.incomeTotal ? x.s.takeHome : null), y: (y) => y.takeHome, fmt: fmtMoney },
  ] },
];

export function YearView({ year, months, today }: { year: string; months: M[]; today: string }) {
  const y = yearSummary(months);
  const peak = Math.max(1, ...months.map((m) => Math.max(m.s.ending, m.s.goal)));
  return (
    <div className="trk">
      <section className="stats trk-yearstats">
        <div className="stat"><b>{fmtMoney(y.revenue)}</b><span>Revenue in {year}</span></div>
        <div className="stat"><b>{fmtMoney(y.profit)}</b><span>Profit</span></div>
        <div className="stat"><b>{fmtMoney(y.takeHome)}</b><span>You could pay yourself</span></div>
        <div className="stat"><b>{fmtPct(y.closeRate)}</b><span>Close rate</span></div>
      </section>

      <section className="panel">
        <h2>Ending revenue by month</h2>
        <div className="trk-bars" role="img" aria-label={months.map((m) => `${m.month}: ${fmtMoney(m.s.ending)}${m.s.goal ? ` of ${fmtMoney(m.s.goal)} goal` : ""}`).join(", ")}>
          {months.map((m) => (
            <Link key={m.month} href={`/team/ceo/tracker?month=${m.month}`} className={`trk-bar ${m.month === today.slice(0, 7) ? "now" : ""}`}
              title={`${fmtMoney(m.s.ending)}${m.s.goal ? ` · goal ${fmtMoney(m.s.goal)}` : ""}`}>
              <span className="trk-bar-val">{m.s.ending ? fmtMoney(m.s.ending) : ""}</span>
              <span className="trk-bar-track">
                <i style={{ "--h": m.s.ending / peak } as React.CSSProperties} />
                {m.s.goal > 0 && <em style={{ "--h": m.s.goal / peak } as React.CSSProperties} aria-hidden="true" />}
              </span>
              <span className="trk-bar-label">{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}</span>
            </Link>
          ))}
        </div>
        <p className="note trk-legend"><span className="key bar" /> Ending revenue <span className="key goal" /> Goal</p>
      </section>

      <section className="panel">
        <h2>{year} overview</h2>
        <div className="tablewrap">
          <table className="trk-year">
            <thead>
              <tr><th scope="col">Metric</th>{months.map((m) => <th key={m.month} scope="col"><Link href={`/team/ceo/tracker?month=${m.month}`}>{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}</Link></th>)}<th scope="col">{year}</th></tr>
            </thead>
            <tbody>
              {ROWS.map((g) => [
                <tr key={g.group} className="trk-sub"><th colSpan={months.length + 2} scope="colgroup">{g.group}</th></tr>,
                ...g.rows.map((r) => (
                  <tr key={g.group + r.label}>
                    <th scope="row">{r.label}</th>
                    {months.map((m) => <td key={m.month} className="kn">{m.saved || Object.keys(m.data).length ? r.fmt(r.m(m) ?? null) : ""}</td>)}
                    <td className="kn"><b>{r.fmt(r.y(y))}</b></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
