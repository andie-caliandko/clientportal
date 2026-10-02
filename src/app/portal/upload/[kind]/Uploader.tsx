"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Brand } from "@/lib/types";
import { finishUploads } from "../../actions";

type Item = { name: string; path?: string; state: "uploading" | "done" | "failed" };

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

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${folder}/${Date.now()}-${safe}`;
      setItems((cur) => [...cur, { name: file.name, state: "uploading" }]);
      const { error } = await supabase.storage.from("uploads").upload(path, file);
      setItems((cur) =>
        cur.map((it) => (it.name === file.name && it.state === "uploading" ? { ...it, path, state: error ? "failed" : "done" } : it)),
      );
    }
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
        <p className="note">Your files go straight to your {agencyName} team.</p>
      </div>
      {items.length > 0 && (
        <ul className="files">
          {items.map((it, n) => (
            <li key={n}>
              {it.name}
              <span style={{ color: it.state === "failed" ? "var(--crit)" : it.state === "done" ? "var(--ok)" : "var(--ink-2)" }}>
                {it.state === "uploading" ? "Uploading…" : it.state === "done" ? "Uploaded" : "Didn't upload. Try again."}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="nav-row">
        <span />
        <button
          className="btn lg"
          disabled={!done.length || busy || pending}
          onClick={() => startTransition(() => finishUploads(kind, done.map((d) => ({ name: d.name, path: d.path! }))))}
        >
          {pending ? "Sending…" : "I'm done uploading"}
        </button>
      </div>
    </main>
  );
}
