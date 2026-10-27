"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isScript, newId, newSetup, samePlan, SHOT_TYPES, usedFor, type Model, type Setup, type ShotRow, type ShootLocation, type ShootPlan, type TimelineItem } from "@/lib/shootPlan";
import { saveShootPlan, sendShootPlan } from "../actions";
import { Waivers, type Waiver } from "./Waivers";

const move = <T,>(list: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
const focusSoon = (id: string) => setTimeout(() => document.getElementById(id)?.focus());

/** The shoot plan, section by section. Save keeps it private; Send to client shares this version. */
export function PlanEditor({ shootId, clientId, agencyId, initial, sent, changedSinceSent, waivers }: {
  shootId: string;
  clientId: string;
  agencyId: string;
  initial: ShootPlan;
  sent: { at: string } | null;
  changedSinceSent: boolean;
  waivers: Waiver[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<ShootPlan>(initial);
  const [saved, setSaved] = useState<ShootPlan>(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const dirty = !samePlan(plan, saved);
  const unsent = sent ? dirty || changedSinceSent : true;

  const set = (p: Partial<ShootPlan>) => { setPlan((cur) => ({ ...cur, ...p })); setMsg({}); };
  const setSetup = (i: number, p: Partial<Setup>) => set({ setups: plan.setups.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const setShot = (i: number, k: number, p: Partial<ShotRow>) =>
    set({ setups: plan.setups.map((x, j) => (j === i ? { ...x, shots: x.shots.map((r, n) => (n === k ? { ...r, ...p } : r)) } : x)) });
  const setLoc = (i: number, p: Partial<ShootLocation>) => set({ locations: plan.locations.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const setModel = (i: number, p: Partial<Model>) => set({ models: plan.models.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const setTime = (i: number, p: Partial<TimelineItem>) => set({ timeline: plan.timeline.map((t, k) => (k === i ? { ...t, ...p } : t)) });

  const save = async (next: ShootPlan, send = false) => {
    const r = await (send ? sendShootPlan : saveShootPlan)(shootId, next);
    setMsg(r);
    setConfirming(false);
    if (!r.error) { setSaved(next); router.refresh(); }
    return r;
  };
  const run = (send: boolean) => start(async () => { await save(plan, send); });
  const download = () => start(async () => {
    if (dirty && (await save(plan)).error) return;
    window.location.href = `/api/shoots/${shootId}/plan.pdf`;
  });
  // A waiver upload marks that model as signed and saves the plan with it.
  const waiverAdded = (modelId: string) => start(async () => {
    const next = { ...plan, models: plan.models.map((m) => (m.id === modelId ? { ...m, waiverSigned: true } : m)) };
    setPlan(next);
    await save(next);
  });

  const venues = plan.locations.map((l) => l.venue).filter(Boolean);
  return (
    <>
      <div className="panel plan-status">
        <span className={`pill ${!sent ? "" : unsent ? "warn" : "ok"}`}>{!sent ? "Private draft" : unsent ? "Changes not sent" : "Sent to client"}</span>
        <span className="note">
          {!sent ? "Only your team can see this. Send it when it's ready." : `Client has the version sent ${sent.at}.${unsent ? " Your edits since then are private until you send again." : ""}`}
        </span>
        <span className="r row" style={{ gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <button type="button" className="btn sm line" disabled={pending} onClick={download}>Download PDF</button>
          <button type="button" className="btn sm line" disabled={pending || !dirty} onClick={() => run(false)}>{dirty ? "Save draft" : "Saved"}</button>
          {confirming ? (
            <>
              <button type="button" className="btn sm" disabled={pending} onClick={() => run(true)}>{pending ? "Sending…" : "Yes, send it"}</button>
              <button type="button" className="linkbtn note" onClick={() => setConfirming(false)}>Not yet</button>
            </>
          ) : (
            <button type="button" className="btn sm" disabled={pending || (!!sent && !unsent)} onClick={() => setConfirming(true)}>{sent ? "Send update to client" : "Send to client"}</button>
          )}
        </span>
        {msg.error && <p className="error" style={{ width: "100%" }}>{msg.error}</p>}
        {msg.ok && <p className="note" style={{ width: "100%" }}>{msg.ok}</p>}
      </div>

      <div className="panel">
        <div className="sec-head"><h2>Schedule</h2><span className="note">How the day runs</span></div>
        <ol className="plan-rows">
          {plan.timeline.map((t, i) => (
            <li key={i}>
              <input className="input plan-time" id={`tl-time-${i}`} aria-label="Time" value={t.time} placeholder="9:00 AM" onChange={(e) => setTime(i, { time: e.target.value })} />
              <input className="input" aria-label="Activity" value={t.text} placeholder="Arrive, gear and lighting check" onChange={(e) => setTime(i, { text: e.target.value })} />
              <span className="plan-tools">
                <button type="button" className="linkbtn note" aria-label="Move up" onClick={() => set({ timeline: move(plan.timeline, i, -1) })}>↑</button>
                <button type="button" className="linkbtn note" aria-label="Move down" onClick={() => set({ timeline: move(plan.timeline, i, 1) })}>↓</button>
                <button type="button" className="linkbtn note" aria-label="Remove" onClick={() => set({ timeline: plan.timeline.filter((_, k) => k !== i) })}>✕</button>
              </span>
            </li>
          ))}
        </ol>
        <div><button type="button" className="btn sm line" onClick={() => { set({ timeline: [...plan.timeline, { time: "", text: "" }] }); focusSoon(`tl-time-${plan.timeline.length}`); }}>Add a time</button></div>
      </div>
      <div className="panel">
        <h2>Overview</h2>
        <div className="field"><label htmlFor="pl-title">Title</label>
          <input className="input" id="pl-title" value={plan.title} placeholder="Content Shoot" onChange={(e) => set({ title: e.target.value })} style={{ maxWidth: 420 }} /></div>
        <div className="field"><label htmlFor="pl-purpose">Purpose</label>
          <textarea className="input" id="pl-purpose" rows={3} value={plan.purpose} onChange={(e) => set({ purpose: e.target.value })}
            placeholder="What this shoot is for and what content it needs to produce." /></div>
        <div className="row top">
          <div className="field"><label htmlFor="pl-goal">Goal</label>
            <textarea className="input" id="pl-goal" rows={2} value={plan.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="Awareness, a launch, sales for a product…" /></div>
          <div className="field"><label htmlFor="pl-tone">Direction</label>
            <textarea className="input" id="pl-tone" rows={2} value={plan.tone} onChange={(e) => set({ tone: e.target.value })} placeholder="Tone and style: candid over posed, bright and natural…" /></div>
        </div>
      </div>

      <div className="panel">
        <div className="sec-head"><h2>Locations</h2><span className="note">Where you&apos;re shooting. &ldquo;Used for&rdquo; fills in from the setups.</span></div>
        {plan.locations.length > 0 && (
          <div className="plan-table-wrap">
            <table className="plan-table">
              <thead><tr><th>Venue</th><th>Address</th><th>Used for</th><th>Notes</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {plan.locations.map((l, i) => (
                  <tr key={l.id}>
                    <td><input className="input" id={`loc-venue-${i}`} aria-label="Venue" value={l.venue} placeholder="Their storefront" onChange={(e) => setLoc(i, { venue: e.target.value })} /></td>
                    <td><input className="input" aria-label="Address" value={l.address} onChange={(e) => setLoc(i, { address: e.target.value })} /></td>
                    <td className="note">{usedFor(plan, l.venue).join(", ") || "—"}</td>
                    <td><input className="input" aria-label="Notes" value={l.notes} placeholder="Need to book, parking…" onChange={(e) => setLoc(i, { notes: e.target.value })} /></td>
                    <td><button type="button" className="linkbtn note" aria-label="Remove location" onClick={() => set({ locations: plan.locations.filter((_, k) => k !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div><button type="button" className="btn sm line" onClick={() => { set({ locations: [...plan.locations, { id: newId(), venue: "", address: "", notes: "" }] }); focusSoon(`loc-venue-${plan.locations.length}`); }}>Add a location</button></div>
      </div>

      <div className="plan-setups">
        <div className="sec-head">
          <div><h2>Setups</h2><p className="note">Each look, scene or area you&apos;re shooting, in priority order. Each gets its own shot list and video scripts.</p></div>
        </div>
        <datalist id="pl-venues">{venues.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="pl-shot-types">{SHOT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        {plan.setups.map((s, i) => (
          <div className="panel plan-setup" key={s.id}>
            <div className="sec-head">
              <h3><span className="plan-pri">{i + 1}</span>{s.name || "Untitled setup"}</h3>
              <span className="plan-tools">
                <button type="button" className="linkbtn note" aria-label="Higher priority" onClick={() => set({ setups: move(plan.setups, i, -1) })}>↑</button>
                <button type="button" className="linkbtn note" aria-label="Lower priority" onClick={() => set({ setups: move(plan.setups, i, 1) })}>↓</button>
                <button type="button" className="linkbtn note" onClick={() => set({ setups: plan.setups.filter((_, k) => k !== i) })}>Remove</button>
              </span>
            </div>
            <div className="plan-fields">
              <div className="field"><label htmlFor={`su-name-${i}`}>Setup</label><input className="input" id={`su-name-${i}`} value={s.name} onChange={(e) => setSetup(i, { name: e.target.value })} /></div>
              <div className="field"><label htmlFor={`su-feat-${i}`}>Featuring</label><input className="input" id={`su-feat-${i}`} value={s.featuring} placeholder="Product, collection or service" onChange={(e) => setSetup(i, { featuring: e.target.value })} /></div>
              <div className="field"><label htmlFor={`su-loc-${i}`}>Location</label><input className="input" id={`su-loc-${i}`} list="pl-venues" value={s.location} placeholder="Venue and spot" onChange={(e) => setSetup(i, { location: e.target.value })} /></div>
              <div className="field"><label htmlFor={`su-time-${i}`}>Time</label><input className="input" id={`su-time-${i}`} value={s.time} placeholder="9–10 AM" onChange={(e) => setSetup(i, { time: e.target.value })} /></div>
            </div>
            <div className="plan-shots">
              <div className="plan-shots-head"><span>Shot type</span><span>Shots to get</span></div>
              {s.shots.map((r, k) => !isScript(r.type) && (
                <div className="plan-shot" key={k}>
                  <input className="input" list="pl-shot-types" aria-label="Shot type" value={r.type} placeholder="Stills"
                    onChange={(e) => setShot(i, k, { type: e.target.value })} />
                  <textarea className="input" id={`su-${i}-shots-${k}`} aria-label={`${r.type || "Shots"} to get`} rows={3} value={r.shots}
                    placeholder="Hero shot, close-up details, candid laughing…"
                    onChange={(e) => setShot(i, k, { shots: e.target.value })} />
                  <button type="button" className="linkbtn note" aria-label="Remove shot type" onClick={() => setSetup(i, { shots: s.shots.filter((_, j) => j !== k) })}>✕</button>
                </div>
              ))}
              {s.shots.map((r, k) => isScript(r.type) && (
                <div className="plan-script" key={k}>
                  <div className="sec-head">
                    <label htmlFor={`su-${i}-shots-${k}`}><b>Script</b></label>
                    <input className="input" list="pl-shot-types" aria-label="Script name" value={r.type} onChange={(e) => setShot(i, k, { type: e.target.value })} />
                    <button type="button" className="linkbtn note" onClick={() => setSetup(i, { shots: s.shots.filter((_, j) => j !== k) })}>Remove</button>
                  </div>
                  <textarea className="input" id={`su-${i}-shots-${k}`} rows={10} value={r.shots}
                    placeholder={"Hook (0–3s): …\nScene 1: what we see / what's said\nScene 2: …\nCall to action: …\nOn-screen text: …"}
                    onChange={(e) => setShot(i, k, { shots: e.target.value })} />
                </div>
              ))}
              <div>
                <button type="button" className="linkbtn" onClick={() => {
                  const used = new Set(s.shots.map((r) => r.type));
                  setSetup(i, { shots: [...s.shots, { type: SHOT_TYPES.find((t) => !used.has(t) && !isScript(t)) ?? "", shots: "" }] });
                  focusSoon(`su-${i}-shots-${s.shots.length}`);
                }}>+ Add a shot type</button>
                <button type="button" className="linkbtn" style={{ marginLeft: 16 }} onClick={() => {
                  const n = s.shots.filter((r) => isScript(r.type)).length;
                  setSetup(i, { shots: [...s.shots, { type: n ? `Video script ${n + 1}` : "Video script", shots: "" }] });
                  focusSoon(`su-${i}-shots-${s.shots.length}`);
                }}>+ Add a script</button>
              </div>
            </div>
            <div className="row top">
              <div className="field"><label htmlFor={`su-prod-${i}`}>Products / wardrobe <span className="note">(one per line)</span></label>
                <textarea className="input" id={`su-prod-${i}`} rows={3} value={s.products} placeholder={"Spring menu items\nNew tee – black"} onChange={(e) => setSetup(i, { products: e.target.value })} /></div>
              <div className="field"><label htmlFor={`su-props-${i}`}>Props <span className="note">(one per line)</span></label>
                <textarea className="input" id={`su-props-${i}`} rows={3} value={s.props} placeholder={"Fresh flowers\nLinen napkins"} onChange={(e) => setSetup(i, { props: e.target.value })} /></div>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn sm line" onClick={() => { set({ setups: [...plan.setups, newSetup(plan.setups.length + 1)] }); focusSoon(`su-name-${plan.setups.length}`); }}>Add a setup</button></div>
      </div>

      <div className="panel">
        <div className="sec-head"><h2>Bonus b-roll</h2><span className="note">Footage for any setup or location, one per line</span></div>
        <label htmlFor="pl-bonus" className="sr-only">Bonus b-roll</label>
        <textarea className="input" id="pl-bonus" rows={4} value={plan.bonus} onChange={(e) => set({ bonus: e.target.value })}
          placeholder={"Slow-motion walking toward camera\nFlat lay of products from above\nClips with open space at the top for captions"} />
      </div>

      <div className="panel">
        <div className="sec-head">
          <h2>Models</h2>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={plan.needsModels} onChange={(e) => set({ needsModels: e.target.checked })} /> This shoot needs models
          </label>
        </div>
        {!plan.needsModels ? <p className="note">Turn this on to cast models, assign them to setups and keep their signed waivers.</p> : (
          <>
            {plan.models.length > 0 && (
              <div className="plan-table-wrap">
                <table className="plan-table">
                  <thead><tr><th>Name</th><th>Setups</th><th>Size</th><th>Waiver</th><th>Notes</th><th><span className="sr-only">Remove</span></th></tr></thead>
                  <tbody>
                    {plan.models.map((m, i) => (
                      <tr key={m.id}>
                        <td><input className="input" id={`model-${i}`} aria-label="Name" value={m.name} onChange={(e) => setModel(i, { name: e.target.value })} /></td>
                        <td>
                          <span className="plan-chips">
                            {plan.setups.map((s, k) => (
                              <label key={s.id} className={`plan-chip ${m.setupIds.includes(s.id) ? "on" : ""}`}>
                                <input type="checkbox" className="sr-only" checked={m.setupIds.includes(s.id)}
                                  onChange={(e) => setModel(i, { setupIds: e.target.checked ? [...m.setupIds, s.id] : m.setupIds.filter((x) => x !== s.id) })} />
                                {s.name || `Setup ${k + 1}`}
                              </label>
                            ))}
                            {!plan.setups.length && <span className="note">Add setups first</span>}
                          </span>
                        </td>
                        <td><input className="input" aria-label="Size" value={m.size} style={{ width: 70 }} onChange={(e) => setModel(i, { size: e.target.value })} /></td>
                        <td>
                          <label className="row" style={{ gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                            <input type="checkbox" checked={m.waiverSigned} onChange={(e) => setModel(i, { waiverSigned: e.target.checked })} /> Signed
                          </label>
                        </td>
                        <td><input className="input" aria-label="Notes" value={m.notes} placeholder="Parent contact, availability…" onChange={(e) => setModel(i, { notes: e.target.value })} /></td>
                        <td><button type="button" className="linkbtn note" aria-label="Remove model" onClick={() => set({ models: plan.models.filter((_, k) => k !== i) })}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div><button type="button" className="btn sm line" onClick={() => { set({ models: [...plan.models, { id: newId(), name: "", setupIds: [], size: "", waiverSigned: false, notes: "" }] }); focusSoon(`model-${plan.models.length}`); }}>Add a model</button></div>
            <Waivers shootId={shootId} clientId={clientId} agencyId={agencyId} models={plan.models.filter((m) => m.name)} waivers={waivers} onAdded={waiverAdded} />
          </>
        )}
      </div>

    </>
  );
}
