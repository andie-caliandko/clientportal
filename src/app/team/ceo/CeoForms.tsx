"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { saveBilling, saveCeoSharing, setInvoicePaid } from "./actions";

export type PastMonth = { month: string; label: string; paid: boolean; amount: number | null; source: string | null; paidOn: string | null };

/** A client's fee, invoice day and payment history (for months before the portal, too). */
export function EditBilling({ clientId, clientName, fee, day, history, label }: {
  clientId: string; clientName: string; fee: number; day: number | null; history: PastMonth[]; label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveBilling, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" className="fee-btn" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title={`${clientName} · billing`} onClose={() => setOpen(false)} wide>
          <form action={action} style={{ display: "grid", gap: 14 }}>
            <input type="hidden" name="client" value={clientId} />
            <div className="row top">
              <div className="field"><label htmlFor="bf-fee">Monthly fee</label><input className="input" id="bf-fee" name="fee" inputMode="decimal" defaultValue={fee || ""} placeholder="2500" />
                <span className="note">For a one-time project, put the project fee here.</span></div>
              <div className="field"><label htmlFor="bf-day">Invoice due on day</label><input className="input" id="bf-day" name="day" inputMode="numeric" defaultValue={day ?? ""} placeholder="1" />
                <span className="note">Day of the month, 1 to 31. After it passes, an unpaid invoice shows as late.</span></div>
            </div>
            <div className="pay-history">
              <h3>Payment history</h3>
              <p className="note">Tick the months they&apos;ve paid, including before this platform, and add the date if you know it. Change the amount if it was different from their fee. Payments from Dubsado tick themselves.</p>
              <div className="tablewrap">
                <table>
                  <thead><tr><th scope="col">Month</th><th scope="col">Paid</th><th scope="col">Paid on</th><th scope="col">Amount</th></tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.month}>
                        <td>{h.label}<input type="hidden" name="month" value={h.month} /></td>
                        <td><label className="row" style={{ alignItems: "center", gap: 6 }}><input type="checkbox" name={`paid:${h.month}`} defaultChecked={h.paid} />{h.source === "dubsado" && h.paid && <span className="note">from Dubsado</span>}</label></td>
                        <td><input className="input pay-amt" type="date" name={`date:${h.month}`} defaultValue={h.paidOn ?? ""} min={`${h.month}-01`} max={`${h.month}-31`} aria-label={`${h.label} paid on`} /></td>
                        <td><input className="input pay-amt" name={`amount:${h.month}`} inputMode="decimal" defaultValue={h.amount ?? (h.paid ? "" : fee || "")} aria-label={`${h.label} amount`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

/** Mark paid (with the date and amount) or mark unpaid. */
export function PaidToggle({ clientId, clientName, month, paid, amount, project = false, monthsLeft }: {
  clientId: string; clientName: string; month: string; paid: boolean; amount: number | null; project?: boolean;
  /** Months left on their contract, to suggest for "paid in full". */
  monthsLeft?: number | null;
}) {
  const [upfront, setUpfront] = useState(false);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  // Viewing a past month: start on that month's first day; this month: today.
  const defaultDate = project || today.slice(0, 7) === month ? today : `${month}-01`;
  if (paid) {
    return (
      <button type="button" className="btn sm line" disabled={pending}
        onClick={() => startTransition(async () => { await setInvoicePaid(clientId, month, false, amount); router.refresh(); })}>
        {pending ? "Saving…" : "Mark unpaid"}
      </button>
    );
  }
  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>{project ? "Record payment" : "Mark paid"}</button>
      {open && (
        <Modal title={`${clientName} · ${project ? "project payment" : "payment"}`} onClose={() => setOpen(false)}>
          <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amt = Number(String(f.get("amount") ?? "").replace(/[$,\s]/g, ""));
            const cover = upfront ? Number(f.get("cover")) || 1 : 1;
            startTransition(async () => {
              const r = await setInvoicePaid(clientId, month, true, Number.isFinite(amt) && amt > 0 ? amt : null, String(f.get("date") ?? ""), cover);
              if (r.error) return setError(r.error);
              setOpen(false);
              router.refresh();
            });
          }}>
            <div className="row top">
              <div className="field"><label htmlFor="pd-date">Date paid</label><input className="input" id="pd-date" name="date" type="date" defaultValue={defaultDate} required />
                <span className="note">It counts toward the month of this date{project ? " only, and shows as paid from then on" : ""}.</span></div>
              <div className="field"><label htmlFor="pd-amt">Amount</label><input className="input" id="pd-amt" name="amount" inputMode="decimal" defaultValue={amount ?? ""} placeholder="2500" /></div>
            </div>
            {!project && (
              <div style={{ display: "grid", gap: 8 }}>
                <label className="row" style={{ alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={upfront} onChange={(e) => setUpfront(e.target.checked)} /> Paid in full upfront
                </label>
                {upfront && (
                  <div className="field" style={{ maxWidth: 260 }}><label htmlFor="pd-cover">How many months it covers</label>
                    <input className="input" id="pd-cover" name="cover" type="number" min={2} max={36} defaultValue={Math.max(2, monthsLeft ?? 6)} />
                    <span className="note">Put the full amount above. It counts in the month of the payment date; the months after show as Covered and add $0.</span></div>
                )}
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Mark paid"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
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
