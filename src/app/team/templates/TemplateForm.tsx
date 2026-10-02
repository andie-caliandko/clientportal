"use client";

import { Modal } from "@/app/Modal";
import { useActionState, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { addTemplate, setSopFolder } from "../actions";

/** Admins: add a link (Google Doc, Canva, Figma…) and/or a file for the team to use. */
export function TemplateForm({ agencyId, agencyName, section = "templates" }: { agencyId: string; agencyName: string; section?: "templates" | "sops" }) {
  const sop = section === "sops";
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  const trigger = (
    <div className="row" style={{ alignItems: "center" }}>
      <button className="btn sm" onClick={() => { setMsg({}); setOpen(true); }}>{sop ? "Add SOP" : "Add template"}</button>
      {msg.ok && <p className="flash" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
    </div>
  );
  return (
    <>
      {trigger}
      {open && (
        <Modal title={sop ? "New SOP" : "New template"} onClose={() => setOpen(false)}>
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
                section,
              });
              setMsg(res);
              if (res.ok) setOpen(false);
            });
          }}>
            <h2>New template</h2>
            <div className="field"><label htmlFor="tp-title">Name</label><input className="input" id="tp-title" name="title" placeholder={sop ? "Posting a reel in Rella" : "Monthly analytics report"} required /></div>
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
      <p className="note">Google Docs, Sheets, Slides, Drive files and folders, Canva, Figma, Loom and YouTube links show right on the page. For Google files and folders, set sharing to anyone at {agencyName} with the link.</p>
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

/** Admins: the Google Drive folder that holds every SOP. */
export function SopFolderForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(setSopFolder, {});
  return (
    <form action={action} className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ flex: 1, minWidth: "min(100%, 320px)" }}>
        <label htmlFor="sop-folder">{current ? "SOPs folder" : "Add your Google Drive SOPs folder"}</label>
        <input className="input" id="sop-folder" name="folder" defaultValue={current ?? ""} placeholder="https://drive.google.com/drive/folders/…" />
      </div>
      <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state.error && <p className="error" style={{ flexBasis: "100%" }}>{state.error}</p>}
      {state.ok && <p className="flash" style={{ flexBasis: "100%" }}>{state.ok}</p>}
    </form>
  );
}
