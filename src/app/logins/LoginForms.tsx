"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { deleteLogin, revealLogin, saveLogin } from "./actions";

export type LoginRow = { id: string; service: string; username: string | null; url: string | null; note: string | null; has_secret: boolean };

const SERVICES = ["Instagram", "Facebook", "TikTok", "LinkedIn", "Pinterest", "YouTube", "Google Business Profile", "Website", "Email", "Canva"];

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
              <input className="input" id={`lg-svc-${p}`} name="service" list="lg-services" defaultValue={login?.service} placeholder="Instagram" required />
              <datalist id="lg-services">{SERVICES.map((s) => <option key={s} value={s} />)}</datalist></div>
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
