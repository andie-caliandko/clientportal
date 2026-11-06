"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmtMoney, fmtNum } from "@/lib/ceoTracker";
import { offerLines, optionSummary, type Offer, type Quote, type QuoteLine, type QuoteOption, type Rates } from "@/lib/pricing";
import { newId, Num, SaveNote, Text, type SaveState } from "../tracker/TrackerBits";
import { deleteQuote, saveQuote } from "./actions";

const LABELS = ["Low", "Middle", "High"];

/** Saved quotes, newest first. */
export function QuoteList({ quotes, r, today }: { quotes: (Quote & { updated: string })[]; r: Rates; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const create = () => start(async () => {
    const id = newId();
    const res = await saveQuote({ id, name: "New quote", created: today, options: [{ id: newId(), label: "Option 1", lines: [] }] });
    if (res.error) return setError(res.error);
    router.push(`/team/ceo/pricing?view=quotes&quote=${id}`);
  });
  return (
    <div className="trk">
      <div className="row" style={{ alignItems: "center" }}>
        <button type="button" className="btn sm" onClick={create} disabled={pending}>{pending ? "Starting…" : "New quote"}</button>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      </div>
      {quotes.length ? (
        <div className="trk-cards">
          {quotes.map((q) => (
            <Link key={q.id} href={`/team/ceo/pricing?view=quotes&quote=${q.id}`} className="panel prc-quote-card">
              <h2>{q.name}</h2>
              {q.business && <p className="note">{q.business}</p>}
              <dl className="trk-dl">
                {q.options.map((o) => {
                  const s = optionSummary(o, r);
                  return (
                    <div key={o.id}><dt>{o.label}</dt><dd>
                      {s.monthly.hours > 0 && `${fmtMoney(s.monthly.price)}/mo`}
                      {s.monthly.hours > 0 && s.once.hours > 0 && " + "}
                      {s.once.hours > 0 && `${fmtMoney(s.once.price)} once`}
                      {!s.monthly.hours && !s.once.hours && "—"}
                    </dd></div>
                  );
                })}
              </dl>
              <p className="note">Started {new Date(`${q.created}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</p>
            </Link>
          ))}
        </div>
      ) : <p className="note">No quotes yet. Start one for a prospect and build it from your offers.</p>}
    </div>
  );
}

/** One quote: up to three options, each built from offers and extra lines, with suggested and final prices. */
export function QuoteEditor({ initial, offers, r }: { initial: Quote; offers: Offer[]; r: Rates }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [tab, setTab] = useState(initial.options[0]?.id);
  const [state, setState] = useState<SaveState>("idle");
  const persist = async (next: Quote) => {
    setQ(next);
    setState("saving");
    const res = await saveQuote(next).catch(() => ({ error: "x" }));
    setState(res.error ? "error" : "saved");
  };
  const opt = q.options.find((o) => o.id === tab) ?? q.options[0];
  const editOpt = (patch: Partial<QuoteOption>) => persist({ ...q, options: q.options.map((o) => (o.id === opt.id ? { ...o, ...patch } : o)) });
  const editLine = (id: string, patch: Partial<QuoteLine>) => editOpt({ lines: opt.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addOption = (copy: boolean) => {
    const o: QuoteOption = { id: newId(), label: LABELS[q.options.length] ?? `Option ${q.options.length + 1}`,
      lines: copy ? opt.lines.map((l) => ({ ...l, id: newId() })) : [], monthly: null, oneTime: null };
    persist({ ...q, options: [...q.options, o] });
    setTab(o.id);
  };
  const s = optionSummary(opt, r);
  const groups = [...new Set(opt.lines.map((l) => l.group ?? ""))];

  return (
    <div className="trk">
      <div className="trk-savebar"><SaveNote state={state} /></div>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/team/ceo/pricing?view=quotes" className="note">← All quotes</Link>
        <div className="row">
          <a className="btn sm line" href={`/team/ceo/pricing/quote.pdf?id=${q.id}`} download>Download PDF</a>
          <button type="button" className="btn sm line" onClick={async () => {
            if (!confirm(`Delete the quote for ${q.name}?`)) return;
            const res = await deleteQuote(q.id);
            if (res.error) return setState("error");
            router.push("/team/ceo/pricing?view=quotes");
            router.refresh();
          }}>Delete</button>
        </div>
      </div>

      <section className="panel prc-quote-head">
        <div className="field"><label htmlFor="q-name">Prospect</label><Text id="q-name" label="Prospect" value={q.name} onSave={(name) => persist({ ...q, name: name.trim() || "New quote" })} /></div>
        <div className="field"><label htmlFor="q-biz">Business</label><Text id="q-biz" label="Business" value={q.business} onSave={(business) => persist({ ...q, business })} /></div>
        <div className="field wide"><label htmlFor="q-notes">Notes (just for you)</label><Text id="q-notes" area label="Notes" value={q.notes} onSave={(notes) => persist({ ...q, notes })} /></div>
      </section>

      <div className="row" style={{ alignItems: "center" }}>
        <div className="tabs ceo-tabs" role="tablist" aria-label="Options">
          {q.options.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={o.id === opt.id} onClick={() => setTab(o.id)}>{o.label}</button>
          ))}
        </div>
        {q.options.length < 5 && <>
          <button type="button" className="btn sm line" onClick={() => addOption(true)}>+ Copy this option</button>
          <button type="button" className="btn sm line" onClick={() => addOption(false)}>+ Blank option</button>
        </>}
      </div>

      <div className="prc-builder">
        <section className="panel">
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div className="field" style={{ minWidth: 0 }}>
              <label htmlFor="opt-label">Option name</label>
              <Text key={opt.id} id="opt-label" label="Option name" value={opt.label} onSave={(label) => editOpt({ label: label.trim() || "Option" })} />
            </div>
            {q.options.length > 1 && (
              <button type="button" className="linkbtn note" onClick={() => {
                const rest = q.options.filter((o) => o.id !== opt.id);
                persist({ ...q, options: rest });
                setTab(rest[0].id);
              }}>Remove this option</button>
            )}
          </div>
          <div className="trk-add">
            <label className="sr" htmlFor="add-offer">Add an offer</label>
            <select id="add-offer" className="input" value="" onChange={(e) => {
              const o = offers.find((x) => x.id === e.target.value);
              if (o) editOpt({ lines: [...opt.lines, ...offerLines(o)] });
            }}>
              <option value="">Add an offer…</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.name}{o.price ? ` (${fmtMoney(o.price)}${o.kind === "monthly" ? "/mo" : ""})` : ""}</option>)}
            </select>
            <button type="button" className="btn sm line" onClick={() => editOpt({ lines: [...opt.lines, { id: newId(), label: "New line", hours: 1 }] })}>Add a line</button>
          </div>
          {opt.lines.length ? (
            <div className="tablewrap">
              <table className="prc-table prc-items">
                <thead><tr><th scope="col">What&apos;s included</th><th scope="col">Hours</th><th scope="col">Cost</th><th scope="col">One time</th><th scope="col"><span className="sr">Remove</span></th></tr></thead>
                <tbody>
                  {groups.map((g) => [
                    g ? <tr key={`g-${g}`} className="trk-sub"><th colSpan={5} scope="colgroup">{g}
                      <button type="button" className="linkbtn note" style={{ marginLeft: 10 }} onClick={() => editOpt({ lines: opt.lines.filter((l) => (l.group ?? "") !== g) })}>Remove</button></th></tr> : null,
                    ...opt.lines.filter((l) => (l.group ?? "") === g).map((l) => (
                      <tr key={l.id}>
                        <td><Text label="Line" value={l.label} onSave={(label) => editLine(l.id, { label })} /></td>
                        <td><Num label={`Hours for ${l.label}`} value={l.hours} onSave={(n) => editLine(l.id, { hours: n ?? 0 })} /></td>
                        <td><Num kind="money" label={`Cost for ${l.label}`} value={l.cost} placeholder="0" onSave={(n) => editLine(l.id, { cost: n ?? 0 })} /></td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" aria-label={`${l.label} is one time`} checked={!!l.once} onChange={(e) => editLine(l.id, { once: e.target.checked || undefined })} /></td>
                        <td><button type="button" className="trk-x" aria-label={`Remove ${l.label}`} onClick={() => editOpt({ lines: opt.lines.filter((x) => x.id !== l.id) })}>×</button></td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          ) : <p className="note">Add an offer to start, then change hours or add lines for this prospect.</p>}
        </section>

        <aside className="panel prc-price">
          <h2>Price</h2>
          {(["monthly", "once"] as const).map((k) => {
            const p = s[k];
            if (k === "once" && !p.hours && !p.cost) return null;
            return (
              <dl key={k} className="trk-dl">
                <div className="prc-price-head"><dt>{k === "monthly" ? "Monthly" : "One time"}</dt><dd>{fmtNum(p.hours, 1)} hrs{p.cost ? ` + ${fmtMoney(p.cost)} costs` : ""}</dd></div>
                <div><dt>At your rate</dt><dd>{fmtMoney(p.sheet)}</dd></div>
                <div><dt>At full cost</dt><dd>{fmtMoney(p.full)}</dd></div>
                <div><dt>Suggested</dt><dd>{fmtMoney(p.suggested)}</dd></div>
                <div className="strong"><dt><label htmlFor={`final-${k}`}>Your price</label></dt><dd>
                  <Num key={opt.id + k} id={`final-${k}`} kind="money" label={`${k === "monthly" ? "Monthly" : "One-time"} price`}
                    value={(k === "monthly" ? opt.monthly : opt.oneTime) ?? undefined} placeholder={p.suggested ? String(p.suggested) : ""}
                    onSave={(n) => editOpt(k === "monthly" ? { monthly: n ?? null } : { oneTime: n ?? null })} />
                </dd></div>
                {p.hours > 0 && <div><dt>You earn per hour</dt><dd>{fmtMoney((p.price - p.cost) / p.hours)}/hr</dd></div>}
              </dl>
            );
          })}
          <p className="note">Leave Your price empty to use the suggested price (full cost, rounded up to the next $50). The PDF shows what&apos;s included and the price, never hours or rates.</p>
        </aside>
      </div>
    </div>
  );
}
