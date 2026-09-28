"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/app/Modal";

import { addTimeEntry, deleteTimeEntry, startTimer, stopTimer, updateTimeEntry } from "./actions";

type Opt = { id: string; name: string };
export type Running = { id: string; client_id: string | null; description: string; started_at: string };

/** Counts up every second from when the timer started. */
function useElapsed(startedAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function ClientSelect({ id, clients, value, agencyName }: { id: string; clients: Opt[]; value?: string | null; agencyName: string }) {
  return (
    <select className="sel" id={id} name="client" defaultValue={value ?? "internal"}>
      <option value="internal">{agencyName} (internal)</option>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

/** The timer at the top of the Time page. */
export function TimerCard({ running, clients, agencyName }: { running: Running | null; clients: Opt[]; agencyName: string }) {
  const [state, start, starting] = useActionState(startTimer, {});
  const [stopping, startStop] = useTransition();
  if (running) return <RunningTimer running={running} clientName={clients.find((c) => c.id === running.client_id)?.name ?? `${agencyName} (internal)`} stopping={stopping} onStop={() => startStop(async () => { await stopTimer(); })} />;
  return (
    <form action={start} className="timer-card">
      <div className="field" style={{ flex: 2 }}><label htmlFor="tm-desc">What are you working on?</label>
        <input className="input" id="tm-desc" name="description" placeholder="Editing October reels" /></div>
      <div className="field"><label htmlFor="tm-client">For</label><ClientSelect id="tm-client" clients={clients} agencyName={agencyName} /></div>
      <button className="btn" disabled={starting}>{starting ? "Starting…" : "Start timer"}</button>
      {state.error && <p className="error" style={{ flexBasis: "100%" }}>{state.error}</p>}
    </form>
  );
}

function RunningTimer({ running, clientName, stopping, onStop }: { running: Running; clientName: string; stopping: boolean; onStop: () => void }) {
  const elapsed = useElapsed(running.started_at);
  return (
    <div className="timer-card running" role="timer" aria-live="off">
      <span className="timer-dot" aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="timer-time">{elapsed}</b>
        <p className="note" style={{ margin: 0 }}>{running.description || "No description"} · {clientName}</p>
      </div>
      <button type="button" className="btn warm" onClick={onStop} disabled={stopping}>{stopping ? "Stopping…" : "Stop"}</button>
    </div>
  );
}

/** Top bar on every team page: a running timer, so it isn't forgotten. */
export function RunningPill({ startedAt, label }: { startedAt: string; label: string }) {
  const elapsed = useElapsed(startedAt);
  return <Link href="/team/time" className="timer-pill" title={`Timer running: ${label}`}><span className="timer-dot" aria-hidden="true" />{elapsed}<span className="timer-pill-label"> · {label}</span></Link>;
}

type EntryFields = { id?: string; client_id: string | null; description: string; date: string; start: string; duration: string };

function EntryForm({ entry, clients, agencyName, onDone }: { entry?: EntryFields; clients: Opt[]; agencyName: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(entry?.id ? updateTimeEntry : addTimeEntry, {});
  const [deleting, startDelete] = useTransition();
  useEffect(() => { if (state.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = entry?.id ?? "new";
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      {entry?.id && <input type="hidden" name="id" value={entry.id} />}
      <div className="field"><label htmlFor={`te-desc-${p}`}>What you worked on</label>
        <input className="input" id={`te-desc-${p}`} name="description" defaultValue={entry?.description} placeholder="Strategy call prep" /></div>
      <div className="field"><label htmlFor={`te-client-${p}`}>For</label><ClientSelect id={`te-client-${p}`} clients={clients} value={entry?.client_id} agencyName={agencyName} /></div>
      <div className="row top">
        <div className="field"><label htmlFor={`te-date-${p}`}>Day</label><input className="input" id={`te-date-${p}`} name="date" type="date" defaultValue={entry?.date} required /></div>
        <div className="field"><label htmlFor={`te-start-${p}`}>Started</label><input className="input" id={`te-start-${p}`} name="start" type="time" defaultValue={entry?.start ?? "09:00"} required /></div>
        <div className="field"><label htmlFor={`te-dur-${p}`}>How long</label><input className="input" id={`te-dur-${p}`} name="duration" defaultValue={entry?.duration} placeholder="1:30" required />
          <span className="note">Like 1:30, 1.5 or 45m</span></div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : entry?.id ? "Save" : "Add time"}</button>
        <button type="button" className="btn sm line" onClick={onDone}>Cancel</button>
        {entry?.id && (
          <button type="button" className="btn sm line" style={{ marginLeft: "auto" }} disabled={deleting}
            onClick={() => startDelete(async () => { await deleteTimeEntry(entry.id!); onDone(); })}>{deleting ? "Deleting…" : "Delete"}</button>
        )}
      </div>
    </form>
  );
}

export function AddTime({ clients, agencyName, today }: { clients: Opt[]; agencyName: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>Add time by hand</button>
      {open && (
        <Modal title="Add time" onClose={() => setOpen(false)}>
          <EntryForm entry={{ client_id: null, description: "", date: today, start: "09:00", duration: "" }} clients={clients} agencyName={agencyName} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

export function EditTime({ entry, clients, agencyName }: { entry: EntryFields & { id: string }; clients: Opt[]; agencyName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit</button>
      {open && (
        <Modal title="Edit time" onClose={() => setOpen(false)}>
          <EntryForm entry={entry} clients={clients} agencyName={agencyName} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

