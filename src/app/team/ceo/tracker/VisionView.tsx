"use client";

import { fmtMoney, fmtNum, growthPlan, horizonPlan, lifePlan, yearGoalPlan, type LifeGoal, type Milestone, type VisionData, type VisionHorizon, type YearGoal } from "@/lib/ceoTracker";
import { Num, SaveNote, Text, newId, useSheet } from "./TrackerBits";

type Rates = { closeRate: number | null; showRate: number | null; retainer: number | null; touchPerCall: number | null; callsPerPost: number | null; year: string };

export function VisionView({ initial, rates }: { initial: VisionData; rates: Rates }) {
  const { data: v, save, state } = useSheet<VisionData>("vision", initial);
  const horizons = v.horizons ?? {};
  const life = lifePlan(v.lifeGoals ?? []);
  const planner = v.planner ?? {};
  const g = growthPlan(planner);
  const milestones = v.milestones ?? [];
  const yearGoals = v.yearGoals ?? {};
  const hint = (n: number | null, pct = false) => (n === null ? undefined : pct ? String(Math.round(n * 1000) / 10) : String(Math.round(n)));

  const setHorizon = (k: "one" | "five" | "ten", patch: VisionHorizon) => save({ horizons: { ...horizons, [k]: { ...(horizons[k] ?? {}), ...patch } } });
  const setYear = (k: "good" | "better" | "best", patch: YearGoal) => save({ yearGoals: { ...yearGoals, [k]: { ...(yearGoals[k] ?? {}), ...patch } } });
  const H = [{ k: "one", label: "1 year" }, { k: "five", label: "5 years" }, { k: "ten", label: "10 years" }] as const;
  const Y = [{ k: "good", label: "Good" }, { k: "better", label: "Better" }, { k: "best", label: "Best" }] as const;

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>

      <section className="trk-two">
        <div className="panel">
          <h2>What is your why?</h2>
          <Text area label="Your why" value={v.why} onSave={(why) => save({ why })} placeholder="Why you started, and the impact you want to make." />
        </div>
        <div className="panel trk-dream">
          <h2>Dream life budget</h2>
          <p className="trk-big">{fmtMoney(life.dreamBudget)}<small> a month in revenue</small></p>
          <p className="note">Your life goals below cost {fmtMoney(life.monthly)} a month. If you keep about 40% of revenue, the business needs to bring in {fmtMoney(life.dreamBudget)} a month to pay for them.</p>
        </div>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>North Star revenue goals</h2><p className="note">Grey numbers are your {rates.year} averages so far. Leave a box empty to use that average, or type your own.</p></div>
        <div className="tablewrap">
          <table className="trk-plan">
            <thead><tr><th scope="col">Metric</th>{H.map((h) => <th key={h.k} scope="col">{h.label}</th>)}</tr></thead>
            <tbody>
              <PlanRow label="Monthly revenue goal">{H.map((h) => <td key={h.k}><Num kind="money" label={`${h.label} monthly revenue goal`} value={horizons[h.k]?.monthly} onSave={(n) => setHorizon(h.k, { monthly: n })} /></td>)}</PlanRow>
              <PlanRow label="Current monthly revenue">{H.map((h) => <td key={h.k}><Num kind="money" label={`${h.label} current monthly revenue`} value={horizons[h.k]?.current} onSave={(n) => setHorizon(h.k, { current: n })} /></td>)}</PlanRow>
              <PlanRow label="Close rate">{H.map((h) => <td key={h.k}><Num kind="pct" label={`${h.label} close rate`} value={horizons[h.k]?.closeRate} placeholder={hint(rates.closeRate, true)} onSave={(n) => setHorizon(h.k, { closeRate: n })} /></td>)}</PlanRow>
              <PlanRow label="Average monthly retainer">{H.map((h) => <td key={h.k}><Num kind="money" label={`${h.label} average retainer`} value={horizons[h.k]?.retainer} placeholder={hint(rates.retainer)} onSave={(n) => setHorizon(h.k, { retainer: n })} /></td>)}</PlanRow>
              <PlanRow label="Show rate">{H.map((h) => <td key={h.k}><Num kind="pct" label={`${h.label} show rate`} value={horizons[h.k]?.showRate} placeholder={hint(rates.showRate, true)} onSave={(n) => setHorizon(h.k, { showRate: n })} /></td>)}</PlanRow>
              {[
                { label: "New revenue needed a month", f: (p: ReturnType<typeof horizonPlan>) => fmtMoney(p.needed) },
                { label: "New clients needed", f: (p: ReturnType<typeof horizonPlan>) => fmtNum(p.clients) },
                { label: "Sales calls to book", f: (p: ReturnType<typeof horizonPlan>) => fmtNum(p.booked) },
                { label: "Live calls needed", f: (p: ReturnType<typeof horizonPlan>) => fmtNum(p.live) },
                { label: "Touch points needed", f: (p: ReturnType<typeof horizonPlan>) => fmtNum(p.touchPoints, 0) },
              ].map((r) => (
                <PlanRow key={r.label} label={r.label} calc>{H.map((h) => <td key={h.k} className="kn">{r.f(horizonPlan(withRates(horizons[h.k], rates)))}</td>)}</PlanRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Life goals</h2><p className="note">Put a price and a timeline on each one.</p></div>
        <div className="tablewrap">
          <table className="trk-plan">
            <thead><tr><th scope="col">Goal</th><th scope="col">Price</th><th scope="col">Timeline (years)</th><th scope="col">Needed a year</th><th scope="col">Needed a month</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {life.rows.map((r) => {
                const set = (patch: Partial<LifeGoal>) => save({ lifeGoals: (v.lifeGoals ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x)) });
                return (
                  <tr key={r.id}>
                    <td><Text label="Goal" value={r.label} onSave={(label) => set({ label })} /></td>
                    <td><Num kind="money" label={`${r.label} price`} value={r.price} onSave={(n) => set({ price: n ?? 0 })} /></td>
                    <td><Num label={`${r.label} timeline in years`} value={r.years} onSave={(n) => set({ years: n ?? 1 })} /></td>
                    <td className="kn">{fmtMoney(r.annual)}</td>
                    <td className="kn">{fmtMoney(r.annual / 12)}</td>
                    <td><button type="button" className="trk-x" aria-label={`Remove ${r.label}`} onClick={() => save({ lifeGoals: (v.lifeGoals ?? []).filter((x) => x.id !== r.id) })}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th scope="row" colSpan={3}>Total</th><td className="kn">{fmtMoney(life.annual)}</td><td className="kn">{fmtMoney(life.monthly)}</td><td /></tr></tfoot>
          </table>
        </div>
        <button type="button" className="btn sm line" style={{ justifySelf: "start" }} onClick={() => save({ lifeGoals: [...(v.lifeGoals ?? []), { id: newId(), label: "", price: 0, years: 1 }] })}>Add a goal</button>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Growth planner</h2><p className="note">From where you are to where you want to be, worked back to the weekly activity it takes.</p></div>
        <div className="trk-planner">
          <dl className="trk-dl">
            <div><dt>Current monthly revenue</dt><dd><Num kind="money" label="Current monthly revenue" value={planner.current} onSave={(n) => save({ planner: { ...planner, current: n } })} /></dd></div>
            <div><dt>Monthly revenue goal</dt><dd><Num kind="money" label="Monthly revenue goal" value={planner.goal} onSave={(n) => save({ planner: { ...planner, goal: n } })} /></dd></div>
            <div><dt>Average offer price</dt><dd><Num kind="money" label="Average offer price" value={planner.offer} onSave={(n) => save({ planner: { ...planner, offer: n } })} /></dd></div>
            <div><dt>Timeline (months)</dt><dd><Num label="Timeline in months" value={planner.months} onSave={(n) => save({ planner: { ...planner, months: n } })} /></dd></div>
            <div><dt>Close rate</dt><dd><Num kind="pct" label="Close rate" value={planner.closeRate} onSave={(n) => save({ planner: { ...planner, closeRate: n } })} /></dd></div>
            <div><dt>Lead to call rate</dt><dd><Num kind="pct" label="Lead to call rate" value={planner.leadToCall} onSave={(n) => save({ planner: { ...planner, leadToCall: n } })} /></dd></div>
            <div><dt>Clients each team member can handle</dt><dd><Num label="Clients per team member" value={planner.capacity} onSave={(n) => save({ planner: { ...planner, capacity: n } })} /></dd></div>
          </dl>
          <dl className="trk-dl out">
            <div><dt>Revenue to add a month</dt><dd>{fmtMoney(g.gap)}</dd></div>
            <div><dt>Clients needed</dt><dd>{fmtNum(g.clients)}</dd></div>
            <div><dt>Clients a month</dt><dd>{fmtNum(g.perMonth)}</dd></div>
            <div><dt>Sales calls a month</dt><dd>{fmtNum(g.callsMonth)}</dd></div>
            <div><dt>Sales calls a week</dt><dd>{fmtNum(g.callsWeek)}</dd></div>
            <div><dt>Leads a month</dt><dd>{fmtNum(g.leadsMonth)}</dd></div>
            <div><dt>Leads a week</dt><dd>{fmtNum(g.leadsWeek)}</dd></div>
            <div><dt>Team members needed</dt><dd>{fmtNum(g.team)}</dd></div>
            <div><dt>Touch points a week (high estimate)</dt><dd>{fmtNum(g.touchWeek, 0)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Milestone timeline</h2><p className="note">When to hire, based on the clients a month in the growth planner.</p></div>
        <div className="tablewrap">
          <table className="trk-plan">
            <thead><tr><th scope="col">Month</th><th scope="col">Clients by then</th><th scope="col">Action or hire</th><th scope="col">To do</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {milestones.map((m) => {
                const set = (patch: Partial<Milestone>) => save({ milestones: milestones.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) });
                return (
                  <tr key={m.id}>
                    <td><Num label="Month" value={m.month} onSave={(n) => set({ month: n ?? 1 })} /></td>
                    <td className="kn">{fmtNum(g.perMonth !== null ? g.perMonth * m.month : null)}</td>
                    <td><Text label="Action or hire" value={m.trigger} onSave={(trigger) => set({ trigger })} /></td>
                    <td><Text label="To do" value={m.todo} onSave={(todo) => set({ todo })} /></td>
                    <td><button type="button" className="trk-x" aria-label={`Remove month ${m.month}`} onClick={() => save({ milestones: milestones.filter((x) => x.id !== m.id) })}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn sm line" style={{ justifySelf: "start" }} onClick={() => save({ milestones: [...milestones, { id: newId(), month: (milestones.at(-1)?.month ?? 0) + 3, trigger: "", todo: "" }] })}>Add a milestone</button>
      </section>

      <section className="panel">
        <div className="trk-head"><h2>Next year&apos;s goals</h2><p className="note">A yearly revenue goal, worked back to what it takes. Outreach and posts use your {rates.year} rates ({fmtNum(rates.touchPerCall)} touch points per booked call, {fmtNum(rates.callsPerPost)} calls per post).</p></div>
        <div className="tablewrap">
          <table className="trk-plan">
            <thead><tr><th scope="col">Metric</th>{Y.map((y) => <th key={y.k} scope="col">{y.label}</th>)}</tr></thead>
            <tbody>
              <PlanRow label="Yearly revenue">{Y.map((y) => <td key={y.k}><Num kind="money" label={`${y.label} yearly revenue`} value={yearGoals[y.k]?.revenue} onSave={(n) => setYear(y.k, { revenue: n })} /></td>)}</PlanRow>
              <PlanRow label="Existing monthly revenue">{Y.map((y) => <td key={y.k}><Num kind="money" label={`${y.label} existing monthly revenue`} value={yearGoals[y.k]?.existing} onSave={(n) => setYear(y.k, { existing: n })} /></td>)}</PlanRow>
              <PlanRow label="Close rate">{Y.map((y) => <td key={y.k}><Num kind="pct" label={`${y.label} close rate`} value={yearGoals[y.k]?.closeRate} placeholder={hint(rates.closeRate, true)} onSave={(n) => setYear(y.k, { closeRate: n })} /></td>)}</PlanRow>
              <PlanRow label="Average monthly retainer">{Y.map((y) => <td key={y.k}><Num kind="money" label={`${y.label} average retainer`} value={yearGoals[y.k]?.retainer} placeholder={hint(rates.retainer)} onSave={(n) => setYear(y.k, { retainer: n })} /></td>)}</PlanRow>
              <PlanRow label="Show rate">{Y.map((y) => <td key={y.k}><Num kind="pct" label={`${y.label} show rate`} value={yearGoals[y.k]?.showRate} placeholder={hint(rates.showRate, true)} onSave={(n) => setYear(y.k, { showRate: n })} /></td>)}</PlanRow>
              {[
                { label: "New revenue needed a month", f: (p: ReturnType<typeof yearGoalPlan>) => fmtMoney(p.needed) },
                { label: "New clients", f: (p: ReturnType<typeof yearGoalPlan>) => fmtNum(p.clients) },
                { label: "Sales calls to book", f: (p: ReturnType<typeof yearGoalPlan>) => fmtNum(p.booked) },
                { label: "Live calls", f: (p: ReturnType<typeof yearGoalPlan>) => fmtNum(p.live) },
                { label: "Outreach", f: (p: ReturnType<typeof yearGoalPlan>) => fmtNum(p.outreach, 0) },
                { label: "Posts", f: (p: ReturnType<typeof yearGoalPlan>) => fmtNum(p.posts, 0) },
              ].map((r) => (
                <PlanRow key={r.label} label={r.label} calc>{Y.map((y) => <td key={y.k} className="kn">{r.f(yearGoalPlan(withRates(yearGoals[y.k], rates), rates))}</td>)}</PlanRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Empty rate boxes fall back to this year's actual rates (the grey hints). */
function withRates<T extends { closeRate?: number; retainer?: number; showRate?: number }>(h: T | undefined, r: Rates): T {
  return { ...(h ?? {}), closeRate: h?.closeRate ?? r.closeRate ?? undefined, retainer: h?.retainer ?? r.retainer ?? undefined, showRate: h?.showRate ?? r.showRate ?? undefined } as T;
}

function PlanRow({ label, calc, children }: { label: string; calc?: boolean; children: React.ReactNode }) {
  return <tr className={calc ? "calc" : ""}><th scope="row">{label}</th>{children}</tr>;
}
