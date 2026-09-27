"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { deleteCalendarEvent, editCalendarEvent } from "./actions";

export type EventInfo = {
  owner: string;
  id: string;
  title: string;
  who: string;
  when: string;
  ooo: boolean;
  meetLink: string | null;
  link: string | null;
  description: string | null;
  /** The owner created it (not an invitation from someone else). */
  mine: boolean;
  organizer: string | null;
  recurring: boolean;
  guests: number;
  /** The person looking can change it (their own, or they're an admin). */
  canChange: boolean;
  allDay: boolean;
  /** Form values in the agency's time zone. */
  date: string;
  lastDate: string;
  start: string;
  end: string;
};

/** An event on the calendar: click it for details, editing and deleting. */
export function EventChip({ info, className, style, title, children }: {
  info: EventInfo;
  className: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`${className} ev-btn`} style={style} title={title} onClick={() => setOpen(true)}>{children}</button>
      {open && <EventDialog info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

function EventDialog({ info, onClose }: { info: EventInfo; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [allDay, setAllDay] = useState(info.allDay);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (p: { error?: string; ok?: string }, f: FormData) => {
    const r = await editCalendarEvent(p, f);
    if (r.ok) onClose();
    return r;
  }, {});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const editable = info.canChange && info.mine;
  const removable = info.canChange;

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={info.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cropper event-dialog">
        {mode === "edit" ? (
          <form action={action} style={{ display: "grid", gap: 12, width: "100%" }}>
            <h2>Edit event</h2>
            <input type="hidden" name="owner" value={info.owner} />
            <input type="hidden" name="event" value={info.id} />
            <div className="field"><label htmlFor="ee-title">What</label><input className="input" id="ee-title" name="title" defaultValue={info.title} required /></div>
            <label className="row" style={{ alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
            </label>
            {allDay ? (
              <div className="row">
                <div className="field"><label htmlFor="ee-date">First day</label><input className="input" id="ee-date" name="date" type="date" defaultValue={info.date} required /></div>
                <div className="field"><label htmlFor="ee-last">Last day</label><input className="input" id="ee-last" name="lastDate" type="date" defaultValue={info.lastDate} required /></div>
              </div>
            ) : (
              <div className="row">
                <div className="field"><label htmlFor="ee-date">Date</label><input className="input" id="ee-date" name="date" type="date" defaultValue={info.date} required /></div>
                <div className="field"><label htmlFor="ee-start">Starts</label><input className="input" id="ee-start" name="start" type="time" step={900} defaultValue={info.start} required /></div>
                <div className="field"><label htmlFor="ee-end">Ends</label><input className="input" id="ee-end" name="end" type="time" step={900} defaultValue={info.end} required /></div>
              </div>
            )}
            <div className="field"><label htmlFor="ee-desc">Notes</label><textarea className="input" id="ee-desc" name="description" defaultValue={info.description ?? ""} style={{ minHeight: 70 }} /></div>
            {info.recurring && <p className="note">This changes only this one. To change every repeat, edit it in Google Calendar.</p>}
            {info.guests > 0 && <p className="note">Google will email the {info.guests} guest{info.guests > 1 ? "s" : ""} about the change.</p>}
            {state.error && <p className="error">{state.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" className="btn sm line" onClick={() => setMode("view")}>Back</button>
            </div>
          </form>
        ) : (
          <div style={{ display: "grid", gap: 12, width: "100%" }}>
            <div>
              <p className="eyebrow">{info.who}{info.ooo ? " · Out of office" : ""}</p>
              <h2 style={{ marginTop: 4 }}>{info.title}</h2>
              <p className="note" style={{ marginTop: 4 }}>{info.when}</p>
            </div>
            {info.organizer && <p className="note">Invitation from {info.organizer}. Only they can change it.</p>}
            {info.description && <p className="event-notes">{info.description}</p>}
            {info.guests > 0 && <p className="note">{info.guests} guest{info.guests > 1 ? "s" : ""}</p>}
            <div className="row">
              {info.meetLink && <a className="btn sm" href={info.meetLink} target="_blank" rel="noreferrer">Join Google Meet</a>}
              {info.link && <a className="btn sm line" href={info.link} target="_blank" rel="noreferrer">Open in Google Calendar</a>}
            </div>
            {error && <p className="error">{error}</p>}
            {mode === "delete" ? (
              <div className="row" style={{ alignItems: "center" }}>
                <span className="note">{info.mine ? `Delete this event${info.guests ? " and tell the guests" : ""}?` : "Remove this from the calendar?"}</span>
                <button type="button" className="btn sm danger" disabled={deleting} onClick={() => startDelete(async () => {
                  const r = await deleteCalendarEvent(info.owner, info.id);
                  if (r.error) setError(r.error);
                  else onClose();
                })}>{deleting ? "Deleting…" : info.mine ? "Delete" : "Remove"}</button>
                <button type="button" className="btn sm line" onClick={() => setMode("view")}>Keep it</button>
              </div>
            ) : (
              <div className="row">
                {editable && <button type="button" className="btn sm line" onClick={() => setMode("edit")}>Edit</button>}
                {removable && <button type="button" className="btn sm line" onClick={() => setMode("delete")}>{info.mine ? "Delete" : "Remove from calendar"}</button>}
                <button type="button" className="btn sm line" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
