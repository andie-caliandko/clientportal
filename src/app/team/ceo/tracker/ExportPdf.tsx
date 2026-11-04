"use client";

import { useState } from "react";
import { Modal } from "@/app/Modal";
import { monthName } from "@/lib/ceoTracker";

/** Pick any months (one, a few, or a whole year) and download them as one PDF. */
export function ExportPdf({ current, years }: { current: string; years: string[] }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(current.slice(0, 4));
  const [picked, setPicked] = useState<Set<string>>(new Set([current]));
  const [overview, setOverview] = useState(true);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const toggle = (m: string) => setPicked((p) => { const n = new Set(p); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  const list = [...picked].sort();
  const href = `/team/ceo/tracker/report.pdf?months=${list.join(",")}${overview && list.length > 1 ? "&overview=1" : ""}`;

  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>Export PDF</button>
      {open && (
        <Modal title="Export PDF" onClose={() => setOpen(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div className="tabs" style={{ marginBottom: 0 }} role="tablist" aria-label="Year">
                {years.map((y) => <button key={y} type="button" role="tab" aria-selected={y === year} onClick={() => setYear(y)}>{y}</button>)}
              </div>
              <span className="row">
                <button type="button" className="linkish" onClick={() => setPicked((p) => new Set([...p, ...months]))}>All of {year}</button>
                <button type="button" className="linkish" onClick={() => setPicked(new Set())}>Clear</button>
              </span>
            </div>
            <div className="trk-pick">
              {months.map((m) => (
                <label key={m} className={picked.has(m) ? "on" : ""}>
                  <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                  {monthName(m, "short").split(" ")[0]}
                </label>
              ))}
            </div>
            {list.length > 1 && (
              <label className="row" style={{ alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} />
                Start with a summary page comparing these months
              </label>
            )}
            <p className="note">{list.length ? `${list.length} month${list.length > 1 ? "s" : ""}: ${list.map((m) => monthName(m, "short")).join(", ")}` : "Pick at least one month."}</p>
            <div className="row">
              {list.length
                ? <a className="btn sm" href={href} onClick={() => setOpen(false)}>Download PDF</a>
                : <button type="button" className="btn sm" disabled>Download PDF</button>}
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
