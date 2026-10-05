"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { LOGIN_SERVICES } from "@/lib/loginServices";
import { deleteLogin, requestLogins, revealLogin, saveLogin } from "./actions";

export type LoginRow = { id: string; service: string; username: string | null; url: string | null; note: string | null; has_secret: boolean };

const SERVICES = LOGIN_SERVICES;

const OTHER = "__other";

/** Pick the account from a list, or choose Other and type it. Sends the result as "service". */
function ServicePicker({ id, initial }: { id: string; initial?: string }) {
  const known = !initial || SERVICES.includes(initial);
  const [pick, setPick] = useState(known ? initial ?? "" : OTHER);
  return (
    <>
      <select className="sel" id={id} name={pick === OTHER ? undefined : "service"} value={pick} onChange={(e) => setPick(e.target.value)} required>
        <option value="" disabled>Choose an account…</option>
        {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={OTHER}>Other…</option>
      </select>
      {pick === OTHER && (
        <input className="input" name="service" aria-label="Account name" defaultValue={known ? "" : initial} placeholder="Type the account, like Shopify" required autoFocus />
      )}
    </>
  );
}

/** Add or edit a login. The password is never shown here; leave it blank to keep the saved one. */
export function LoginEditor({ clientId, login, label }: { clientId: string; login?: LoginRow; label: string }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState(saveLogin, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  const p = login?.id ?? "new";
  return (
    <>
      <button type="button" className={login ? "linkbtn note" : "btn sm"} onClick={() => { setShow(false); setOpen(true); }}>{label}</button>
      {open && (
        <Modal title={login ? `Edit ${login.service}` : "Add a login"} onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 12 }} autoComplete="off">
            <input type="hidden" name="client" value={clientId} />
            {login && <input type="hidden" name="id" value={login.id} />}
            <div className="field"><label htmlFor={`lg-svc-${p}`}>What it&apos;s for</label>
              <ServicePicker id={`lg-svc-${p}`} initial={login?.service} /></div>
            <div className="row top">
              <div className="field"><label htmlFor={`lg-user-${p}`}>Username or email</label><input className="input" id={`lg-user-${p}`} name="username" defaultValue={login?.username ?? ""} autoComplete="off" /></div>
              <div className="field"><label htmlFor={`lg-pass-${p}`}>Password</label>
                <input className="input" id={`lg-pass-${p}`} name="password" type={show ? "text" : "password"} autoComplete="new-password" required={!login} placeholder={login ? "Leave blank to keep the saved one" : ""} />
                <label className="row note" style={{ alignItems: "center", gap: 6 }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show while typing</label></div>
            </div>
            <div className="field"><label htmlFor={`lg-url-${p}`}>Sign-in page (optional)</label><input className="input" id={`lg-url-${p}`} name="url" defaultValue={login?.url ?? ""} placeholder="https://…" /></div>
            <div className="field"><label htmlFor={`lg-note-${p}`}>Notes (optional)</label><input className="input" id={`lg-note-${p}`} name="note" defaultValue={login?.note ?? ""} placeholder="Two-factor codes go to Sarah's phone" /></div>
            <p className="note">Passwords are encrypted and never sent by email, Slack or notifications.</p>
            {state.error && <p className="error">{state.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function RemoveLogin({ clientId, id, service }: { clientId: string; id: string; service: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return armed ? (
    <button type="button" className="btn sm warm" disabled={pending} onClick={() => startTransition(async () => { await deleteLogin(clientId, id); router.refresh(); })}>
      {pending ? "Removing…" : `Remove ${service}?`}
    </button>
  ) : <button type="button" className="linkbtn note" onClick={() => setArmed(true)}>Remove</button>;
}

/** Team: show a password for 30 seconds (each reveal is recorded). */
export function RevealPassword({ id }: { id: string }) {
  const router = useRouter();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!password) return;
    const t = setTimeout(() => setPassword(null), 30_000);
    return () => clearTimeout(t);
  }, [password]);
  if (error) return <span className="error" style={{ fontSize: ".8rem" }}>{error}</span>;
  if (password) {
    return (
      <span className="row" style={{ alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
        <code className="pw">{password}</code>
        <button type="button" className="btn sm line" onClick={async () => { await navigator.clipboard.writeText(password); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
        <button type="button" className="linkbtn note" onClick={() => setPassword(null)}>Hide</button>
      </span>
    );
  }
  return (
    <button type="button" className="btn sm line" disabled={pending} onClick={() => startTransition(async () => {
      const r = await revealLogin(id);
      if (r.error) setError(r.error);
      else { setCopied(false); setPassword(r.password ?? ""); router.refresh(); }
    })}>{pending ? "Revealing…" : "Reveal"}</button>
  );
}

/** Team: ask the client to add their logins (an email and a portal notification, never a password). */
export function RequestLogins({ clientId, have }: { clientId: string; have: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestLogins, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>Send login request</button>
      {state.ok && !open && <span className="flash" role="status">{state.ok}</span>}
      {open && (
        <Modal title="Send a login request" onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 14 }}>
            <input type="hidden" name="client" value={clientId} />
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ marginBottom: 8 }}>Which accounts do you need?</legend>
              <div className="check-grid">
                {SERVICES.map((s) => (
                  <label key={s} className="row note" style={{ alignItems: "center", gap: 8 }}>
                    <input type="checkbox" name="services" value={s} disabled={have.includes(s)} />
                    {s}{have.includes(s) ? " (already shared)" : ""}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor={`rl-other-${clientId}`}>Anything else (optional)</label>
              <input className="input" id={`rl-other-${clientId}`} name="other" placeholder="Shopify, Mailchimp" /></div>
            <div className="field"><label htmlFor={`rl-note-${clientId}`}>Note (optional)</label>
              <textarea className="input" id={`rl-note-${clientId}`} name="note" rows={2} placeholder="We need these before your kickoff call." /></div>
            <p className="note">They get an email and a portal notification with a link to Logins. Passwords are only ever entered there, never in email.</p>
            {state.error && <p className="error">{state.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
