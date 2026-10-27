"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { SHOOT_REPEATS } from "@/lib/shoots";
import { cancelShoot, saveShoot } from "./actions";

export type ShootRow = {
  id: string; client_id: string; shoot_date: string; end_date?: string | null; start_time: string | null; location: string | null;
  details: string | null; repeat: string | null; series_id: string | null;
};

/** Schedule a shoot (pick the client, unless it's on a client's page) or edit one. */
export function ShootEditor({ clients, clientId, shoot, label, className = "btn sm" }: {
  clients?: { id: string; name: string }[];
  clientId?: string;
  shoot?: ShootRow;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveShoot, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  const p = shoot?.id ?? clientId ?? "new";
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title={shoot ? "Edit content shoot" : "Schedule a content shoot"} onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 12 }}>
            {shoot && <input type="hidden" name="id" value={shoot.id} />}
            {shoot || clientId ? <input type="hidden" name="client" value={shoot?.client_id ?? clientId} /> : (
              <div className="field"><label htmlFor={`sh-client-${p}`}>Client</label>
                <select className="sel" id={`sh-client-${p}`} name="client" required defaultValue="">
                  <option value="" disabled>Choose a client</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            )}
            <div className="row top">
              <div className="field"><label htmlFor={`sh-date-${p}`}>First day</label><input className="input" id={`sh-date-${p}`} name="date" type="date" required defaultValue={shoot?.shoot_date} /></div>
              <div className="field"><label htmlFor={`sh-end-${p}`}>Last day (if more than one day)</label><input className="input" id={`sh-end-${p}`} name="end_date" type="date" defaultValue={shoot?.end_date ?? ""} /></div>
            </div>
            <div className="field"><label htmlFor={`sh-time-${p}`}>Start time (optional)</label><input className="input" id={`sh-time-${p}`} name="time" type="time" defaultValue={shoot?.start_time ?? ""} style={{ maxWidth: 220 }} /></div>
            <div className="field"><label htmlFor={`sh-loc-${p}`}>Location (optional)</label><input className="input" id={`sh-loc-${p}`} name="location" defaultValue={shoot?.location ?? ""} placeholder="Their storefront, 12 Main St" /></div>
            <div className="field"><label htmlFor={`sh-rep-${p}`}>Repeats</label>
              <select className="sel" id={`sh-rep-${p}`} name="repeat" defaultValue={shoot?.repeat ?? ""}>
                <option value="">Just this once</option>
                {SHOOT_REPEATS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              {shoot?.series_id && <span className="note">Changing this resets the shoots after this one.</span>}</div>
            <div className="field"><label htmlFor={`sh-det-${p}`}>Details for the client (optional)</label>
              <textarea className="input" id={`sh-det-${p}`} name="details" rows={3} defaultValue={shoot?.details ?? ""} placeholder="What we'll shoot and anything they should have ready." /></div>
            <p className="note">The client sees the date, time, location and details in their portal. Planning tasks go to the account manager, starting 45 days before.</p>
            {state.error && <p className="error">{state.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : shoot ? "Save" : "Schedule shoot"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Cancel a shoot (and, for a series, optionally every one after it). */
export function CancelShoot({ id, inSeries }: { id: string; inSeries: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const go = (following: boolean) => startTransition(async () => { await cancelShoot(id, following); router.refresh(); });
  if (!armed) return <button type="button" className="linkbtn note" onClick={() => setArmed(true)}>Cancel</button>;
  return (
    <span className="row" style={{ gap: 8, alignItems: "center" }}>
      <button type="button" className="btn sm warm" disabled={pending} onClick={() => go(false)}>{inSeries ? "Cancel this one" : "Cancel shoot"}</button>
      {inSeries && <button type="button" className="btn sm warm" disabled={pending} onClick={() => go(true)}>This and all after</button>}
      <button type="button" className="linkbtn note" onClick={() => setArmed(false)}>Keep</button>
    </span>
  );
}
