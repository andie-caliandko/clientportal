"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ClientUser } from "@/lib/types";
import { invitePerson, sendMessage } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send"}</button>;
}

export function Compose({ agencyName }: { agencyName: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="compose"
      action={async (form) => {
        await sendMessage(form);
        ref.current?.reset();
      }}
    >
      <label htmlFor="msg-input" className="sr">Write a message</label>
      <textarea id="msg-input" name="body" placeholder={`Write to your ${agencyName} team…`} required />
      <SendButton />
    </form>
  );
}

export function PeopleCard({ people, canAdd }: { people: ClientUser[]; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(invitePerson, {});
  return (
    <section className="card" style={{ display: "grid", gap: 14 }} aria-labelledby="h-people">
      <h2 id="h-people" style={{ fontSize: "1.6rem" }}>People on your portal</h2>
      <ul className="list">
        {people.map((p) => (
          <li key={p.user_id}>
            <span><b>{p.display_name}</b><br /><span className="note">{p.email}</span></span>
            <span className="r"><span className="pill info">{p.role === "owner" ? "Owner" : "Member"}</span></span>
          </li>
        ))}
      </ul>
      {state.ok && <p className="flash">{state.ok}</p>}
      {canAdd && !open && !state.ok && (
        <div><button className="btn sm line" onClick={() => setOpen(true)}>Add a person</button></div>
      )}
      {open && !state.ok && (
        <form action={action} style={{ display: "grid", gap: 10 }}>
          <div className="field"><label htmlFor="pp-name">Their name</label><input className="input" id="pp-name" name="name" required /></div>
          <div className="field"><label htmlFor="pp-email">Their email</label><input className="input" id="pp-email" name="email" type="email" required /></div>
          {state.error && <p className="error">{state.error}</p>}
          <div className="row">
            <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
            <button className="btn sm line" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
