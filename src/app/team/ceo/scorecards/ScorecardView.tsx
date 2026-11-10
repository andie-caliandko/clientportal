"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { Rating } from "@/lib/health";
import { fmtTarget, fmtValue, SOURCES, type Card, type Status, type TeamKpi } from "@/lib/teamScorecard";
import { newId, Num, SaveNote, Text, type SaveState } from "../tracker/TrackerBits";
import { saveCard, saveMonth, saveScorecardSharing } from "./actions";

type Row = { kpi: TeamKpi; value: number | null; detail: string | null; status: Status };
const STATUS: Record<Status, { cls: string; text: string }> = {
  hit: { cls: "ok", text: "On target" },
  miss: { cls: "crit", text: "Off target" },
  open: { cls: "warn", text: "To enter" },
  none: { cls: "info", text: "Tracking" },
};
const RATING: Record<Rating, { cls: string; text: string }> = { green: { cls: "ok", text: "Green" }, yellow: { cls: "warn", text: "Yellow" }, red: { cls: "crit", text: "Red" } };

export function ScorecardView({ userId, month, card, rows, note, accounts, tasks, others }: {
  userId: string;
  month: string;
  card: Card;
  rows: Row[];
  note: string;
  accounts: { id: string; name: string; tracked: boolean; rating: Rating | null }[];
  tasks: { title: string; due: string; done: boolean; late: boolean; client: string | null }[];
  others: { user_id: string; name: string; card: Card }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!card.kpis.length);
  const [state, setState] = useState<SaveState>("idle");
  const save = async (fn: () => Promise<{ error?: string }>) => {
    setState("saving");
    const r = await fn().catch(() => ({ error: "x" }));
    setState(r.error ? "error" : "saved");
    if (!r.error) router.refresh();
  };
  const groups = [...new Set(rows.map((r) => r.kpi.group ?? ""))];
  const late = tasks.filter((t) => t.late).length;
  const other = tasks.filter((t) => !t.client && !t.done);

  if (editing) return <EditCard userId={userId} card={card} others={others} onDone={() => { setEditing(false); router.refresh(); }} />;

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>
      <section className="panel tsc-mission">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>{card.role_title || "Scorecard"}</h2>
          <button type="button" className="btn sm line" onClick={() => setEditing(true)}>Edit scorecard</button>
        </div>
        {card.mission && <p className="tsc-mission-text">{card.mission}</p>}
      </section>

      <section className="panel">
        <h2>KPIs this month</h2>
        <div className="tablewrap">
          <table className="prc-table tsc-kpis">
            <thead><tr><th scope="col">KPI</th><th scope="col">Target this quarter</th><th scope="col">This month</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {groups.map((g) => [
                g ? <tr key={`g-${g}`} className="trk-sub"><th colSpan={4} scope="colgroup">{g}</th></tr> : null,
                ...rows.filter((r) => (r.kpi.group ?? "") === g).map((r) => (
                  <tr key={r.kpi.id}>
                    <th scope="row">
                      {r.kpi.label}
                      {r.kpi.note && <small className="note">{r.kpi.note}</small>}
                    </th>
                    <td className="kn">{fmtTarget(r.kpi, month)}</td>
                    <td>
                      {r.kpi.source === "manual" ? (
                        r.kpi.unit === "yesno" ? (
                          <select className="input tsc-yesno" aria-label={`${r.kpi.label} this month`} defaultValue={r.value === null ? "" : r.value >= 1 ? "1" : "0"}
                            onChange={(e) => save(() => saveMonth(userId, month, { values: { [r.kpi.id]: e.target.value === "" ? null : Number(e.target.value) } }))}>
                            <option value="">—</option><option value="1">Yes</option><option value="0">No</option>
                          </select>
                        ) : (
                          <Num label={`${r.kpi.label} this month`} value={r.value ?? undefined} placeholder="Enter"
                            onSave={(n) => save(() => saveMonth(userId, month, { values: { [r.kpi.id]: n ?? null } }))} />
                        )
                      ) : (
                        <span className="tsc-auto" title={r.detail ?? undefined}>
                          <b>{fmtValue(r.kpi, r.value)}</b>
                          <small className="note">From the portal{r.detail ? ` · ${r.detail}` : ""}</small>
                        </span>
                      )}
                    </td>
                    <td><span className={`pill ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </section>

      <div className="trk-two">
        <section className="panel">
          <h2>Accounts they manage</h2>
          {accounts.length ? (
            <ul className="list">
              {accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/team/clients/${a.id}?tab=health`}>{a.name}</Link>
                  <span className="r">{!a.tracked ? <span className="note">Not tracked</span> : a.rating ? <span className={`pill ${RATING[a.rating].cls}`}>{RATING[a.rating].text}</span> : <span className="note">No scorecard yet</span>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="note">They aren&apos;t account manager on any active clients.</p>}
        </section>

        <section className="panel">
          <h2>Their tasks this month</h2>
          <dl className="trk-dl">
            <div><dt>Due this month</dt><dd>{tasks.length}</dd></div>
            <div><dt>Done</dt><dd>{tasks.filter((t) => t.done).length}</dd></div>
            <div><dt>Late or overdue</dt><dd>{late ? <span className="pill crit">{late}</span> : 0}</dd></div>
          </dl>
          <h3 className="eyebrow" style={{ margin: "12px 0 4px" }}>Other work (not for a client)</h3>
          {other.length ? (
            <ul className="list">
              {other.slice(0, 8).map((t, i) => <li key={i}>{t.title}<span className="r note">{t.late ? <span className="pill crit">Overdue</span> : new Date(`${t.due}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}</span></li>)}
            </ul>
          ) : <p className="note">Nothing open.</p>}
        </section>
      </div>

      <section className="panel">
        <h2><label htmlFor="tsc-note">Notes for this month</label></h2>
        <Text id="tsc-note" area label="Notes for this month" value={note} placeholder="Wins, what to work on, anything for their quarterly review."
          onSave={(n) => save(() => saveMonth(userId, month, { note: n }))} />
      </section>
    </div>
  );
}

/** Change a scorecard's role, mission and KPIs, or start from someone else's. */
function EditCard({ userId, card, others, onDone }: { userId: string; card: Card; others: { user_id: string; name: string; card: Card }[]; onDone: () => void }) {
  const [c, setC] = useState(card);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<TeamKpi>) => setC({ ...c, kpis: c.kpis.map((k) => (k.id === id ? { ...k, ...patch } : k)) });
  return (
    <div className="trk">
      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div className="field" style={{ minWidth: 260 }}><label htmlFor="tsc-role">Role</label>
            <input className="input" id="tsc-role" value={c.role_title} onChange={(e) => setC({ ...c, role_title: e.target.value })} placeholder="Account Manager" /></div>
          {others.length > 0 && (
            <div className="field"><label htmlFor="tsc-copy">Start from someone else&apos;s</label>
              <select className="sel" id="tsc-copy" value="" onChange={(e) => {
                const o = others.find((x) => x.user_id === e.target.value);
                if (o && (!c.kpis.length || confirm(`Replace this scorecard with a copy of ${o.name}'s?`))) setC({ ...o.card, kpis: o.card.kpis.map((k) => ({ ...k, id: newId() })) });
              }}>
                <option value="">Copy a scorecard…</option>
                {others.map((o) => <option key={o.user_id} value={o.user_id}>{o.name} ({o.card.role_title})</option>)}
              </select></div>
          )}
        </div>
        <div className="field"><label htmlFor="tsc-mission">Mission</label>
          <textarea className="input" id="tsc-mission" rows={3} value={c.mission} onChange={(e) => setC({ ...c, mission: e.target.value })} /></div>
      </section>

      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <h2>KPIs</h2>
        <p className="note">Targets are for each quarter; leave one empty for a baseline quarter. &quot;From the portal&quot; numbers fill in on their own, for their own accounts or every account.</p>
        {c.kpis.map((k, i) => (
          <div key={k.id} className="tsc-edit">
            <div className="field tsc-wide"><label htmlFor={`k-l-${k.id}`}>KPI</label><input className="input" id={`k-l-${k.id}`} value={k.label} onChange={(e) => set(k.id, { label: e.target.value })} /></div>
            <div className="field"><label htmlFor={`k-g-${k.id}`}>Heading</label><input className="input" id={`k-g-${k.id}`} value={k.group ?? ""} placeholder="Optional" onChange={(e) => set(k.id, { group: e.target.value || undefined })} /></div>
            <div className="field"><label htmlFor={`k-s-${k.id}`}>Number comes from</label>
              <select className="sel" id={`k-s-${k.id}`} value={k.source} onChange={(e) => set(k.id, { source: e.target.value as TeamKpi["source"], unit: e.target.value === "accounts" ? "count" : e.target.value === "manual" ? k.unit : "pct" })}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select></div>
            {k.source !== "manual" ? (
              <div className="field"><label htmlFor={`k-sc-${k.id}`}>Accounts</label>
                <select className="sel" id={`k-sc-${k.id}`} value={k.scope ?? "own"} onChange={(e) => set(k.id, { scope: e.target.value as "own" | "all" })}>
                  <option value="own">The ones they manage</option><option value="all">Every account</option>
                </select></div>
            ) : (
              <div className="field"><label htmlFor={`k-u-${k.id}`}>Kind of number</label>
                <select className="sel" id={`k-u-${k.id}`} value={k.unit} onChange={(e) => set(k.id, { unit: e.target.value as TeamKpi["unit"] })}>
                  <option value="pct">Percent</option><option value="count">Count</option><option value="yesno">Yes or no</option>
                </select></div>
            )}
            <div className="field"><label htmlFor={`k-d-${k.id}`}>Goal</label>
              <select className="sel" id={`k-d-${k.id}`} value={k.dir} onChange={(e) => set(k.id, { dir: e.target.value as "min" | "max" })}>
                <option value="min">At least</option><option value="max">At most</option>
              </select></div>
            <div className="tsc-targets">
              {[0, 1, 2, 3].map((q) => (
                <label key={q}><span>Q{q + 1}</span>
                  <input className="input" inputMode="decimal" aria-label={`Q${q + 1} target`} value={k.targets[q] ?? ""}
                    onChange={(e) => { const t = [...k.targets]; t[q] = e.target.value === "" ? null : Number(e.target.value); set(k.id, { targets: t }); }} />
                </label>
              ))}
            </div>
            <div className="field tsc-wide"><label htmlFor={`k-n-${k.id}`}>Notes (optional)</label><input className="input" id={`k-n-${k.id}`} value={k.note ?? ""} onChange={(e) => set(k.id, { note: e.target.value || undefined })} /></div>
            <div className="row tsc-row-actions">
              <button type="button" className="linkbtn note" disabled={i === 0} onClick={() => { const ks = [...c.kpis]; [ks[i - 1], ks[i]] = [ks[i], ks[i - 1]]; setC({ ...c, kpis: ks }); }}>Move up</button>
              <button type="button" className="linkbtn note" onClick={() => setC({ ...c, kpis: c.kpis.filter((x) => x.id !== k.id) })}>Remove</button>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn sm line" onClick={() => setC({ ...c, kpis: [...c.kpis, { id: newId(), label: "", source: "manual", scope: "own", unit: "pct", dir: "min", targets: [null, null, null, null] }] })}>Add a KPI</button></div>
      </section>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await saveCard(userId, { ...c, kpis: c.kpis.filter((k) => k.label.trim()) });
          if (r.error) return setError(r.error);
          onDone();
        })}>{pending ? "Saving…" : "Save scorecard"}</button>
        {card.kpis.length > 0 && <button type="button" className="btn line" onClick={onDone}>Cancel</button>}
      </div>
    </div>
  );
}

/** The owner picks which admins can see team scorecards. */
export function ShareScorecards({ admins, shared }: { admins: { user_id: string; display_name: string }[]; shared: string[] }) {
  const [state, action, pending] = useActionState(saveScorecardSharing, {});
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <fieldset className="checks">
        <legend>Admins who can see team scorecards</legend>
        {admins.map((a) => <label key={a.user_id}><input type="checkbox" name="share" value={a.user_id} defaultChecked={shared.includes(a.user_id)} /> {a.display_name}</label>)}
        {!admins.length && <p className="note">No other admins yet.</p>}
      </fieldset>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn sm line" disabled={pending}>{pending ? "Saving…" : "Save sharing"}</button></div>
    </form>
  );
}
