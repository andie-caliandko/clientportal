"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { saveBilling, saveCeoSharing, setInvoicePaid } from "./actions";

export function EditBilling({ clientId, clientName, fee, day }: { clientId: string; clientName: string; fee: number; day: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveBilling, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit</button>
      {open && (
        <Modal title={`${clientName} · billing`} onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="client" value={clientId} />
            <div className="row top">
              <div className="field"><label htmlFor="bf-fee">Monthly fee</label><input className="input" id="bf-fee" name="fee" inputMode="decimal" defaultValue={fee || ""} placeholder="2500" /></div>
              <div className="field"><label htmlFor="bf-day">Invoice due on day</label><input className="input" id="bf-day" name="day" inputMode="numeric" defaultValue={day ?? ""} placeholder="1" />
                <span className="note">Day of the month, 1 to 31. After it passes, an unpaid invoice shows as late.</span></div>
            </div>
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

/** Mark this month's invoice paid or unpaid; the row updates right away. */
export function PaidToggle({ clientId, month, paid, amount }: { clientId: string; month: string; paid: boolean; amount: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(paid);
  return (
    <button type="button" className="btn sm line" disabled={pending} onClick={() => {
      setShown(!shown);
      startTransition(async () => { await setInvoicePaid(clientId, month, !paid, amount); router.refresh(); });
    }}>{shown === paid ? (paid ? "Mark unpaid" : "Mark paid") : "Saving…"}</button>
  );
}

export function ShareCeo({ admins, shared }: { admins: { user_id: string; display_name: string }[]; shared: string[] }) {
  const [state, action, pending] = useActionState(saveCeoSharing, {});
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <fieldset className="checks">
        <legend>Admins who can see this dashboard</legend>
        {admins.map((a) => <label key={a.user_id}><input type="checkbox" name="share" value={a.user_id} defaultChecked={shared.includes(a.user_id)} /> {a.display_name}</label>)}
        {!admins.length && <p className="note">No other admins yet.</p>}
      </fieldset>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn sm line" disabled={pending}>{pending ? "Saving…" : "Save sharing"}</button></div>
    </form>
  );
}
