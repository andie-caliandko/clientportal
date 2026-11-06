"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMoney, fmtNum, fmtPct, monthName } from "@/lib/ceoTracker";
import { capacity, rates, WEEKS, type Line, type Offer, type PricingSettings } from "@/lib/pricing";
import { Num, SaveNote, type SaveState } from "../tracker/TrackerBits";
import { savePricingSettings } from "./actions";

export function RatesView({ initial, offers, team, expenses }: {
  initial: PricingSettings;
  offers: Offer[];
  team: { lines: Line[]; month: string | null };
  expenses: { lines: Line[]; month: string | null };
}) {
  const [s, setS] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const save = async (patch: PricingSettings) => {
    setS((d) => ({ ...d, ...patch }));
    setState("saving");
    const r = await savePricingSettings(patch as Record<string, unknown>).catch(() => ({ error: "x" }));
    setState(r.error ? "error" : "saved");
  };
  const r = rates(s, team.lines, expenses.lines);
  const cap = capacity(offers, s.clients, r);
  const from = (m: string | null) => (m ? `from your ${monthName(m)} CEO tracker` : "add it in the CEO tracker");

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>
      <section className="stats prc-rates">
        <div className="stat">
          <b>{fmtMoney(r.sheetRate)}<small>/hr</small></b>
          <span>Your rate: your salary goal over your own hours, like your spreadsheet</span>
        </div>
        <div className="stat calc">
          <b>{fmtMoney(r.fullRate)}<small>/hr</small></b>
          <span>Full-cost rate: covers your salary, team pay, expenses and {fmtPct(r.margin)} profit over everyone&apos;s hours</span>
        </div>
        <div className="stat">
          <b>{fmtMoney(r.needed)}</b>
          <span>Revenue you need each month</span>
        </div>
        <div className="stat">
          <b>{fmtNum(r.billable, 0)}<small> hrs</small></b>
          <span>Hours you and your team have each month</span>
        </div>
      </section>

      <div className="trk-two">
        <section className="panel">
          <h2>You</h2>
          <dl className="trk-dl">
            <div><dt><label htmlFor="p-salary">Yearly salary goal (gross)</label></dt><dd><Num id="p-salary" kind="money" label="Yearly salary goal" value={s.salary} onSave={(n) => save({ salary: n ?? 0 })} /></dd></div>
            <div><dt><label htmlFor="p-hours">Your hours a week</label></dt><dd><Num id="p-hours" label="Your hours a week" value={s.myHours} onSave={(n) => save({ myHours: n ?? 0 })} /></dd></div>
            <div><dt><label htmlFor="p-margin">Profit on top of costs</label></dt><dd><Num id="p-margin" kind="pct" label="Profit on top of costs" value={s.margin ?? 0.2} onSave={(n) => save({ margin: n ?? 0 })} /></dd></div>
            <div><dt>Salary each month</dt><dd>{fmtMoney(r.salaryMonth)}</dd></div>
            <div><dt>Your hours each month</dt><dd>{fmtNum(r.myMonth, 0)}</dd></div>
          </dl>
          <p className="note">Months count as {WEEKS} weeks, the same as your spreadsheet.</p>
        </section>

        <section className="panel">
          <h2>Team &amp; expenses</h2>
          <p className="note">Pay is {from(team.month)}. Add each person&apos;s billable hours a week so the full-cost rate and capacity count them.</p>
          {r.people.length ? (
            <div className="tablewrap">
              <table className="prc-table">
                <thead><tr><th scope="col">Person</th><th scope="col">Pay / month</th><th scope="col">Hours / week</th></tr></thead>
                <tbody>
                  {r.people.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.label}</th>
                      <td className="kn">{fmtMoney(p.amount)}</td>
                      <td><Num label={`${p.label}'s hours a week`} value={s.teamHours?.[p.label]} placeholder="0"
                        onSave={(n) => save({ teamHours: { ...(s.teamHours ?? {}), [p.label]: n ?? 0 } })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="note">No team pay yet. <Link href="/team/ceo/tracker">Add it in the CEO tracker</Link>.</p>}
          <dl className="trk-dl">
            <div><dt>Team pay</dt><dd>{fmtMoney(r.teamPay)}</dd></div>
            <div><dt>Expenses ({expenses.month ? monthName(expenses.month, "short") : "none yet"})</dt><dd>{fmtMoney(r.opex)}</dd></div>
            <div className="strong"><dt>Costs each month, with your salary</dt><dd>{fmtMoney(r.costs)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Capacity</h2>
          <span className="note">{fmtNum(cap.used, 1)} of {fmtNum(cap.available, 0)} hours a month booked</span>
        </div>
        <div className="prc-meter" role="img" aria-label={`${fmtPct(cap.share)} of your hours are booked`}>
          <i style={{ "--w": Math.min(1, cap.share ?? 0) } as React.CSSProperties} className={cap.left < 0 ? "over" : ""} />
        </div>
        <p className={cap.left < 0 ? "error" : "note"}>
          {cap.available <= 0 ? "Add your hours above to see how many clients fit."
            : cap.left < 0 ? `Over by ${fmtNum(-cap.left, 1)} hours a month. Add team hours or raise prices before taking anyone else on.`
            : `${fmtNum(cap.left, 1)} hours a month left.`}
        </p>
        {cap.rows.length ? (
          <div className="tablewrap">
            <table className="prc-table">
              <thead><tr><th scope="col">Monthly offer</th><th scope="col">Hours each</th><th scope="col">Clients now</th><th scope="col">Hours</th><th scope="col">Room for</th></tr></thead>
              <tbody>
                {cap.rows.map((x) => (
                  <tr key={x.offer.id}>
                    <th scope="row">{x.offer.name}</th>
                    <td className="kn">{fmtNum(x.hours, 1)}</td>
                    <td><Num label={`Clients on ${x.offer.name}`} value={s.clients?.[x.offer.id]} placeholder="0"
                      onSave={(n) => save({ clients: { ...(s.clients ?? {}), [x.offer.id]: n ?? 0 } })} /></td>
                    <td className="kn">{fmtNum(x.total, 1)}</td>
                    <td className="kn">{x.room === null ? "—" : `${x.room} more`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">Add monthly offers under Offer suite to see how many fit.</p>}
      </section>
    </div>
  );
}
