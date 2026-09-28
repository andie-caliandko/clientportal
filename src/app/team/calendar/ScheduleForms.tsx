"use client";

import { Modal } from "@/app/Modal";
import { useActionState, useState } from "react";
import { addMyEvent, addMyOutOfOffice, saveBookingHours } from "./actions";

type R = { error?: string; ok?: string };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (h: number) => (h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

/** "Add to my calendar" and "Mark out of office", one open at a time. */
export function AddToSchedule({ today }: { today: string }) {
  const [open, setOpen] = useState<"event" | "ooo" | null>(null);
  const [eventState, eventAction, eventPending] = useActionState(async (p: R, f: FormData) => {
    const r = await addMyEvent(p, f);
    if (r.ok) setOpen(null);
    return r;
  }, {});
  const [oooState, oooAction, oooPending] = useActionState(async (p: R, f: FormData) => {
    const r = await addMyOutOfOffice(p, f);
    if (r.ok) setOpen(null);
    return r;
  }, {});
  const done = !open && (eventState.ok || oooState.ok);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn sm" onClick={() => setOpen(open === "event" ? null : "event")}>Add to my calendar</button>
        <button className="btn sm line" onClick={() => setOpen(open === "ooo" ? null : "ooo")}>Mark out of office</button>
        {done && <p className="flash" role="status" style={{ margin: 0 }}>{eventState.ok || oooState.ok}</p>}
      </div>
      {open === "event" && (
        <Modal title="Add to my calendar" onClose={() => setOpen(null)}>
        <form action={eventAction} className="panel">
          <h2>Add to my calendar</h2>
          <div className="field"><label htmlFor="ev-title">What</label><input className="input" id="ev-title" name="title" placeholder="Content shoot at Harris office" required /></div>
          <div className="row">
            <div className="field"><label htmlFor="ev-date">Date</label><input className="input" id="ev-date" name="date" type="date" defaultValue={today} required /></div>
            <div className="field"><label htmlFor="ev-start">Starts</label><input className="input" id="ev-start" name="start" type="time" defaultValue="10:00" required /></div>
            <div className="field"><label htmlFor="ev-end">Ends</label><input className="input" id="ev-end" name="end" type="time" defaultValue="11:00" required /></div>
          </div>
          <div className="field"><label htmlFor="ev-guests">Invite guests (optional)</label><textarea className="input" id="ev-guests" name="guests" style={{ minHeight: 56 }} placeholder="name@example.com, another@example.com" /></div>
          <label className="row" style={{ alignItems: "center", gap: 8 }}><input type="checkbox" name="meet" /> Add a Google Meet link</label>
          {eventState.error && <p className="error">{eventState.error}</p>}
          <div className="row">
            <button className="btn sm" disabled={eventPending}>{eventPending ? "Adding…" : "Add to Google Calendar"}</button>
            <button type="button" className="btn sm line" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
        </Modal>
      )}
      {open === "ooo" && (
        <Modal title="Mark out of office" onClose={() => setOpen(null)}>
        <form action={oooAction} className="panel">
          <h2>Mark out of office</h2>
          <div className="row">
            <div className="field"><label htmlFor="ooo-from">First day out</label><input className="input" id="ooo-from" name="from" type="date" defaultValue={today} required /></div>
            <div className="field"><label htmlFor="ooo-to">Last day out</label><input className="input" id="ooo-to" name="to" type="date" defaultValue={today} required /></div>
          </div>
          <div className="field"><label htmlFor="ooo-msg">Message for people who invite you (optional)</label><input className="input" id="ooo-msg" name="message" placeholder="I'm out until Monday. Doni can help in the meantime." /></div>
          <p className="note">This goes on your Google Calendar as Out of office. The team sees it here, and clients can&apos;t book calls with you on those days.</p>
          {oooState.error && <p className="error">{oooState.error}</p>}
          <div className="row">
            <button className="btn sm" disabled={oooPending}>{oooPending ? "Saving…" : "Mark me out"}</button>
            <button type="button" className="btn sm line" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
        </Modal>
      )}
    </div>
  );
}

/** When clients can book calls with me. */
export function BookingHours({ start, end, days }: { start: number; end: number; days: number[] }) {
  const [state, action, pending] = useActionState(saveBookingHours, {});
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <div className="row">
        <div className="field"><label htmlFor="bh-start">From</label>
          <select className="sel" id="bh-start" name="start" defaultValue={start}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select></div>
        <div className="field"><label htmlFor="bh-end">To</label>
          <select className="sel" id="bh-end" name="end" defaultValue={end}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select></div>
      </div>
      <fieldset className="daypick">
        <legend className="note">Days</legend>
        {DAYS.map((d, i) => (
          <label key={d}><input type="checkbox" name="days" value={i} defaultChecked={days.includes(i)} /> {d}</label>
        ))}
      </fieldset>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn sm line" disabled={pending}>{pending ? "Saving…" : "Save my hours"}</button></div>
    </form>
  );
}
