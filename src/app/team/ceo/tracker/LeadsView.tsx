"use client";

import { useState } from "react";
import { CLOSED_STATUSES, LEAD_STATUSES } from "@/lib/ceoTracker";
import { addLead, deleteLead, updateLead, type LeadInput } from "./actions";
import { SaveNote, Text, type SaveState } from "./TrackerBits";

export type Lead = {
  id: string; name: string; business: string; first_contact: string | null; last_contact: string | null; next_contact: string | null;
  temperature: "hot" | "warm" | "cold"; source: string; status: string; notes: string;
};

const SOURCES = ["Instagram", "Referral", "In person", "Website", "Indeed", "Upwork", "Email", "LinkedIn", "Facebook"];
const nice = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "");

export function LeadsView({ initial, today }: { initial: Lead[]; today: string }) {
  const [leads, setLeads] = useState(initial);
  const [filter, setFilter] = useState<"open" | "due" | "signed" | "all">("open");
  const [state, setState] = useState<SaveState>("idle");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const isOpen = (l: Lead) => !CLOSED_STATUSES.includes(l.status);
  const isDue = (l: Lead) => isOpen(l) && !!l.next_contact && l.next_contact <= today;
  const shown = leads
    .filter((l) => filter === "all" || (filter === "open" && isOpen(l)) || (filter === "due" && isDue(l)) || (filter === "signed" && l.status === "Signed"))
    .sort((a, b) => (a.next_contact ?? "9999").localeCompare(b.next_contact ?? "9999") || a.name.localeCompare(b.name));
  const counts = {
    open: leads.filter(isOpen).length, due: leads.filter(isDue).length, signed: leads.filter((l) => l.status === "Signed").length, all: leads.length,
    hot: leads.filter((l) => isOpen(l) && l.temperature === "hot").length,
  };

  const change = async (id: string, patch: LeadInput) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } as Lead : l)));
    setState("saving");
    const r = await updateLead(id, patch).catch(() => ({ error: "x" }));
    setState("error" in r && r.error ? "error" : "saved");
  };

  const add = async (form: FormData) => {
    setError("");
    const input: LeadInput = {
      name: String(form.get("name") ?? ""), business: String(form.get("business") ?? ""), source: String(form.get("source") ?? ""),
      temperature: String(form.get("temperature") ?? "warm"), status: "New", first_contact: String(form.get("first") || today),
      last_contact: String(form.get("first") || today), next_contact: String(form.get("next") ?? "") || null, notes: String(form.get("notes") ?? ""),
    };
    const r = await addLead(input);
    if (r.error || !r.id) return setError(r.error ?? "That lead couldn't be added.");
    setLeads((ls) => [{ id: r.id!, name: input.name ?? "", business: input.business ?? "", first_contact: input.first_contact ?? null, last_contact: input.last_contact ?? null,
      next_contact: input.next_contact ?? null, temperature: input.temperature as Lead["temperature"], source: input.source ?? "", status: "New", notes: input.notes ?? "" }, ...ls]);
    setAdding(false);
    setFilter("open");
  };

  return (
    <div className="trk">
      <section className="stats">
        <div className="stat"><b>{counts.open}</b><span>Open leads</span></div>
        <div className="stat"><b>{counts.hot}</b><span>Hot right now</span></div>
        <div className={`stat ${counts.due ? "warn" : ""}`}><b>{counts.due}</b><span>Follow-ups due</span></div>
        <div className="stat"><b>{counts.signed}</b><span>Signed</span></div>
      </section>

      <section className="panel">
        <div className="trk-head row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="tabs" role="tablist" aria-label="Show leads" style={{ marginBottom: 0 }}>
            {(["open", "due", "signed", "all"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {{ open: "Open", due: "Follow up now", signed: "Signed", all: "All" }[f]} <span className="tab-count">{counts[f]}</span>
              </button>
            ))}
          </div>
          <span className="row" style={{ alignItems: "center" }}><SaveNote state={state} /><button type="button" className="btn sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add a lead"}</button></span>
        </div>

        {adding && (
          <form action={add} className="trk-leadform">
            <div className="field"><label htmlFor="ld-name">Name</label><input className="input" id="ld-name" name="name" autoFocus /></div>
            <div className="field"><label htmlFor="ld-biz">Business</label><input className="input" id="ld-biz" name="business" /></div>
            <div className="field"><label htmlFor="ld-src">Where you connected</label><input className="input" id="ld-src" name="source" list="lead-sources" /></div>
            <div className="field"><label htmlFor="ld-temp">Type of lead</label>
              <select className="input" id="ld-temp" name="temperature" defaultValue="warm"><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></div>
            <div className="field"><label htmlFor="ld-first">First contact</label><input className="input" type="date" id="ld-first" name="first" defaultValue={today} /></div>
            <div className="field"><label htmlFor="ld-next">Next contact</label><input className="input" type="date" id="ld-next" name="next" /></div>
            <div className="field wide"><label htmlFor="ld-notes">Notes</label><input className="input" id="ld-notes" name="notes" /></div>
            <div className="row wide">{error && <p className="error">{error}</p>}<button className="btn sm">Add lead</button></div>
          </form>
        )}
        <datalist id="lead-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>

        {shown.length ? (
          <div className="tablewrap">
            <table className="trk-leads">
              <thead><tr><th scope="col">Lead</th><th scope="col">Type</th><th scope="col">Where</th><th scope="col">Status</th><th scope="col">First contact</th><th scope="col">Last contact</th><th scope="col">Next contact</th><th scope="col">Notes</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className={isDue(l) ? "due" : ""}>
                    <td className="trk-leadname"><Text label="Name" value={l.name} onSave={(v) => change(l.id, { name: v })} /><Text label="Business" value={l.business} placeholder="Business" onSave={(v) => change(l.id, { business: v })} /></td>
                    <td><select className={`input trk-temp ${l.temperature}`} aria-label="Type of lead" value={l.temperature} onChange={(e) => change(l.id, { temperature: e.target.value })}>
                      <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></td>
                    <td><Text label="Where you connected" value={l.source} onSave={(v) => change(l.id, { source: v })} /></td>
                    <td><select className="input" aria-label="Status" value={l.status} onChange={(e) => change(l.id, { status: e.target.value, last_contact: today })}>
                      {[...new Set([...LEAD_STATUSES, l.status])].map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td><input className="input" type="date" aria-label="First contact" value={l.first_contact ?? ""} onChange={(e) => change(l.id, { first_contact: e.target.value || null })} /></td>
                    <td><input className="input" type="date" aria-label="Last contact" value={l.last_contact ?? ""} onChange={(e) => change(l.id, { last_contact: e.target.value || null })} /></td>
                    <td>
                      <input className="input" type="date" aria-label="Next contact" value={l.next_contact ?? ""} onChange={(e) => change(l.id, { next_contact: e.target.value || null })} />
                      {isDue(l) && <span className="pill warn">{l.next_contact === today ? "Today" : `Since ${nice(l.next_contact)}`}</span>}
                    </td>
                    <td className="trk-notes"><Text area label="Notes" value={l.notes} onSave={(v) => change(l.id, { notes: v })} /></td>
                    <td><button type="button" className="trk-x" aria-label={`Remove ${l.name || l.business}`} onClick={async () => {
                      if (!confirm(`Remove ${l.name || l.business} from your leads?`)) return;
                      const r = await deleteLead(l.id);
                      if (!r.error) setLeads((ls) => ls.filter((x) => x.id !== l.id));
                    }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note">{filter === "due" ? "No follow-ups due. Nice." : "No leads here yet."}</p>
        )}
      </section>
    </div>
  );
}
