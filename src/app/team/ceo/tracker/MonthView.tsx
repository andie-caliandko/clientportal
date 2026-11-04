"use client";

import { useState } from "react";
import {
  BUDGET, CONTENT_ROWS, DEFAULT_HABIT_ROWS, DEFAULT_LEAD_ROWS, FUNNEL_ROWS, MAGNET, fmtMoney, fmtNum, fmtPct, habitKey, leadKey, monthSummary,
  type Daily, type Expense, type Goal, type IncomeRow, type MonthData, type Rating,
} from "@/lib/ceoTracker";
import { setDaily } from "./actions";
import { Num, SaveNote, Text, newId, useSheet } from "./TrackerBits";

type Portal = { rows: { clientId: string; label: string; retainer: number }[]; total: number; clients: number };

export function MonthView({ month, initial, initialDaily, days, lastExpenses, lastIncome, portal }: {
  month: string; initial: MonthData; initialDaily: Daily; days: number; lastExpenses: Expense[]; lastIncome: IncomeRow[]; portal: Portal;
}) {
  const { data: d, save, state, setState } = useSheet<MonthData>(month, initial);
  const [daily, setDailyState] = useState<Daily>(initialDaily);
  const s = monthSummary(d, daily);
  const leadRows = d.leadRows ?? DEFAULT_LEAD_ROWS;
  const habitRows = d.habitRows ?? DEFAULT_HABIT_ROWS;
  const payees = d.payees ?? [];
  const income = d.income ?? [];
  const expenses = d.expenses ?? [];

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
          {portal.total > 0 && d.starting !== portal.total && <button type="button" className="linkish" onClick={() => save({ starting: portal.total })}>Use {fmtMoney(portal.total)} from the portal</button>}</div>
        <div className="stat calc"><span>New revenue needed</span><b>{fmtMoney(s.newNeeded)}</b></div>
        <div className="stat calc"><span>Projected revenue</span><b>{fmtMoney(s.projected || portal.total)}</b>
          <small className="note">{s.projected ? "Retainers in the income table below" : "Retainers on the books in the portal"}</small></div>
        <div className="stat"><span>Actual ending monthly revenue</span><Num kind="money" label="Actual ending monthly revenue" value={d.ending} onSave={n("ending")} /></div>
        <div className="stat calc"><span>Profit margin</span><b>{fmtPct(s.margin)}</b></div>
      </section>

      <section className="trk-cards" aria-label="Scorecard">
        <Card title="Mindset">
          <Line label="Happiness (1 to 10)"><Num label="Happiness" value={d.happiness} onSave={n("happiness")} /></Line>
          <Line label="Routine consistency"><Num kind="pct" label="Routine consistency" value={d.routine} onSave={n("routine")} /></Line>
          <Line label="CEO identity rating (1 to 10)"><Num label="CEO identity rating" value={d.identity} onSave={n("identity")} /></Line>
        </Card>
        <Card title="Authority">
          <Line label="Social media posts" calc>{fmtNum(s.posts, 0)}</Line>
          <Line label="Inbound leads"><Num label="Inbound leads" value={d.inboundLeads} onSave={n("inboundLeads")} /></Line>
          <Line label="Leads per post" calc>{fmtNum(s.leadsPerPost)}</Line>
        </Card>
        <Card title="Lead gen">
          <Line label="Total touch points" calc>{fmtNum(s.touchPoints, 0)}</Line>
          <Line label="Disco calls had from outbound" calc>{fmtNum(s.callsHad, 0)}</Line>
          <Line label="Touch points per booked call" calc>{fmtNum(s.touchPerCall)}</Line>
          <Line label="Disco calls had from inbound"><Num label="Disco calls had from inbound" value={d.inboundCalls} onSave={n("inboundCalls")} /></Line>
          <Line label="Disco calls had per post" calc>{fmtNum(s.callsPerPost)}</Line>
        </Card>
        <Card title="Sales">
          <Line label="Disco calls offered" calc>{fmtNum(s.callsOffered, 0)}</Line>
          <Line label="Disco calls had" calc>{fmtNum(s.callsHad, 0)}</Line>
          <Line label="Show rate" calc>{fmtPct(s.showRate)}</Line>
          <Line label="New clients" calc>{fmtNum(s.signed, 0)}</Line>
          <Line label="Close rate" calc>{fmtPct(s.closeRate)}</Line>
        </Card>
        <Card title="Delivery">
          <Line label="Number of clients"><Num label="Number of clients" value={d.clients} onSave={n("clients")} placeholder={portal.clients ? String(portal.clients) : undefined} /></Line>
          <Line label="Clients upgraded"><Num label="Clients upgraded" value={d.upgraded} onSave={n("upgraded")} /></Line>
          <Line label="Client cancellations"><Num label="Client cancellations" value={d.cancellations} onSave={n("cancellations")} /></Line>
          <Line label="Client churn" calc>{fmtPct(s.churn)}</Line>
        </Card>
        <Card title="Team">
          <Line label="Team members"><Num label="Team members" value={d.teamMembers} onSave={n("teamMembers")} /></Line>
          <Line label="Revenue per team member" calc>{fmtMoney(s.revenuePerMember)}</Line>
          <Line label="Total spent on salary" calc>{fmtMoney(s.salary)}</Line>
        </Card>
        <Card title="Budget">
          <Line label="Total OPEX" calc>{fmtMoney(s.opex)}</Line>
          <Line label="Saved for taxes" calc>{fmtMoney(s.taxes)}</Line>
          <Line label="Total profit" calc>{fmtMoney(s.profit)}</Line>
        </Card>
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
              <tr className="trk-sub"><th colSpan={days + 2} scope="colgroup">Content</th></tr>
              {CONTENT_ROWS.map((r) => <GridRow key={r.key} label={r.label} k={r.key} daily={daily} days={dayList} onCell={cell} />)}
              <tr className="trk-sub"><th colSpan={days + 2} scope="colgroup">Sales</th></tr>
              {FUNNEL_ROWS.map((r) => <GridRow key={r.key} label={r.label} k={r.key} daily={daily} days={dayList} onCell={cell} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Habit tracker</h2><p className="note">Tick the days you did it.</p></div>
        <div className="tablewrap trk-gridwrap">
          <table className="trk-grid habits">
            <thead><tr><th scope="col">Habit</th>{dayList.map((x) => <th key={x} scope="col"><small>{weekday(x)}</small>{x}</th>)}<th scope="col">Days</th></tr></thead>
            <tbody>
              {habitRows.map((h) => (
                <tr key={h}>
                  <th scope="row"><span className="trk-rowname">{h}<button type="button" className="trk-x" aria-label={`Remove ${h}`} onClick={() => save({ habitRows: habitRows.filter((x) => x !== h) })}>×</button></span></th>
                  {dayList.map((x) => (
                    <td key={x}><input type="checkbox" aria-label={`${h}, day ${x}`} checked={(daily[habitKey(h)]?.[x] ?? 0) > 0} onChange={(e) => cell(x, habitKey(h), e.target.checked ? 1 : 0)} /></td>
                  ))}
                  <td className="kn">{s.habits.find((x) => x.label === h)?.days ?? 0}</td>
                </tr>
              ))}
              <tr><td colSpan={days + 2}><AddRow placeholder="Add a habit" onAdd={(v) => !habitRows.includes(v) && save({ habitRows: [...habitRows, v] })} /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Goals</h2>
        <div className="trk-goals">
          {(["good", "better", "best"] as const).map((lvl) => {
            const g: Goal = d.goals?.[lvl] ?? {};
            const set = (patch: Goal) => save({ goals: { ...(d.goals ?? {}), [lvl]: { ...g, ...patch } } });
            return (
              <div key={lvl} className="trk-goal">
                <h3>{lvl[0].toUpperCase() + lvl.slice(1)}</h3>
                <div className="field"><label htmlFor={`g-${lvl}-a`}>Action steps</label><Text id={`g-${lvl}-a`} area label={`${lvl} action steps`} value={g.action} onSave={(v) => set({ action: v })} /></div>
                <div className="field"><label htmlFor={`g-${lvl}-o`}>Obstacles</label><Text id={`g-${lvl}-o`} area label={`${lvl} obstacles`} value={g.obstacle} onSave={(v) => set({ obstacle: v })} /></div>
                <div className="field"><label htmlFor={`g-${lvl}-s`}>Steps to overcome</label><Text id={`g-${lvl}-s`} area label={`${lvl} steps to overcome`} value={g.steps} onSave={(v) => set({ steps: v })} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
          <h2>Personal reflections</h2>
          <Text area label="Personal reflections" value={d.reflection} onSave={(v) => save({ reflection: v })} placeholder="How did this month feel? What got in the way, and what went well?" />
      </section>

      <section className="panel">
        <div className="trk-head">
          <h2>Income by client</h2>
          <p className="note">Each client&apos;s retainer and what you paid out to deliver it. Profit is income minus pay and expenses.</p>
        </div>
        {!income.length && (
          <div className="row">
            {portal.rows.length > 0 && <button type="button" className="btn sm" onClick={() => save({ income: portal.rows.map((r) => ({ id: newId(), label: r.label, clientId: r.clientId, retainer: r.retainer, costs: {} })) })}>Start with the portal&apos;s {portal.rows.length} clients</button>}
            {lastIncome.length > 0 && <button type="button" className="btn sm line" onClick={() => save({ income: lastIncome.map((r) => ({ ...r, id: newId() })) })}>Copy last month&apos;s list</button>}
          </div>
        )}
        <div className="tablewrap">
          <table className="trk-income">
            <thead>
              <tr>
                <th scope="col">Client</th><th scope="col">Monthly retainer</th>
                {payees.map((p) => <th key={p} scope="col"><span className="trk-rowname">{p}<button type="button" className="trk-x" aria-label={`Remove ${p}`} onClick={() => save({ payees: payees.filter((x) => x !== p) })}>×</button></span></th>)}
                <th scope="col">Pay total</th><th scope="col">Left after pay</th><th scope="col"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {income.map((r) => {
                const setRow = (patch: Partial<IncomeRow>) => save({ income: income.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) });
                const pay = Object.values(r.costs ?? {}).reduce((a, b) => a + (b || 0), 0);
                return (
                  <tr key={r.id}>
                    <td><Text label="Client" value={r.label} onSave={(v) => setRow({ label: v })} /></td>
                    <td><Num kind="money" label={`${r.label} retainer`} value={r.retainer} onSave={(v) => setRow({ retainer: v ?? 0 })} /></td>
                    {payees.map((p) => <td key={p}><Num kind="money" label={`${r.label}, paid to ${p}`} value={r.costs?.[p]} onSave={(v) => setRow({ costs: { ...(r.costs ?? {}), [p]: v ?? 0 } })} /></td>)}
                    <td className="kn">{fmtMoney(pay)}</td>
                    <td className="kn">{fmtMoney(r.retainer - pay)}</td>
                    <td><button type="button" className="trk-x" aria-label={`Remove ${r.label}`} onClick={() => save({ income: income.filter((x) => x.id !== r.id) })}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th><td className="kn">{fmtMoney(s.incomeTotal)}</td>
                {payees.map((p) => <td key={p} className="kn">{fmtMoney(s.payTotals[p] ?? 0)}</td>)}
                <td className="kn">{fmtMoney(s.salary)}</td><td className="kn">{fmtMoney(s.incomeTotal - s.salary)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="row trk-adds">
          <button type="button" className="btn sm line" onClick={() => save({ income: [...income, { id: newId(), label: "", retainer: 0, costs: {} }] })}>Add a client row</button>
          <AddRow placeholder="Add someone you pay (team member or contractor)" button="Add column" onAdd={(v) => !payees.includes(v) && save({ payees: [...payees, v] })} />
        </div>
      </section>

      <section className="trk-two">
        <div className="panel">
          <div className="trk-head"><h2>Expenses</h2><p className="note">Software, subscriptions and anything else this month. They add up to your OPEX.</p></div>
          {!expenses.length && lastExpenses.length > 0 && (
            <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => save({ expenses: lastExpenses.map((e) => ({ ...e, id: newId() })) })}>Copy last month&apos;s {lastExpenses.length} expenses</button>
          )}
          <ul className="trk-expenses">
            {expenses.map((e) => {
              const setE = (patch: Partial<Expense>) => save({ expenses: expenses.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) });
              return (
                <li key={e.id}>
                  <Text label="Expense" value={e.label} onSave={(v) => setE({ label: v })} />
                  <Num kind="money" label={`${e.label} cost`} value={e.amount} onSave={(v) => setE({ amount: v ?? 0 })} />
                  <button type="button" className="trk-x" aria-label={`Remove ${e.label}`} onClick={() => save({ expenses: expenses.filter((x) => x.id !== e.id) })}>×</button>
                </li>
              );
            })}
          </ul>
          <AddRow placeholder="Add an expense (like Dubsado)" onAdd={(v) => save({ expenses: [...expenses, { id: newId(), label: v, amount: 0 }] })} />
          <p className="trk-total"><span>Total OPEX</span><b>{fmtMoney(s.opex)}</b></p>
        </div>
        <div className="panel">
          <h2>Where the money goes</h2>
          <dl className="trk-dl">
            <div><dt>Income</dt><dd>{fmtMoney(s.incomeTotal)}</dd></div>
            <div><dt>Team and contractor pay</dt><dd>− {fmtMoney(s.salary)}</dd></div>
            <div><dt>OPEX</dt><dd>− {fmtMoney(s.opex)}</dd></div>
            <div className="strong"><dt>Profit</dt><dd>{fmtMoney(s.profit)}</dd></div>
            <div><dt>Taxes (<Num kind="pct" className="mini" label="Tax rate" value={s.taxRate} onSave={(v) => save({ taxRate: v ?? 0.15 })} />)</dt><dd>− {fmtMoney(s.taxes)}</dd></div>
            <div><dt>Reinvest in the business (<Num kind="pct" className="mini" label="Reinvest rate" value={s.reinvestRate} onSave={(v) => save({ reinvestRate: v ?? 0.3 })} />)</dt><dd>− {fmtMoney(s.reinvest)}</dd></div>
            <div className="strong"><dt>Owner&apos;s take-home</dt><dd>{fmtMoney(s.takeHome)}</dd></div>
          </dl>
          <h3>Goal budget</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th scope="col">Category</th><th scope="col">Goal</th><th scope="col">Of this month&apos;s income</th></tr></thead>
              <tbody>
                {s.budget.map((b) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    <td><Num kind="pct" className="mini" label={`${b.label} goal`} value={b.pct} onSave={(v) => save({ budget: { ...(d.budget ?? {}), [b.key]: v ?? BUDGET.find((x) => x.key === b.key)!.pct } })} /></td>
                    <td className="kn">{fmtMoney(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="panel trk-card"><h2>{title}</h2><dl>{children}</dl></div>;
}

function Line({ label, calc, children }: { label: string; calc?: boolean; children: React.ReactNode }) {
  return <div className={calc ? "calc" : ""}><dt>{label}</dt><dd>{children}</dd></div>;
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
