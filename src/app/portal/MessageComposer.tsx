"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";

type Picked = { name: string; path?: string; size: number; type: string; state: "uploading" | "done" | "failed" };

/** Message box with an attach button. Files upload straight to storage, then the message is sent. */
export function MessageComposer({ folder, placeholder, send, hidden = {} }: {
  folder: string;
  placeholder: string;
  send: (form: FormData) => Promise<void>;
  hidden?: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const busy = files.some((f) => f.state === "uploading");
  const ready = files.filter((f) => f.state === "done");

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    const supabase = createClient();
    for (const file of Array.from(list).slice(0, 10)) {
      if (file.size > 50 * 1024 * 1024) {
        setFiles((cur) => [...cur, { name: file.name, size: file.size, type: file.type, state: "failed" }]);
        continue;
      }
      const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      setFiles((cur) => [...cur, { name: file.name, size: file.size, type: file.type, state: "uploading" }]);
      const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type || undefined });
      setFiles((cur) => cur.map((f) => (f.name === file.name && f.state === "uploading" ? { ...f, path, state: error ? "failed" : "done" } : f)));
    }
    if (input.current) input.current.value = "";
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() && !ready.length) return;
        const form = new FormData();
        form.set("body", text);
        form.set("attachments", JSON.stringify(ready.map(({ name, path, size, type }) => ({ name, path, size, type }))));
        Object.entries(hidden).forEach(([k, v]) => form.set(k, v));
        startTransition(async () => {
          await send(form);
          setText("");
          setFiles([]);
        });
      }}
    >
      {files.length > 0 && (
        <ul className="attach-list">
          {files.map((f, i) => (
            <li key={i} className={f.state}>
              {f.name}
              <span>{f.state === "uploading" ? "Uploading…" : f.state === "failed" ? "Didn't upload (50 MB max)" : ""}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="compose">
        <label htmlFor="msg-input" className="sr">Write a message</label>
        <textarea id="msg-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" className="btn sm line" onClick={() => input.current?.click()} aria-label="Attach files">Attach</button>
          <button className="btn" disabled={pending || busy || (!text.trim() && !ready.length)}>{pending ? "Sending…" : "Send"}</button>
        </div>
        <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      </div>
    </form>
  );
}
