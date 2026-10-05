"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { readRevenueCsv, type RevenueRow } from "@/lib/csv";
import { importRevenue, removeRevenueBatch } from "./actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Upload a CSV of past revenue, check the preview, then save it. */
export function ImportRevenue({ clients, loggedKeys }: { clients: { id: string; name: string }[]; loggedKeys: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; rows: RevenueRow[]; skipped: number } | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  const byName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const logged = new Set(loggedKeys);
  const dup = (r: RevenueRow) => {
    const id = r.client_name ? byName.get(r.client_name.trim().toLowerCase()) : undefined;
    return !!id && logged.has(`${id}|${r.paid_on.slice(0, 7)}`);
  };
  const keep = file ? file.rows.filter((r) => !dup(r)) : [];
  const total = keep.reduce((n, r) => n + r.amount, 0);
  return (
    <>
      <div className="row" style={{ alignItems: "center" }}>
        <button type="button" className="btn sm line" onClick={() => { setFile(null); setMsg({}); setOpen(true); }}>Import past revenue (CSV)</button>
        {msg.ok && <span className="flash" style={{ margin: 0 }}>{msg.ok}</span>}
      </div>
      {open && (
        <Modal title="Import past revenue" onClose={() => setOpen(false)} wide>
          <div style={{ display: "grid", gap: 12 }}>
            <p className="note" style={{ margin: 0 }}>
              A CSV with a <b>date</b> and an <b>amount</b> on each line, plus the <b>client</b> and a <b>note</b> if you have them. From Excel or Google Sheets, use File → Download (or Save as) → CSV.
              Lines for a client and month already marked paid in the portal are left out, so nothing is counted twice.
            </p>
            <div className="field"><label htmlFor="rv-file">CSV file</label>
              <input className="input" id="rv-file" type="file" accept=".csv,text/csv" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const parsed = readRevenueCsv(await f.text());
                setFile({ name: f.name.replace(/\.csv$/i, ""), ...parsed });
                setMsg(parsed.rows.length ? {} : { error: "No lines with a date and an amount were found. Check the file has those columns." });
              }} /></div>
            {file && file.rows.length > 0 && (
              <>
                <p style={{ margin: 0 }}><b>{keep.length} line{keep.length === 1 ? "" : "s"} · {money(total)}</b>
                  <span className="note">{file.rows.length - keep.length ? ` · ${file.rows.length - keep.length} already logged, left out` : ""}{file.skipped ? ` · ${file.skipped} without a date or amount, skipped` : ""}</span></p>
                <div className="tablewrap" style={{ maxHeight: 300, overflowY: "auto" }}>
                  <table>
                    <thead><tr><th scope="col">Date</th><th scope="col">Client</th><th scope="col">Note</th><th scope="col" className="kn">Amount</th></tr></thead>
                    <tbody>
                      {file.rows.slice(0, 300).map((r, i) => (
                        <tr key={i} className={dup(r) ? "rv-dup" : ""}>
                          <td className="kn">{r.paid_on}</td>
                          <td>{r.client_name ?? <span className="note">—</span>}{dup(r) && <span className="note"> · already logged</span>}</td>
                          <td style={{ whiteSpace: "normal" }}>{r.note ?? ""}</td>
                          <td className="kn">{money(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {file.rows.length > 300 && <p className="note">Showing the first 300 of {file.rows.length} lines.</p>}
              </>
            )}
            {msg.error && <p className="error">{msg.error}</p>}
            <div className="row">
              <button type="button" className="btn sm" disabled={pending || !keep.length} onClick={() => startTransition(async () => {
                const r = await importRevenue(file!.name, keep);
                if (r.error) return setMsg(r);
                setMsg(r);
                setOpen(false);
                router.refresh();
              })}>{pending ? "Importing…" : keep.length ? `Import ${keep.length} line${keep.length === 1 ? "" : "s"}` : "Import"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function RemoveBatch({ batchId, name }: { batchId: string; name: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return armed ? (
    <button type="button" className="btn sm warm" disabled={pending} onClick={() => startTransition(async () => { await removeRevenueBatch(batchId); router.refresh(); })}>
      {pending ? "Removing…" : `Remove "${name}"?`}
    </button>
  ) : <button type="button" className="linkbtn note" onClick={() => setArmed(true)}>Remove</button>;
}
