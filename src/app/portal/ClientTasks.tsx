"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { completeClientTask } from "./actions";

export type ClientTask = {
  id: string;
  title: string;
  note: string | null;
  due: string | null;
  overdue: boolean;
  from: string;
  forName: string;
};

export function ClientTasks({ tasks, folder, readOnly = false }: { tasks: ClientTask[]; folder: string; readOnly?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {message.ok && <p className="flash">{message.ok}</p>}
      <ul className="ctasks">
        {tasks.map((t) => (
          <li key={t.id} className="ctask">
            <div className="top-row">
              <div>
                <h3>{t.title}</h3>
                <p className="by">From {t.from} · for {t.forName}</p>
              </div>
              <span className="r">
                {t.due && (t.overdue ? <span className="pill crit">Was due {t.due}</span> : <span className="pill info">Due {t.due}</span>)}
                {openId !== t.id && (readOnly ? <button className="btn sm" disabled>Mark done</button> : <button className="btn sm" onClick={() => { setOpenId(t.id); setMessage({}); }}>Mark done</button>)}
              </span>
            </div>
            {t.note && <p className="noteline">{t.note}</p>}
            {openId === t.id && (
              <DoneForm task={t} folder={folder} onCancel={() => setOpenId(null)}
                onDone={(res) => { setMessage(res); if (res.ok) setOpenId(null); }} />
            )}
          </li>
        ))}
      </ul>
      {message.error && <p className="error">{message.error}</p>}
    </div>
  );
}

function DoneForm({ task, folder, onCancel, onDone }: {
  task: ClientTask;
  folder: string;
  onCancel: () => void;
  onDone: (res: { error?: string; ok?: string }) => void;
}) {
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="done-form"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          let filePath: string | null = null;
          if (file) {
            filePath = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
            const { error } = await createClient().storage.from("uploads").upload(filePath, file);
            if (error) return onDone({ error: "Your file didn't upload. Try again, or mark it done without the file." });
          }
          onDone(await completeClientTask({ id: task.id, comment, filePath }));
        });
      }}
    >
      <label htmlFor={`c-${task.id}`} style={{ fontWeight: 600 }}>Add a comment (optional)</label>
      <textarea className="input" id={`c-${task.id}`} value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="Anything we should know?" style={{ minHeight: 80 }} autoFocus />
      <div className="attach">
        <label className="btn sm line" htmlFor={`f-${task.id}`}>Attach a file</label>
        <input id={`f-${task.id}`} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="note">{file ? file.name : "No file attached"}</span>
      </div>
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Mark done"}</button>
        <button type="button" className="btn sm line" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
