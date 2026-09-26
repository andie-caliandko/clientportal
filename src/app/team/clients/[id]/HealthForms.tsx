"use client";

import { useActionState, useMemo, useState } from "react";
import { saveKpi, saveScorecard } from "../../actions";

type KpiLite = {
  id: string;
  name: string;
  unit: string;
  higher_is_better: boolean;
  good: number;
  better: number;
  best: number;
  benchmark: string | null;
  history: { week: string; value: number }[];
};

export function KpiForm({ clientId, kpi, onDone }: { clientId: string; kpi?: KpiLite; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveKpi, {});
  const [lower, setLower] = useState(kpi ? !kpi.higher_is_better : false);
  const p = kpi?.id ?? "new";
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="client" value={clientId} />
      {kpi && <input type="hidden" name="id" value={kpi.id} />}
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor={`k-name-${p}`}>KPI</label>
          <input className="input" id={`k-name-${p}`} name="name" defaultValue={kpi?.name} placeholder="Instagram engagement rate" required /></div>
        <div className="field"><label htmlFor={`k-unit-${p}`}>Measured in</label>
          <select className="sel" id={`k-unit-${p}`} name="unit" defaultValue={kpi?.unit ?? "number"}>
            <option value="number">Number</option><option value="percent">Percent</option><option value="currency">Dollars</option>
          </select></div>
        <div className="field"><label htmlFor={`k-dir-${p}`}>Better when</label>
          <select className="sel" id={`k-dir-${p}`} name="direction" value={lower ? "lower" : "higher"} onChange={(e) => setLower(e.target.value === "lower")}>
            <option value="higher">Higher</option><option value="lower">Lower (like cost per lead)</option>
          </select></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor={`k-good-${p}`}>Good</label><input className="input" id={`k-good-${p}`} name="good" inputMode="decimal" defaultValue={kpi?.good} required /></div>
        <div className="field"><label htmlFor={`k-better-${p}`}>Better</label><input className="input" id={`k-better-${p}`} name="better" inputMode="decimal" defaultValue={kpi?.better} required /></div>
        <div className="field"><label htmlFor={`k-best-${p}`}>Best</label><input className="input" id={`k-best-${p}`} name="best" inputMode="decimal" defaultValue={kpi?.best} required /></div>
      </div>
      <p className="note">{lower ? "Lower is better, so Good is your highest number and Best your lowest." : "Good is the minimum you want to hit. Best is the stretch goal."}</p>
      <div className="field"><label htmlFor={`k-bench-${p}`}>Industry standard (optional)</label>
        <input className="input" id={`k-bench-${p}`} name="benchmark" defaultValue={kpi?.benchmark ?? ""} placeholder="Local retail average is about 3.5%" /></div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : kpi ? "Save KPI" : "Add KPI"}</button>
        {onDone && <button type="button" className="btn sm line" onClick={onDone}>Close</button>}
      </div>
    </form>
  );
}

export function EditKpi({ clientId, kpi }: { clientId: string; kpi: KpiLite }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="panel" style={{ gridColumn: "1 / -1" }}><KpiForm clientId={clientId} kpi={kpi} onDone={() => setOpen(false)} /></div>
  ) : (
    <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit goals</button>
  );
}

export function AddKpi({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="panel"><h2>Add a KPI</h2><KpiForm clientId={clientId} onDone={() => setOpen(false)} /></div>
  ) : (
    <div><button className="btn sm" onClick={() => setOpen(true)}>Add KPI</button></div>
  );
}

/** Enter this week's numbers. Picking an earlier week loads what was entered then. */
export function ScorecardForm({ clientId, kpis, notes, thisWeek }: {
  clientId: string;
  kpis: KpiLite[];
  notes: Record<string, string>;
  thisWeek: string;
}) {
  const [state, action, pending] = useActionState(saveScorecard, {});
  const [week, setWeek] = useState(thisWeek);
  const monday = useMemo(() => {
    const [y, m, d] = week.split("-").map(Number);
    const u = new Date(Date.UTC(y, m - 1, d));
    u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7));
    return u.toISOString().slice(0, 10);
  }, [week]);
  const label = new Date(`${monday}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <form action={action} key={monday} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        <div className="field" style={{ maxWidth: 240 }}><label htmlFor="sc-week">Week of</label>
          <input className="input" id="sc-week" name="week" type="date" value={week} onChange={(e) => e.target.value && setWeek(e.target.value)} /></div>
        <p className="note" style={{ paddingBottom: 12 }}>Saving for the week starting Monday, {label}.</p>
      </div>
      <div className="score-inputs">
        {kpis.map((k) => (
          <div className="field" key={k.id}>
            <label htmlFor={`sc-${k.id}`}>{k.name}</label>
            <input className="input" id={`sc-${k.id}`} name={`kpi:${k.id}`} inputMode="decimal"
              defaultValue={k.history.find((h) => h.week === monday)?.value ?? ""}
              placeholder={k.unit === "percent" ? "e.g. 4.2" : k.unit === "currency" ? "e.g. 32.50" : "e.g. 1250"} />
            <span className="note">Good {k.good} · Better {k.better} · Best {k.best}</span>
          </div>
        ))}
      </div>
      <div className="field"><label htmlFor="sc-note">Review notes (optional)</label>
        <textarea className="input" id="sc-note" name="note" defaultValue={notes[monday] ?? ""} style={{ minHeight: 80 }}
          placeholder="What moved this week, and what we're doing about it" /></div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn" disabled={pending}>{pending ? "Saving…" : "Save scorecard"}</button></div>
    </form>
  );
}
