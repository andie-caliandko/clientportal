"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { addBrief } from "../actions";

/** Add a project brief (Google Doc link and/or a file). Internal only. */
export function BriefForm({ agencyId, clientId }: { agencyId: string; clientId: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn sm" onClick={() => { setMsg({}); setOpen(true); }}>Add a brief</button>
        {msg.ok && <p className="flash" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
      </div>
    );
  }
  return (
    <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const file = data.get("file");
      startTransition(async () => {
        let filePath: string | null = null;
        let fileName: string | null = null;
        if (file instanceof File && file.size) {
          fileName = file.name;
          filePath = `${agencyId}/${clientId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
          const { error } = await createClient().storage.from("briefs").upload(filePath, file, { contentType: file.type || undefined });
          if (error) return setMsg({ error: "The file didn't upload. Try again." });
        }
        const res = await addBrief({
          clientId, title: String(data.get("title") ?? ""), notes: String(data.get("notes") ?? ""),
          url: String(data.get("url") ?? ""), filePath, fileName,
        });
        setMsg(res);
        if (res.ok) setOpen(false);
      });
    }}>
      <div className="field"><label htmlFor="br-title">Name</label><input className="input" id="br-title" name="title" placeholder="October campaign brief" required /></div>
      <div className="field"><label htmlFor="br-url">Link</label><input className="input" id="br-url" name="url" type="url" placeholder="https://docs.google.com/…" /></div>
      <div className="field"><label htmlFor="br-file">Or upload a file</label><input className="input" id="br-file" name="file" type="file" /></div>
      <div className="field"><label htmlFor="br-notes">Notes (optional)</label><textarea className="input" id="br-notes" name="notes" style={{ minHeight: 60 }} /></div>
      {msg.error && <p className="error">{msg.error}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save brief"}</button>
        <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
