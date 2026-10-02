"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/app/Modal";
import { deleteGoal, saveGoal, setGoalDone } from "./actions";

export type Goal = { id: string; title: string; target: number | null; progress: number; done: boolean; note: string | null };

function GoalForm({ goal, period, start, onDone }: { goal?: Goal; period: string; start: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveGoal, {});
  const [deleting, startDelete] = useTransition();
  useEffect(() => { if (state.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = goal?.id ?? "new";
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="start" value={start} />
      <div className="field"><label htmlFor={`g-title-${p}`}>Goal</label><input className="input" id={`g-title-${p}`} name="title" defaultValue={goal?.title} placeholder="Post 20 reels across my accounts" required /></div>
      <div className="row top">
        <div className="field"><label htmlFor={`g-target-${p}`}>Target (optional)</label><input className="input" id={`g-target-${p}`} name="target" inputMode="decimal" defaultValue={goal?.target ?? ""} placeholder="20" />
          <span className="note">A number to aim for. Leave blank for a yes-or-no goal.</span></div>
        <div className="field"><label htmlFor={`g-progress-${p}`}>Progress so far</label><input className="input" id={`g-progress-${p}`} name="progress" inputMode="decimal" defaultValue={goal?.progress ?? 0} /></div>
      </div>
      <div className="field"><label htmlFor={`g-note-${p}`}>Notes (optional)</label><textarea className="input" id={`g-note-${p}`} name="note" defaultValue={goal?.note ?? ""} style={{ minHeight: 60 }} /></div>
      <label className="row" style={{ alignItems: "center", gap: 8 }}><input type="checkbox" name="done" defaultChecked={goal?.done} /> Done</label>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : goal ? "Save" : "Add goal"}</button>
        <button type="button" className="btn sm line" onClick={onDone}>Cancel</button>
        {goal && (
          <button type="button" className="btn sm line" style={{ marginLeft: "auto" }} disabled={deleting}
            onClick={() => startDelete(async () => { await deleteGoal(goal.id); onDone(); })}>{deleting ? "Deleting…" : "Delete"}</button>
        )}
      </div>
    </form>
  );
}

export function AddGoal({ period, start, label }: { period: string; start: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>Add a goal</button>
      {open && <Modal title={`New goal · ${label}`} onClose={() => setOpen(false)}><GoalForm period={period} start={start} onDone={() => setOpen(false)} /></Modal>}
    </>
  );
}

export function EditGoal({ goal, period, start }: { goal: Goal; period: string; start: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit</button>
      {open && <Modal title="Edit goal" onClose={() => setOpen(false)}><GoalForm goal={goal} period={period} start={start} onDone={() => setOpen(false)} /></Modal>}
    </>
  );
}

/** Tick a goal done right from the list. */
export function GoalCheck({ id, done, title }: { id: string; done: boolean; title: string }) {
  const [checked, setChecked] = useState(done);
  const [, startTransition] = useTransition();
  return (
    <input type="checkbox" className="goal-check" checked={checked} aria-label={`${title} done`}
      onChange={(e) => { setChecked(e.target.checked); startTransition(() => setGoalDone(id, e.target.checked)); }} />
  );
}
