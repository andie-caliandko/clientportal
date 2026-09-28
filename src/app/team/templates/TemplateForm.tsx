"use client";

import { Modal } from "@/app/Modal";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { addTemplate } from "../actions";

/** Admins: add a link (Google Doc, Canva, Figma…) and/or a file for the team to use. */
export function TemplateForm({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  const trigger = (
    <div className="row" style={{ alignItems: "center" }}>
      <button className="btn sm" onClick={() => { setMsg({}); setOpen(true); }}>Add template</button>
      {msg.ok && <p className="flash" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
    </div>
  );
  return (
    <>
      {trigger}
      {open && (
        <Modal title="New template" onClose={() => setOpen(false)}>
          <form className="panel" onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const file = data.get("file");
            startTransition(async () => {
              let filePath: string | null = null;
              let fileName: string | null = null;
              if (file instanceof File && file.size) {
                fileName = file.name;
                filePath = `${agencyId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
                const { error } = await createClient().storage.from("templates").upload(filePath, file, { contentType: file.type || undefined });
                if (error) return setMsg({ error: "The file didn't upload. Try again." });
              }
              const res = await addTemplate({
                title: String(data.get("title") ?? ""), description: String(data.get("description") ?? ""),
                url: String(data.get("url") ?? ""), filePath, fileName,
                visibleTo: data.getAll("visible").map(String),
              });
              setMsg(res);
              if (res.ok) setOpen(false);
            });
          }}>
            <h2>New template</h2>
            <div className="field"><label htmlFor="tp-title">Name</label><input className="input" id="tp-title" name="title" placeholder="Monthly analytics report" required /></div>
            <div className="field"><label htmlFor="tp-desc">When to use it (optional)</label><textarea className="input" id="tp-desc" name="description" style={{ minHeight: 60 }} placeholder="Duplicate this at the end of each month for every client." /></div>
            <div className="field"><label htmlFor="tp-url">Link</label><input className="input" id="tp-url" name="url" type="url" placeholder="https://docs.google.com/… or a Canva, Figma or Loom link" /></div>
            <div className="field"><label htmlFor="tp-file">Or upload a file</label><input className="input" id="tp-file" name="file" type="file" /></div>
            <fieldset className="daypick">
        <legend className="note">Who can see it</legend>
        <label><input type="checkbox" checked disabled /> Admins</label>
        <label><input type="checkbox" name="visible" value="account_manager" defaultChecked /> Account managers</label>
        <label><input type="checkbox" name="visible" value="creator" defaultChecked /> Creators</label>
      </fieldset>
      <p className="note">Admins always see every template. Untick the others for things like proposals that are admin-only.</p>
      <p className="note">Google Docs, Sheets, Slides and Drive files, Canva, Figma, Loom and YouTube links show right on the page. For Google files, set sharing to anyone at {agencyName} with the link.</p>
            {msg.error && <p className="error">{msg.error}</p>}
            <div className="row">
              <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save template"}</button>
              <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
