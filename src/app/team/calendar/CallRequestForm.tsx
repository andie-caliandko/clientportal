"use client";

import { useActionState, useState } from "react";
import { sendCallInvite, sendCallRequest } from "./actions";

type Host = { user_id: string; display_name: string; connected: boolean };
type Contact = { user_id: string; display_name: string; email: string };
type R = { error?: string; ok?: string };

/** On a client's page: ask the client to pick a time for a call. */
export function CallActions(props: {
  clientId: string;
  hosts: Host[];
  defaultHost: string;
  contacts: Contact[];
  /** Suggested window, e.g. tomorrow through two weeks out. */
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState<"pick" | "invite" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const finish = (msg: string) => { setOpen(null); setDone(msg); };
  if (open === "pick") return <CallRequestForm {...props} onDone={finish} onCancel={() => setOpen(null)} />;
  if (open === "invite") return <CallInviteForm {...props} onDone={finish} onCancel={() => setOpen(null)} />;
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <button className="btn sm" onClick={() => { setDone(null); setOpen("pick"); }}>Ask them to pick a time</button>
      <button className="btn sm line" onClick={() => { setDone(null); setOpen("invite"); }}>Send an invite</button>
      {done && <p className="flash" role="status" style={{ margin: 0 }}>{done}</p>}
    </div>
  );
}

function CallRequestForm({ clientId, hosts, defaultHost, from, to, onDone, onCancel }: {
  clientId: string; hosts: Host[]; defaultHost: string; from: string; to: string;
  onDone: (msg: string) => void; onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(async (p: R, f: FormData) => {
    const r = await sendCallRequest(p, f);
    if (r.ok) onDone(r.ok);
    return r;
  }, {});
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
        <button type="button" className="btn sm line" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** A call at a set time: Google sends the invite; it shows in their portal once they accept. */
function CallInviteForm({ clientId, hosts, defaultHost, contacts, from, onDone, onCancel }: {
  clientId: string; hosts: Host[]; defaultHost: string; contacts: Contact[]; from: string;
  onDone: (msg: string) => void; onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(async (p: R, f: FormData) => {
    const r = await sendCallInvite(p, f);
    if (r.ok) onDone(r.ok);
    return r;
  }, {});
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor="ci-title">Call</label>
          <input className="input" id="ci-title" name="title" list="cr-titles" defaultValue="Monthly strategy call" required /></div>
        <div className="field"><label htmlFor="ci-host">Host</label>
          <select className="sel" id="ci-host" name="host" defaultValue={defaultHost}>
            {hosts.map((h) => <option key={h.user_id} value={h.user_id} disabled={!h.connected}>{h.display_name}{h.connected ? "" : " (calendar not connected)"}</option>)}
          </select></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="ci-date">Date</label><input className="input" id="ci-date" name="date" type="date" defaultValue={from} required /></div>
        <div className="field"><label htmlFor="ci-start">Time</label><input className="input" id="ci-start" name="start" type="time" defaultValue="10:00" required /></div>
        <div className="field"><label htmlFor="ci-len">Length</label>
          <select className="sel" id="ci-len" name="duration" defaultValue="45">
            {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select></div>
      </div>
      <fieldset className="daypick">
        <legend className="note">Invite from their portal</legend>
        {contacts.map((c) => (
          <label key={c.user_id}><input type="checkbox" name="contact" value={c.user_id} defaultChecked /> {c.display_name}</label>
        ))}
        {!contacts.length && <span className="note">No one has a portal login yet. Add emails below.</span>}
      </fieldset>
      <div className="field"><label htmlFor="ci-guests">Anyone else (optional)</label>
        <textarea className="input" id="ci-guests" name="guests" style={{ minHeight: 56 }} placeholder="Add as many emails as you need, separated by commas" /></div>
      <div className="field"><label htmlFor="ci-note">Note in the invite (optional)</label><input className="input" id="ci-note" name="note" placeholder="We'll go over last month's numbers and plan next month." /></div>
      <p className="note">Google sends everyone the invite with a Meet link and reminders. It shows in the client&apos;s portal once one of them accepts.</p>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
        <button type="button" className="btn sm line" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
