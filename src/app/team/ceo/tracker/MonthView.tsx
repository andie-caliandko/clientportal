"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BUDGET, DEFAULT_LEAD_ROWS, FUNNEL_ROWS, MAGNET, fmtMoney, fmtNum, fmtPct, leadKey, monthSummary,
  type Daily, type IncomeRow, type Line, type MonthData, type Rating,
} from "@/lib/ceoTracker";
import { setDaily } from "./actions";
import { Num, SaveNote, Text, newId, useSheet } from "./TrackerBits";

export function MonthView({ month, initial, initialDaily, days, income, today }: {
  month: string; initial: MonthData; initialDaily: Daily; days: number; income: IncomeRow[]; today: string;
}) {
  const { data: d, save, state, setState } = useSheet<MonthData>(month, initial);
  const [daily, setDailyState] = useState<Daily>(initialDaily);
  const s = monthSummary(d, daily, income);
  const leadRows = d.leadRows ?? DEFAULT_LEAD_ROWS;
  const extra = d.extraIncome ?? [];
  const team = d.team ?? [];
  const expenses = d.expenses ?? [];
  const fromPortal = income.reduce((n, r) => n + r.amount, 0);
  const future = month > today.slice(0, 7);

  const cell = async (day: number, key: string, value: number) => {
    setDailyState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [day]: value } }));
    setState("saving");
    const r = await setDaily(`${month}-${String(day).padStart(2, "0")}`, key, value).catch(() => ({ error: "x" }));
    setState("error" in r && r.error ? "error" : "saved");
  };
  const n = (k: keyof MonthData) => (v: number | undefined) => save({ [k]: v ?? null } as Partial<MonthData>);
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const weekday = (day: number) => new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "narrow" });

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>

      <section className="trk-revenue" aria-label="Revenue">
        <div className="stat"><span>Goal monthly revenue</span><Num kind="money" label="Goal monthly revenue" value={d.goal} onSave={n("goal")} /></div>
        <div className="stat"><span>Starting monthly revenue</span><Num kind="money" label="Starting monthly revenue" value={d.starting} onSave={n("starting")} />
          {fromPortal > 0 && d.starting !== fromPortal && <button type="button" className="linkish" onClick={() => save({ starting: fromPortal })}>Use {fmtMoney(fromPortal)} from the CEO dashboard</button>}</div>
        <div className="stat calc"><span>New revenue needed</span><b>{fmtMoney(s.newNeeded)}</b></div>
        <div className="stat calc"><span>Projected revenue</span><b>{fmtMoney(s.projected)}</b>
          <small className="note">{s.paid < s.projected ? `${fmtMoney(s.paid)} paid so far` : "All paid"}</small></div>
        <div className="stat"><span>Actual ending monthly revenue</span><Num kind="money" label="Actual ending monthly revenue" value={d.ending} onSave={n("ending")} />
          {s.paid > 0 && d.ending !== s.paid && !future && <button type="button" className="linkish" onClick={() => save({ ending: s.paid })}>Use {fmtMoney(s.paid)} paid</button>}</div>
        <div className="stat calc"><span>Profit margin</span><b>{fmtPct(s.margin)}</b></div>
      </section>

      <section className="trk-pay" aria-label="What you can pay yourself">
        <div className="trk-col">
        <div className="panel trk-payme">
          <p className="eyebrow">What you can pay yourself</p>
          <p className="trk-big">{fmtMoney(s.takeHome)}</p>
          <p className="note">After paying your team, your expenses, setting aside taxes and reinvesting in the business.</p>
          <dl className="trk-dl">
            <div><dt>Income</dt><dd>{fmtMoney(s.incomeTotal)}</dd></div>
            <div><dt>Team pay</dt><dd>− {fmtMoney(s.salary)}</dd></div>
            <div><dt>Expenses (OPEX)</dt><dd>− {fmtMoney(s.opex)}</dd></div>
            <div className="strong"><dt>Profit</dt><dd>{fmtMoney(s.profit)}</dd></div>
            <div><dt>Taxes to set aside (<Num kind="pct" className="mini" label="Tax rate" value={s.taxRate} onSave={(v) => save({ taxRate: v ?? 0.15 })} />)</dt><dd>− {fmtMoney(s.taxes)}</dd></div>
            <div><dt>Reinvest in the business (<Num kind="pct" className="mini" label="Reinvest rate" value={s.reinvestRate} onSave={(v) => save({ reinvestRate: v ?? 0.3 })} />)</dt><dd>− {fmtMoney(s.reinvest)}</dd></div>
            <div className="strong"><dt>You can pay yourself</dt><dd>{fmtMoney(s.takeHome)}</dd></div>
          </dl>
        </div>
        <div className="panel trk-fill">
          <div className="trk-head"><h2>Team pay</h2><p className="note">What you paid each team member or contractor this month. It starts with last month&apos;s amounts.</p></div>
          <ul className="trk-lines">
            {team.map((t) => <EditLine key={t.id} line={t} what="Team member" onSave={(patch) => save({ team: team.map((e) => (e.id === t.id ? { ...e, ...patch } : e)) })} onRemove={() => save({ team: team.filter((e) => e.id !== t.id) })} />)}
          </ul>
          <AddRow placeholder="Add a team member or contractor" onAdd={(v) => save({ team: [...team, { id: newId(), label: v, amount: 0 }] })} />
          <p className="trk-total"><span>Total team pay</span><b>{fmtMoney(s.salary)}</b></p>
        </div>
        </div>

        <div className="panel">
          <div className="trk-head">
            <h2>Income</h2>
            <p className="note">Clients on a monthly retainer, from your <Link href={`/team/ceo?month=${month}`}>CEO dashboard</Link>. Change a fee or mark a payment there. Add anything else here.</p>
          </div>
          <ul className="trk-lines">
            {income.map((r) => (
              <li key={r.id}>
                <span className="trk-line-name">{r.clientId ? <Link href={`/team/clients/${r.clientId}`}>{r.label}</Link> : r.label}</span>
                <span className={`pill ${r.status === "paid" ? "ok" : future ? "info" : "warn"}`}>{r.status === "paid" ? "Paid" : future ? "Projected" : "Not paid yet"}</span>
                <b className="kn">{fmtMoney(r.amount)}</b>
              </li>
            ))}
            {extra.map((x) => <EditLine key={x.id} line={x} what="Payment" onSave={(patch) => save({ extraIncome: extra.map((e) => (e.id === x.id ? { ...e, ...patch } : e)) })} onRemove={() => save({ extraIncome: extra.filter((e) => e.id !== x.id) })} />)}
          </ul>
          {!income.length && !extra.length && <p className="note">No clients on a monthly retainer this month yet.</p>}
          <AddRow placeholder="Add a client or payment" onAdd={(v) => save({ extraIncome: [...extra, { id: newId(), label: v, amount: 0 }] })} />
          <p className="trk-total"><span>Total income</span><b>{fmtMoney(s.incomeTotal)}</b></p>
        </div>
      </section>

      <section className="trk-cards" aria-label="Scorecard">
        <Card title="Mindset">
          <Row label="Happiness (1 to 10)"><Num label="Happiness" value={d.happiness} onSave={n("happiness")} /></Row>
          <Row label="Routine consistency"><Num kind="pct" label="Routine consistency" value={d.routine} onSave={n("routine")} /></Row>
          <Row label="CEO identity rating (1 to 10)"><Num label="CEO identity rating" value={d.identity} onSave={n("identity")} /></Row>
        </Card>
        <Card title="Lead gen">
          <Row label="Total touch points" calc>{fmtNum(s.touchPoints, 0)}</Row>
          <Row label="Inbound leads"><Num label="Inbound leads" value={d.inboundLeads} onSave={n("inboundLeads")} /></Row>
          <Row label="Disco calls had from outbound" calc>{fmtNum(s.callsHad, 0)}</Row>
          <Row label="Touch points per booked call" calc>{fmtNum(s.touchPerCall)}</Row>
          <Row label="Disco calls had from inbound"><Num label="Disco calls had from inbound" value={d.inboundCalls} onSave={n("inboundCalls")} /></Row>
        </Card>
        <Card title="Sales">
          <Row label="Disco calls offered" calc>{fmtNum(s.callsOffered, 0)}</Row>
          <Row label="Disco calls had" calc>{fmtNum(s.callsHad, 0)}</Row>
          <Row label="Show rate" calc>{fmtPct(s.showRate)}</Row>
          <Row label="Proposal calls offered" calc>{fmtNum(s.proposalsOffered, 0)}</Row>
          <Row label="Proposal calls had" calc>{fmtNum(s.proposalsHad, 0)}</Row>
          <Row label="New clients" calc>{fmtNum(s.signed, 0)}</Row>
          <Row label="Close rate" calc>{fmtPct(s.closeRate)}</Row>
        </Card>
        <Card title="Delivery">
          <Row label="Number of clients"><Num label="Number of clients" value={d.clients} onSave={n("clients")} placeholder={income.filter((r) => r.clientId).length ? String(income.filter((r) => r.clientId).length) : undefined} /></Row>
          <Row label="Clients upgraded"><Num label="Clients upgraded" value={d.upgraded} onSave={n("upgraded")} /></Row>
          <Row label="Client cancellations"><Num label="Client cancellations" value={d.cancellations} onSave={n("cancellations")} /></Row>
          <Row label="Client churn" calc>{fmtPct(s.churn)}</Row>
        </Card>
        <Card title="Team">
          <Row label="Team members"><Num label="Team members" value={d.teamMembers} onSave={n("teamMembers")} placeholder={team.length ? String(team.length) : undefined} /></Row>
          <Row label="Revenue per team member" calc>{fmtMoney(s.revenuePerMember)}</Row>
          <Row label="Total team pay" calc>{fmtMoney(s.salary)}</Row>
        </Card>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Lead generation tracking</h2><p className="note">Type how many you did each day. Outreach rows add up to your touch points.</p></div>
        <div className="tablewrap trk-gridwrap">
          <table className="trk-grid">
            <thead><tr><th scope="col">Day</th>{dayList.map((x) => <th key={x} scope="col"><small>{weekday(x)}</small>{x}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>
              <tr className="trk-sub"><th colSpan={days + 2} scope="colgroup">Outreach</th></tr>
              {leadRows.map((r) => (
                <GridRow key={r} label={r} k={leadKey(r)} daily={daily} days={dayList} onCell={cell}
                  onRemove={() => save({ leadRows: leadRows.filter((x) => x !== r) })} />
              ))}
              <tr><td colSpan={days + 2}><AddRow placeholder="Add an outreach source (like LinkedIn)" onAdd={(v) => !leadRows.includes(v) && save({ leadRows: [...leadRows, v] })} /></td></tr>
              <tr className="trk-sub"><th colSpan={days + 2} scope="colgroup">Sales</th></tr>
              {FUNNEL_ROWS.map((r) => <GridRow key={r.key} label={r.label} k={r.key} daily={daily} days={dayList} onCell={cell} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>MAGNET framework</h2><p className="note">Rate each one for the month.</p></div>
        <div className="trk-magnet">
          {MAGNET.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              {g.items.map((item) => (
                <div key={item} className="trk-rate" role="radiogroup" aria-label={item}>
                  <span>{item}</span>
                  <span className="trk-rate-btns">
                    {(["green", "yellow", "red"] as Rating[]).map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={d.magnet?.[item] === r} className={`dot ${r}`} title={r[0].toUpperCase() + r.slice(1)}
                        onClick={() => save({ magnet: { ...(d.magnet ?? {}), [item]: r } })}><span className="sr-only">{r}</span></button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="trk-two">
        <div className="panel">
          <h2>Goal budget</h2>
          <p className="note">How you want this month&apos;s income split.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th scope="col">Category</th><th scope="col">Goal</th><th scope="col">Of this month&apos;s income</th></tr></thead>
              <tbody>
                {s.budget.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    <td><Num kind="pct" className="mini" label={`${b.label} goal`} value={b.pct} onSave={(v) => save({ budget: { ...(d.budget ?? {}), [b.key]: v ?? BUDGET.find((x) => x.key === b.key)!.pct } })} /></td>
                    <td className="kn">{fmtMoney(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>Personal reflections</h2>
          <Text area label="Personal reflections" value={d.reflection} onSave={(v) => save({ reflection: v })} placeholder="How did this month feel? What got in the way, and what went well?" />
        </div>
      </section>

      <section aria-label="Expenses">
        <div className="panel">
          <div className="trk-head"><h2>Expenses</h2><p className="note">Software, subscriptions and anything else. They add up to your OPEX, and start with last month&apos;s list.</p></div>
          <ul className="trk-lines">
            {expenses.map((e) => <EditLine key={e.id} line={e} what="Expense" onSave={(patch) => save({ expenses: expenses.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) })} onRemove={() => save({ expenses: expenses.filter((x) => x.id !== e.id) })} />)}
          </ul>
          <AddRow placeholder="Add an expense (like Dubsado)" onAdd={(v) => save({ expenses: [...expenses, { id: newId(), label: v, amount: 0 }] })} />
          <p className="trk-total"><span>Total OPEX</span><b>{fmtMoney(s.opex)}</b></p>
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="panel trk-card"><h2>{title}</h2><dl>{children}</dl></div>;
}

function Row({ label, calc, children }: { label: string; calc?: boolean; children: React.ReactNode }) {
  return <div className={calc ? "calc" : ""}><dt>{label}</dt><dd>{children}</dd></div>;
}

function EditLine({ line, what, onSave, onRemove }: { line: Line; what: string; onSave: (patch: Partial<Line>) => void; onRemove: () => void }) {
  return (
    <li className="edit">
      <Text label={what} value={line.label} onSave={(label) => onSave({ label })} />
      <Num kind="money" label={`${line.label || what} amount`} value={line.amount} onSave={(v) => onSave({ amount: v ?? 0 })} />
      <button type="button" className="trk-x" aria-label={`Remove ${line.label || what}`} onClick={onRemove}>×</button>
    </li>
  );
}

function GridRow({ label, k, daily, days, onCell, onRemove }: {
  label: string; k: string; daily: Daily; days: number[]; onCell: (day: number, key: string, v: number) => void; onRemove?: () => void;
}) {
  const total = Object.values(daily[k] ?? {}).reduce((a, b) => a + b, 0);
  return (
    <tr>
      <th scope="row"><span className="trk-rowname">{label}{onRemove && <button type="button" className="trk-x" aria-label={`Remove ${label}`} onClick={onRemove}>×</button>}</span></th>
      {days.map((x) => <td key={x}><Cell value={daily[k]?.[x]} label={`${label}, day ${x}`} onSave={(v) => onCell(x, k, v)} /></td>)}
      <td className="kn"><b>{fmtNum(total, 0)}</b></td>
    </tr>
  );
}

function Cell({ value, label, onSave }: { value: number | undefined; label: string; onSave: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value) : "");
  return (
    <input className="trk-cell" inputMode="numeric" aria-label={label} value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={() => { const v = Number(text || 0); if (Number.isFinite(v) && v !== (value ?? 0)) onSave(v); }} />
  );
}

function AddRow({ placeholder, onAdd, button = "Add" }: { placeholder: string; onAdd: (v: string) => void; button?: string }) {
  const [text, setText] = useState("");
  const add = () => { const v = text.trim(); if (v) { onAdd(v.slice(0, 80)); setText(""); } };
  return (
    <span className="trk-add">
      <input className="input" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" className="btn sm line" onClick={add} disabled={!text.trim()}>{button}</button>
    </span>
  );
}
