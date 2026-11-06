"use client";

import { useState } from "react";
import { fmtMoney, fmtNum } from "@/lib/ceoTracker";
import { offerSummary, type Item, type Offer, type Rates, type Verdict } from "@/lib/pricing";
import { newId, Num, SaveNote, Text, type SaveState } from "../tracker/TrackerBits";
import { saveOffers } from "./actions";

const VERDICT: Record<Verdict, { cls: string; text: string }> = {
  both: { cls: "ok", text: "Covers your rate and full cost" },
  cost: { cls: "warn", text: "Covers costs, below your rate" },
  salary: { cls: "warn", text: "Covers your rate, not full cost" },
  below: { cls: "crit", text: "Below your rate and full cost" },
  custom: { cls: "info", text: "Custom pricing" },
};

export function OffersView({ initial, r }: { initial: Offer[]; r: Rates }) {
  const [list, setList] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const persist = async (next: Offer[]) => {
    setList(next);
    setState("saving");
    const res = await saveOffers(next).catch(() => ({ error: "x" }));
    setState(res.error ? "error" : "saved");
  };
  const edit = (id: string, patch: Partial<Offer>) => persist(list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const editItem = (o: Offer, itemId: string, patch: Partial<Item>) => edit(o.id, { items: o.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  const move = (i: number, by: number) => {
    const next = [...list];
    const [o] = next.splice(i, 1);
    next.splice(i + by, 0, o);
    persist(next);
  };

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>
      <p className="note">
        Each offer&apos;s tasks and the hours they take each month. Prices at your rate ({fmtMoney(r.sheetRate)}/hr) and the full-cost rate
        ({fmtMoney(r.fullRate)}/hr) update as you change hours. Costs are money you spend on it, like a photographer.
      </p>
      {list.map((o, idx) => {
        const s = offerSummary(o, r);
        const v = VERDICT[s.verdict];
        return (
          <section key={o.id} className="panel prc-offer" aria-label={o.name}>
            <div className="prc-offer-head">
              <div className="prc-offer-name">
                <Text label="Offer name" value={o.name} onSave={(name) => edit(o.id, { name: name.trim() || "Untitled offer" })} />
                <select className="input" aria-label="Billed" value={o.kind} onChange={(e) => edit(o.id, { kind: e.target.value as Offer["kind"] })}>
                  <option value="monthly">Monthly</option>
                  <option value="one_time">One time</option>
                </select>
              </div>
              <div className="row" style={{ alignItems: "center" }}>
                <span className={`pill ${v.cls}`}>{v.text}</span>
                <button type="button" className="trk-x" aria-label={`Move ${o.name} up`} disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
                <button type="button" className="trk-x" aria-label={`Move ${o.name} down`} disabled={idx === list.length - 1} onClick={() => move(idx, 1)}>↓</button>
                <button type="button" className="trk-x" aria-label={`Remove ${o.name}`}
                  onClick={() => confirm(`Remove ${o.name} from your offer suite?`) && persist(list.filter((x) => x.id !== o.id))}>×</button>
              </div>
            </div>

            <div className="prc-offer-body">
              <div className="tablewrap">
                <table className="prc-table prc-items">
                  <thead><tr><th scope="col">Task</th><th scope="col">Hours{o.kind === "monthly" ? " / mo" : ""}</th><th scope="col">Cost</th><th scope="col"><span className="sr">Remove</span></th></tr></thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td><Text label="Task" value={i.label} onSave={(label) => editItem(o, i.id, { label })} /></td>
                        <td><Num label={`Hours for ${i.label}`} value={i.hours} onSave={(n) => editItem(o, i.id, { hours: n ?? 0 })} /></td>
                        <td><Num kind="money" label={`Cost for ${i.label}`} value={i.cost} placeholder="0" onSave={(n) => editItem(o, i.id, { cost: n ?? 0 })} /></td>
                        <td><button type="button" className="trk-x" aria-label={`Remove ${i.label}`} onClick={() => edit(o.id, { items: o.items.filter((x) => x.id !== i.id) })}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="linkbtn" onClick={() => edit(o.id, { items: [...o.items, { id: newId(), label: "New task", hours: 1 }] })}>+ Add a task</button>
            </div>

            <dl className="trk-dl prc-sum">
              <div><dt><label htmlFor={`price-${o.id}`}>You charge{o.kind === "monthly" ? " / month" : ""}</label></dt>
                <dd><Num id={`price-${o.id}`} kind="money" label={`Price of ${o.name}`} value={o.price ?? undefined} placeholder="Custom"
                  onSave={(n) => edit(o.id, { price: n ?? null })} /></dd></div>
              <div><dt>Hours</dt><dd>{fmtNum(s.hours, 1)}</dd></div>
              {s.cost > 0 && <div><dt>Costs</dt><dd>{fmtMoney(s.cost)}</dd></div>}
              <div><dt>At your rate</dt><dd>{fmtMoney(s.sheetPrice)}</dd></div>
              <div><dt>At full cost</dt><dd>{fmtMoney(s.fullPrice)}</dd></div>
              <div className="strong"><dt>You earn per hour</dt><dd>{s.effectiveRate === null ? "—" : `${fmtMoney(s.effectiveRate)}/hr`}</dd></div>
            </dl>
            {o.note !== undefined && <Text label="Notes" area value={o.note} onSave={(note) => edit(o.id, { note })} />}
          </section>
        );
      })}
      <div className="row">
        <button type="button" className="btn sm" onClick={() => persist([...list, { id: newId(), name: "New offer", kind: "monthly", price: null, note: "", items: [{ id: newId(), label: "Strategy", hours: 2 }] }])}>Add an offer</button>
      </div>
    </div>
  );
}
