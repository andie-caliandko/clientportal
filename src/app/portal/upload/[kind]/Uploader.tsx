"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { uploadResumable } from "@/lib/resumableUpload";
import type { Brand } from "@/lib/types";
import { finishUploads } from "../../actions";

type Item = { key: string; name: string; path?: string; state: "uploading" | "done" | "failed"; progress: number; error?: string; note: string; preview?: string };

export function Uploader({ kind, title, help, folder, brand, agencyName, driveUrl }: {
  kind: "branding" | "content";
  title: string;
  help: string;
  folder: string;
  brand: Brand;
  agencyName: string;
  /** Their own Google Drive folder, when the team has shared it with them. */
  driveUrl?: string | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, p: Partial<Item>) => setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...p } : it)));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).map((file, n) => ({
      file,
      key: `${Date.now()}-${n}-${file.name}`,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setItems((cur) => [...cur, ...list.map(({ file, key, preview }) => ({ key, name: file.name, state: "uploading" as const, progress: 0, note: "", preview }))]);
    // Two at a time; each big file goes up in pieces and can recover from a dropped connection.
    const queue = [...list];
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { file, key } = next;
        const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const error = await uploadResumable("uploads", path, file, { onProgress: (f) => update(key, { progress: f }) });
        update(key, error ? { state: "failed", error } : { state: "done", path, progress: 1 });
      }
    }));
    if (input.current) input.current.value = "";
  }

  const done = items.filter((i) => i.state === "done");
  const busy = items.some((i) => i.state === "uploading");

  return (
    <main className="focus">
      <div className="focus-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.mark ? <img src={brand.mark} alt={agencyName} style={{ height: 40, width: "auto" }} /> : <span className="wordmark">{agencyName}</span>}
        <Link className="btn line sm" href="/portal">Back to my portal</Link>
      </div>
      <div className="q">
        <p className="eyebrow">Upload your {kind}</p>
        <h2 style={{ marginTop: 8 }}>{title}</h2>
        <p>{help}</p>
        {driveUrl && <p className="note" style={{ marginTop: 6 }}>Prefer Google Drive? <a href={driveUrl} target="_blank" rel="noreferrer">Open your {kind === "branding" ? "Branding" : "Content"} folder</a> and add files there.</p>}
      </div>
      <div
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      >
        <p><b>Drag files here</b> or</p>
        <button className="btn" onClick={() => input.current?.click()}>Choose files</button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <p className="note">Your files go straight to your {agencyName} team. Add a caption or notes to each one so we know what it is and how you&apos;d like it used.</p>
      </div>
      {items.length > 0 && (
        <ul className="files up-files">
          {items.map((it) => (
            <li key={it.key}>
              <div className="up-file">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.preview ? <img src={it.preview} alt="" /> : <span className="up-icon" aria-hidden="true">{/\.(mov|mp4|m4v|webm)$/i.test(it.name) ? "▶" : "▤"}</span>}
                <div className="up-body">
                  <span className="up-name">
                    <b>{it.name}</b>
                    <span style={{ color: it.state === "failed" ? "var(--crit)" : it.state === "done" ? "var(--ok)" : "var(--ink-2)" }}>
                      {it.state === "uploading" ? `Uploading ${Math.round(it.progress * 100)}%` : it.state === "done" ? "Uploaded" : it.error}
                    </span>
                  </span>
                  {it.state === "uploading" && <span className="up-bar"><span style={{ width: `${Math.round(it.progress * 100)}%` }} /></span>}
                  {it.state === "failed" && it.error?.includes("upload limit") && (
                    <span className="note">{driveUrl ? <>Add it to your <a href={driveUrl} target="_blank" rel="noreferrer">Google Drive folder</a> instead, or send it in a message with a link.</> : "Send it to your team as a link (Google Drive, Dropbox or WeTransfer) in a message instead."}</span>
                  )}
                  {it.state !== "failed" && (
                    <>
                      <label className="sr-only" htmlFor={`note-${it.key}`}>Caption or notes for {it.name}</label>
                      <textarea className="input up-note" id={`note-${it.key}`} rows={2} value={it.note} maxLength={1000}
                        placeholder="Caption or notes: what is this, and anything we should know?"
                        onChange={(e) => update(it.key, { note: e.target.value })} />
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="nav-row">
        <span />
        <button
          className="btn lg"
          disabled={!done.length || busy || pending}
          onClick={() => startTransition(() => finishUploads(kind, done.map((d) => ({ name: d.name, path: d.path!, note: d.note }))))}
        >
          {pending ? "Sending…" : "I'm done uploading"}
        </button>
      </div>
    </main>
  );
}
