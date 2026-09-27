"use client";

import { useActionState, useState } from "react";
import { sendCallRequest } from "./actions";

type Host = { user_id: string; display_name: string; connected: boolean };

/** On a client's page: ask the client to pick a time for a call. */
export function CallRequestForm({ clientId, hosts, defaultHost, from, to }: {
  clientId: string;
  hosts: Host[];
  defaultHost: string;
  /** Suggested window, e.g. tomorrow through two weeks out. */
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (p: { error?: string; ok?: string }, f: FormData) => {
    const r = await sendCallRequest(p, f);
    if (r.ok) {
      setOpen(false);
      setDone(r.ok);
      return {};
    }
    return r;
  }, {});
  if (!open) {
    return (
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn sm" onClick={() => { setDone(null); setOpen(true); }}>Ask them to pick a time</button>
        {done && <p className="flash" role="status" style={{ margin: 0 }}>{done}</p>}
      </div>
    );
  }
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor="cr-title">Call</label>
          <input className="input" id="cr-title" name="title" list="cr-titles" defaultValue="Monthly strategy call" required />
          <datalist id="cr-titles">
            <option value="Kickoff call" /><option value="Monthly strategy call" /><option value="Strategy review call" /><option value="Analytics review" />
          </datalist></div>
        <div className="field"><label htmlFor="cr-len">Length</label>
          <select className="sel" id="cr-len" name="duration" defaultValue="45">
            {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="cr-host">Host</label>
          <select className="sel" id="cr-host" name="host" defaultValue={defaultHost}>
            {hosts.map((h) => <option key={h.user_id} value={h.user_id} disabled={!h.connected}>{h.display_name}{h.connected ? "" : " (calendar not connected)"}</option>)}
          </select></div>
        <div className="field"><label htmlFor="cr-from">They can pick from</label><input className="input" id="cr-from" name="from" type="date" defaultValue={from} required /></div>
        <div className="field"><label htmlFor="cr-to">Through</label><input className="input" id="cr-to" name="to" type="date" defaultValue={to} required /></div>
      </div>
      <div className="field"><label htmlFor="cr-note">Note for them (optional)</label><input className="input" id="cr-note" name="note" placeholder="We'll go over last month's numbers and plan next month." /></div>
      <p className="note">They only see open times on the host&apos;s Google Calendar, inside the host&apos;s booking hours. Once they pick, Google sends them the invite with a Meet link and the usual reminders.</p>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send to client"}</button>
        <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
