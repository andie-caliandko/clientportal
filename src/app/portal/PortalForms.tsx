"use client";

import { Modal } from "@/app/Modal";
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

/** Client's own people in the Members panel, with room to invite one more. */
export function RailPeople({ people, canAdd }: { people: ClientUser[]; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(invitePerson, {});
  return (
    <>
      <ul className="people">
        {people.map((p) => (
          <li key={p.user_id}>
            <span className="av">{p.display_name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span><b>{p.display_name}</b><span className="note">{p.role === "owner" ? "Owner" : "Team member"}</span></span>
          </li>
        ))}
      </ul>
      {state.ok && <p className="flash">{state.ok}</p>}
      {canAdd && !open && !state.ok && (
        <>
          <div><button className="btn sm line" onClick={() => setOpen(true)}>Add a person</button></div>
          <p className="note">You can add one more person from your team.</p>
        </>
      )}
      {open && !state.ok && (
        <Modal title="Add a person" onClose={() => setOpen(false)}>
        <form action={action} style={{ display: "grid", gap: 10 }}>
          <div className="field"><label htmlFor="pp-name">Their name</label><input className="input" id="pp-name" name="name" required /></div>
          <div className="field"><label htmlFor="pp-email">Their email</label><input className="input" id="pp-email" name="email" type="email" required /></div>
          {state.error && <p className="error">{state.error}</p>}
          <div className="row">
            <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
            <button className="btn sm line" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
        </Modal>
      )}
    </>
  );
}
