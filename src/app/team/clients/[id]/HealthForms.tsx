"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { saveKpi, saveScorecard, setHealthTracked } from "../../actions";

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
  template_key?: string | null;
  category?: string | null;
  choices?: string[] | null;
  cadence?: string | null;
};

export function KpiForm({ clientId, kpi, onDone }: { clientId: string; kpi?: KpiLite; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveKpi, {});
  const [lower, setLower] = useState(kpi ? !kpi.higher_is_better : false);
  // In a pop-up: close once it's saved.
  useEffect(() => { if (state.ok) onDone?.(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <div className="field"><label htmlFor={`k-often-${p}`}>How often</label>
          <select className="sel" id={`k-often-${p}`} name="cadence" defaultValue={kpi?.cadence ?? "weekly"}>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
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
        {onDone && <button type="button" className="btn sm line" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

export function EditKpi({ clientId, kpi }: { clientId: string; kpi: KpiLite }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit goals</button>
      {open && (
        <Modal title={`Edit ${kpi.name}`} onClose={() => setOpen(false)}>
          <KpiForm clientId={clientId} kpi={kpi} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

export function AddKpi({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div><button className="btn sm" onClick={() => setOpen(true)}>Add KPI</button></div>
      {open && (
        <Modal title="Add a KPI" onClose={() => setOpen(false)}>
          <KpiForm clientId={clientId} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Scorecard history: change a week's (or month's) answers or notes after they were saved. */
export function EditScorecardWeek({ clientId, kpis, notes, week, monthly }: { clientId: string; kpis: KpiLite[]; notes: Record<string, string>; week: string; monthly?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = monthly ? monthLabel(week) : new Date(`${week}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)} aria-label={`Edit ${monthly ? "" : "the week of "}${label}`}>Edit</button>
      {open && (
        <Modal title={monthly ? `Monthly client check · ${label}` : `Scorecard · week of ${label}`} onClose={() => setOpen(false)} wide>
          <ScorecardForm clientId={clientId} kpis={kpis} notes={notes} thisWeek={week} monthly={monthly} onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

/** The Monthly client check, in a pop-up. */
export function MonthlyCheck({ clientId, kpis, notes, month, label }: { clientId: string; kpis: KpiLite[]; notes: Record<string, string>; month: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title="Monthly client check" onClose={() => setOpen(false)} wide>
          <ScorecardForm clientId={clientId} kpis={kpis} notes={notes} thisWeek={month} monthly onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

/** Enter this week's numbers (or this month's client check). Picking an earlier week or month loads what was entered then. */
export function ScorecardForm({ clientId, kpis, notes, thisWeek, monthly, onSaved }: {
  clientId: string;
  kpis: KpiLite[];
  notes: Record<string, string>;
  /** A date in the week (or month) to start on. */
  thisWeek: string;
  monthly?: boolean;
  /** In a pop-up: close once it's saved. */
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveScorecard, {});
  useEffect(() => { if (state.ok) onSaved?.(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [week, setWeek] = useState(monthly ? thisWeek.slice(0, 7) : thisWeek);
  const key = useMemo(() => {
    if (monthly) return `${week}-01`;
    const [y, m, d] = week.split("-").map(Number);
    const u = new Date(Date.UTC(y, m - 1, d));
    u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7));
    return u.toISOString().slice(0, 10);
  }, [week, monthly]);
  const label = new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const p = monthly ? "mc" : "sc";

  return (
    <form action={action} key={key} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        {monthly ? (
          <div className="field" style={{ maxWidth: 240 }}><label htmlFor="mc-month">Month</label>
            <input className="input" id="mc-month" name="month" type="month" value={week} onChange={(e) => e.target.value && setWeek(e.target.value)} /></div>
        ) : (
          <div className="field" style={{ maxWidth: 240 }}><label htmlFor="sc-week">Week of</label>
            <input className="input" id="sc-week" name="week" type="date" value={week} onChange={(e) => e.target.value && setWeek(e.target.value)} /></div>
        )}
        <p className="note" style={{ paddingBottom: 12 }}>{monthly ? `Saving for ${monthLabel(key)}. Answer for the whole month.` : `Saving for the week starting Monday, ${label}.`}</p>
      </div>
      <div className="score-inputs">
        {kpis.map((k) => {
          const saved = k.history.find((h) => h.week === key)?.value;
          return (
            <div className="field" key={k.id}>
              <label htmlFor={`${p}-${k.id}`}>{k.name}</label>
              {k.choices?.length === 3 ? (
                // Pick-one: Green, Yellow or Red answer, saved as 2, 1, 0.
                <select className="sel" id={`${p}-${k.id}`} name={`kpi:${k.id}`} defaultValue={saved === undefined ? "" : String(Math.round(saved))}>
                  <option value="">Not entered</option>
                  {k.choices.map((c, i) => <option key={c} value={String(2 - i)}>{c}</option>)}
                </select>
              ) : (
                <input className="input" id={`${p}-${k.id}`} name={`kpi:${k.id}`} inputMode="decimal" defaultValue={saved ?? ""}
                  placeholder={k.template_key ? "" : k.unit === "percent" ? "e.g. 4.2" : k.unit === "currency" ? "e.g. 32.50" : "e.g. 1250"} />
              )}
              <span className="note">{k.template_key ? k.category : `Good ${k.good} · Better ${k.better} · Best ${k.best}`}</span>
            </div>
          );
        })}
      </div>
      <div className="field"><label htmlFor={`${p}-note`}>{monthly ? "Notes from the month (optional)" : "Review notes (optional)"}</label>
        <textarea className="input" id={`${p}-note`} name="note" defaultValue={notes[key] ?? ""} style={{ minHeight: 80 }}
          placeholder={monthly ? "How the relationship is going, anything to watch" : "What moved this week, and what we're doing about it"} /></div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn" disabled={pending}>{pending ? "Saving…" : monthly ? "Save monthly check" : "Save scorecard"}</button></div>
    </form>
  );
}

/** Switch a client's red / yellow / green health rating on or off. */
export function TrackHealthToggle({ clientId, tracked }: { clientId: string; tracked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="row note" style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={!tracked} disabled={pending}
        onChange={(e) => startTransition(async () => { await setHealthTracked(clientId, !e.target.checked); router.refresh(); })} />
      Not tracking health for this client
    </label>
  );
}
