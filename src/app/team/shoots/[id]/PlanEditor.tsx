"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { samePlan, type ShootPlan } from "@/lib/shootPlan";
import { saveShootPlan, sendShootPlan } from "../actions";

/** The plan as editable rows. Save keeps it private; Send to client shares this version. */
export function PlanEditor({ shootId, initial, sent, changedSinceSent }: {
  shootId: string;
  initial: ShootPlan;
  sent: { at: string; plan: ShootPlan } | null;
  changedSinceSent: boolean;
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
  const move = <T,>(list: T[], i: number, d: number) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const run = (send: boolean) => start(async () => {
    const r = await (send ? sendShootPlan : saveShootPlan)(shootId, plan);
    setMsg(r);
    setConfirming(false);
    if (!r.error) { setSaved(plan); router.refresh(); }
  });

  return (
    <>
      <div className="panel plan-status">
        <span className={`pill ${!sent ? "" : unsent ? "warn" : "ok"}`}>
          {!sent ? "Private draft" : unsent ? "Changes not sent" : "Sent to client"}
        </span>
        <span className="note">
          {!sent ? "Only your team can see this. Send it when it's ready." : `Client has the version sent ${sent.at}.${unsent ? " Your edits since then are private until you send again." : ""}`}
        </span>
        <span className="r row" style={{ gap: 8, alignItems: "center", marginLeft: "auto" }}>
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

      <div className="plan-grid">
        <div className="panel">
          <div className="sec-head"><h2>Shot list</h2><span className="note">{plan.shots.filter((s) => s.text.trim()).length} shots</span></div>
          <ol className="plan-rows">
            {plan.shots.map((s, i) => (
              <li key={i}>
                <span className="plan-num">{i + 1}</span>
                <label htmlFor={`shot-${i}`} className="sr-only">Shot {i + 1}</label>
                <input className="input" id={`shot-${i}`} value={s.text} placeholder="Wide shot of the storefront at opening"
                  onChange={(e) => set({ shots: plan.shots.map((x, k) => k === i ? { text: e.target.value } : x) })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); set({ shots: [...plan.shots.slice(0, i + 1), { text: "" }, ...plan.shots.slice(i + 1)] }); setTimeout(() => document.getElementById(`shot-${i + 1}`)?.focus()); } }} />
                <RowTools onUp={() => set({ shots: move(plan.shots, i, -1) })} onDown={() => set({ shots: move(plan.shots, i, 1) })} onRemove={() => set({ shots: plan.shots.filter((_, k) => k !== i) })} />
              </li>
            ))}
          </ol>
          <button type="button" className="btn sm line" onClick={() => { set({ shots: [...plan.shots, { text: "" }] }); setTimeout(() => document.getElementById(`shot-${plan.shots.length}`)?.focus()); }}>Add a shot</button>
        </div>

        <div className="panel">
          <div className="sec-head"><h2>Timeline</h2><span className="note">How the day runs</span></div>
          <ol className="plan-rows">
            {plan.timeline.map((t, i) => (
              <li key={i}>
                <label htmlFor={`tl-time-${i}`} className="sr-only">Time</label>
                <input className="input plan-time" id={`tl-time-${i}`} value={t.time} placeholder="9:00 AM"
                  onChange={(e) => set({ timeline: plan.timeline.map((x, k) => k === i ? { ...x, time: e.target.value } : x) })} />
                <label htmlFor={`tl-text-${i}`} className="sr-only">What happens</label>
                <input className="input" id={`tl-text-${i}`} value={t.text} placeholder="Arrive and set up lighting"
                  onChange={(e) => set({ timeline: plan.timeline.map((x, k) => k === i ? { ...x, text: e.target.value } : x) })} />
                <RowTools onUp={() => set({ timeline: move(plan.timeline, i, -1) })} onDown={() => set({ timeline: move(plan.timeline, i, 1) })} onRemove={() => set({ timeline: plan.timeline.filter((_, k) => k !== i) })} />
              </li>
            ))}
          </ol>
          <button type="button" className="btn sm line" onClick={() => { set({ timeline: [...plan.timeline, { time: "", text: "" }] }); setTimeout(() => document.getElementById(`tl-time-${plan.timeline.length}`)?.focus()); }}>Add a time</button>
        </div>
      </div>

      <div className="panel">
        <div className="sec-head"><h2>Plan</h2><span className="note">Goals, wardrobe, props, what the client should have ready</span></div>
        <label htmlFor="plan-overview" className="sr-only">Plan</label>
        <textarea className="input" id="plan-overview" rows={8} value={plan.overview} onChange={(e) => set({ overview: e.target.value })}
          placeholder="What this shoot is for, the look we're going for, who's on set, what to bring." />
      </div>
    </>
  );
}

function RowTools({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <span className="plan-tools">
      <button type="button" className="linkbtn note" aria-label="Move up" onClick={onUp}>↑</button>
      <button type="button" className="linkbtn note" aria-label="Move down" onClick={onDown}>↓</button>
      <button type="button" className="linkbtn note" aria-label="Remove" onClick={onRemove}>✕</button>
    </span>
  );
}
