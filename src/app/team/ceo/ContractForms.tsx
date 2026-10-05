"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/app/Modal";
import { endContract, renewContract, saveContract } from "./actions";

type Contract = { id: string; kind: string | null; start_date: string; months: number | null; end_date: string | null; note: string | null };

function TermFields({ kind, setKind, months, end, startLabel }: { kind: string; setKind: (k: string) => void; months?: number | null; end?: string | null; startLabel?: string }) {
  return (
    <>
      <fieldset className="daypick">
        <legend className="note">Type</legend>
        <label><input type="radio" name="kind" value="retainer" checked={kind === "retainer"} onChange={() => setKind("retainer")} /> Retainer (monthly)</label>
        <label><input type="radio" name="kind" value="project" checked={kind === "project"} onChange={() => setKind("project")} /> One-time project</label>
        <label><input type="radio" name="kind" value="ongoing" checked={kind === "ongoing"} onChange={() => setKind("ongoing")} /> Ongoing (no set end)</label>
      </fieldset>
      {kind === "ongoing" ? (
        <p className="note" style={{ margin: 0 }}>Month to month with no end date, so there&apos;s no renewal reminder. Switch it to a retainer any time to set a term.</p>
      ) : kind === "retainer" ? (
        <div className="field"><label htmlFor="ct-months">Length</label>
          <select className="sel" id="ct-months" name="months" defaultValue={String(months ?? 6)}>
            {[1, 2, 3, 4, 6, 9, 12, 18, 24].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
          </select>
          <span className="note">You&apos;ll be reminded to talk renewal at the start of the second-to-last month{startLabel ? `, counting from ${startLabel}` : ""}.</span></div>
      ) : (
        <div className="field"><label htmlFor="ct-end">Wraps up on</label><input className="input" id="ct-end" name="end" type="date" defaultValue={end ?? ""} required />
          <span className="note">You&apos;ll get a follow-up task two weeks before. Its fee isn&apos;t counted in monthly recurring revenue.</span></div>
      )}
    </>
  );
}

/** Set or correct a client's contract. */
export function SetContract({ clientId, clientName, contract, clientStart }: { clientId: string; clientName: string; contract?: Contract | null; clientStart?: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(contract?.kind ?? "retainer");
  const [state, action, pending] = useActionState(saveContract, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" className={contract ? "linkbtn note" : "btn sm line"} onClick={() => setOpen(true)}>{contract ? "Edit" : "Set contract"}</button>
      {open && (
        <Modal title={`${clientName} · contract`} onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="client" value={clientId} />
            {contract && <input type="hidden" name="id" value={contract.id} />}
            <div className="field"><label htmlFor="ct-start">Started</label><input className="input" id="ct-start" name="start" type="date" defaultValue={contract?.start_date ?? clientStart ?? new Intl.DateTimeFormat("en-CA").format(new Date())} required />
              {!contract && clientStart && <span className="note">From the start date on their client page.</span>}</div>
            <TermFields kind={kind} setKind={setKind} months={contract?.months} end={contract?.end_date} />
            <div className="field"><label htmlFor="ct-note">Notes (optional)</label><input className="input" id="ct-note" name="note" defaultValue={contract?.note ?? ""} placeholder="Includes 2 shoots a month" /></div>
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

/** Renew (the next term starts the day after this one ends) or mark it not renewing. */
export function RenewContract({ clientName, contract, nextStartLabel }: { clientName: string; contract: Contract; nextStartLabel: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(contract.kind ?? "retainer");
  const [state, action, pending] = useActionState(renewContract, {});
  const [ending, startEnding] = useTransition();
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>Renew</button>
      {open && (
        <Modal title={`Renew ${clientName}`} onClose={() => setOpen(false)}>
          <form action={action} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="id" value={contract.id} />
            <p className="note" style={{ margin: 0 }}>The new term starts {nextStartLabel}, the day after this one ends.</p>
            <TermFields kind={kind} setKind={setKind} months={contract.months} startLabel={nextStartLabel} />
            <div className="field"><label htmlFor="rn-note">Notes (optional)</label><input className="input" id="rn-note" name="note" placeholder="Raised to $3,000 a month" /></div>
            {state.error && <p className="error">{state.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Renew"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
              {armed ? (
                <button type="button" className="btn sm warm" style={{ marginLeft: "auto" }} disabled={ending}
                  onClick={() => startEnding(async () => { await endContract(contract.id); setOpen(false); })}>{ending ? "Saving…" : "Yes, not renewing"}</button>
              ) : (
                <button type="button" className="btn sm line" style={{ marginLeft: "auto" }} onClick={() => setArmed(true)}>Not renewing</button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
