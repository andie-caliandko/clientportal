"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/app/Modal";
import { ACTION_CLASS, ENGAGEMENT_ACTIONS } from "@/lib/engagement";
import { saveEngagement } from "./actions";

export type EngagementEntry = { actions: string[]; links: string[]; note: string | null; logged_by?: string | null };
type Person = { user_id: string; display_name: string };

/** One account on one day: shows what was done; click to log or change it. */
export function EngagementCell({ clientId, clientName, day, dayLabel, entry, canEdit, team, managerId }: {
  clientId: string;
  clientName: string;
  day: string;
  dayLabel: string;
  entry: EngagementEntry | null;
  canEdit: boolean;
  /** Everyone on this account, account manager first. */
  team: Person[];
  managerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveEngagement, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);
  const has = !!entry && (entry.actions.length > 0 || entry.links.length > 0 || !!entry.note);
  const byId = entry?.logged_by && team.some((p) => p.user_id === entry.logged_by) ? entry.logged_by : managerId ?? team[0]?.user_id ?? "";
  const byName = team.find((p) => p.user_id === byId)?.display_name;

  return (
    <>
      <button type="button" className={`eg-cell ${has ? "" : "empty"}`} onClick={() => setOpen(true)}
        aria-label={`${clientName}, ${dayLabel}${has ? `: ${entry!.actions.join(", ")}` : ", nothing logged"}`}>
        {entry?.actions.map((a) => <span key={a} className={`eg-tag ${ACTION_CLASS[a] ?? ""}`}>{a}</span>)}
        {!!entry?.links.length && <span className="eg-links">{entry.links.length} link{entry.links.length === 1 ? "" : "s"}</span>}
        {!!entry?.note && !entry.actions.length && <span className="eg-links">Note</span>}
        {has && team.length > 1 && byName && <span className="eg-by" title={`Completed by ${byName}`}>{byName.split(" ")[0]}</span>}
        {!has && canEdit && <span className="eg-add" aria-hidden="true">+</span>}
      </button>
      {open && (
        <Modal title={`${clientName} · ${dayLabel}`} onClose={() => setOpen(false)}>
          {canEdit ? (
            <form action={action} style={{ display: "grid", gap: 14 }}>
              <input type="hidden" name="client" value={clientId} />
              <input type="hidden" name="day" value={day} />
              <fieldset className="eg-pick">
                <legend className="note">What did you do?</legend>
                {ENGAGEMENT_ACTIONS.map((a) => (
                  <label key={a} className={`eg-tag ${ACTION_CLASS[a]}`}>
                    <input type="checkbox" name="action" value={a} defaultChecked={entry?.actions.includes(a)} /> {a}
                  </label>
                ))}
              </fieldset>
              <div className="field"><label htmlFor="eg-links">Links to where you engaged</label>
                <textarea className="input" id="eg-links" name="links" style={{ minHeight: 90 }} defaultValue={entry?.links.join("\n") ?? ""}
                  placeholder={"One per line\nhttps://instagram.com/p/…"} /></div>
              <div className="field"><label htmlFor="eg-note">Note (optional)</label>
                <textarea className="input" id="eg-note" name="note" style={{ minHeight: 60 }} defaultValue={entry?.note ?? ""} placeholder="Engaged with 5 local accounts after the event" /></div>
              <div className="field eg-byfield">
                <label htmlFor="eg-by">Completed by</label>
                {team.length > 1 ? (
                  <select className="sel" id="eg-by" name="by" defaultValue={byId}>
                    {team.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}{p.user_id === managerId ? " (account manager)" : ""}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="by" value={byId} />
                    <p className="eg-by-fixed">{byName ?? "The account manager"}</p>
                  </>
                )}
              </div>
              <p className="note">Untick everything and clear the boxes to remove this day.</p>
              {state.error && <p className="error">{state.error}</p>}
              <div className="row">
                <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
                <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {has ? (
                <>
                  <div className="eg-pick">{entry!.actions.map((a) => <span key={a} className={`eg-tag ${ACTION_CLASS[a] ?? ""}`}>{a}</span>)}</div>
                  {entry!.links.length > 0 && <ul className="list">{entry!.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer">{l}</a></li>)}</ul>}
                  {entry!.note && <p>{entry!.note}</p>}
                  {byName && <p className="note">Completed by {byName}</p>}
                </>
              ) : <p className="note">Nothing logged this day.</p>}
            </div>
          )}
          {canEdit && has && entry!.links.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <p className="note">Saved links</p>
              <ul className="list">{entry!.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{l}</a></li>)}</ul>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
