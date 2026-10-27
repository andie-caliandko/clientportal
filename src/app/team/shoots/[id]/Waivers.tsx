"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { Model } from "@/lib/shootPlan";
import { addShootWaiver, removeShootWaiver } from "../actions";

export type Waiver = { id: string; model_id: string | null; file_name: string; url: string | null };

/** Signed model waivers for this shoot. Team only: these never go to the client. */
export function Waivers({ shootId, clientId, agencyId, models, waivers, onAdded }: {
  shootId: string; clientId: string; agencyId: string; models: Model[]; waivers: Waiver[]; onAdded: (modelId: string) => void;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [modelId, setModelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const upload = (f: File) => start(async () => {
    setError(null);
    const path = `${agencyId}/${clientId}/${shootId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: upErr } = await createClient().storage.from("waivers").upload(path, f, { contentType: f.type || undefined });
    if (upErr) return setError("That file couldn't be uploaded. Try again.");
    const r = await addShootWaiver(shootId, modelId, path, f.name);
    if (r.error) return setError(r.error);
    if (file.current) file.current.value = "";
    if (modelId) onAdded(modelId);
    router.refresh();
  });
  const name = (id: string | null) => models.find((m) => m.id === id)?.name ?? "Not matched to a model";
  return (
    <div className="plan-waivers">
      <h3>Signed waivers</h3>
      <p className="note">Only your team can see these. Uploading one for a model marks their waiver as signed.</p>
      {waivers.length > 0 && (
        <ul className="list">
          {waivers.map((w) => (
            <li key={w.id}>
              <span><b>{name(w.model_id)}</b> <span className="note">· {w.file_name}</span></span>
              <span className="r">
                {w.url && <a className="linkbtn" href={w.url} target="_blank" rel="noreferrer">Open</a>}
                <button type="button" className="linkbtn note" disabled={pending} onClick={() => start(async () => { await removeShootWaiver(w.id); router.refresh(); })}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="waiver-model" className="sr-only">Model</label>
        <select className="sel" id="waiver-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="">Which model?</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label htmlFor="waiver-file" className="sr-only">Waiver file</label>
        <input ref={file} id="waiver-file" type="file" accept=".pdf,image/*" disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {pending && <span className="note">Uploading…</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
