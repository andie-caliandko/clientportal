"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { patchSheet } from "./actions";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Saves fields of one sheet (a month or the vision) and reports how it went. */
export function useSheet<T extends object>(key: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef(0);
  useEffect(() => { setData(initial); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback(async (patch: Partial<T>) => {
    setData((d) => ({ ...d, ...patch }));
    pending.current++;
    setState("saving");
    const r = await patchSheet(key, patch as Record<string, unknown>).catch(() => ({ error: "x" }));
    pending.current--;
    if ("error" in r && r.error) setState("error");
    else if (!pending.current) setState("saved");
  }, [key]);
  return { data, save, state, setState };
}

export function SaveNote({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span className={`trk-save ${state}`} role="status">
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "That didn't save. Check your connection and try again."}
    </span>
  );
}

const parse = (text: string, pct: boolean) => {
  const t = text.replace(/[$,%\s]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
};

/** A number box that saves when you leave it. Percentages are typed as 40 and kept as 0.4. */
export function Num({ value, onSave, kind = "number", label, id, placeholder, className = "" }: {
  value: number | undefined; onSave: (n: number | undefined) => void; kind?: "number" | "money" | "pct";
  label: string; id?: string; placeholder?: string; className?: string;
}) {
  const shown = (v: number | undefined) => (v === undefined || v === null ? "" : kind === "pct" ? String(Math.round(v * 10000) / 100) : String(v));
  const [text, setText] = useState(shown(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(shown(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`trk-num ${kind} ${bad ? "bad" : ""} ${className}`}>
      {kind === "money" && <i aria-hidden="true">$</i>}
      <input id={id} className="input" inputMode="decimal" aria-label={label} title={bad ? "Type a number" : undefined} placeholder={placeholder}
        value={text} onChange={(e) => { setText(e.target.value); setBad(false); }}
        onBlur={() => {
          const n = parse(text, kind === "pct");
          if (n === null) return setBad(true);
          if (n !== value) onSave(n);
        }} />
      {kind === "pct" && <i aria-hidden="true">%</i>}
    </span>
  );
}

/** A text box (one line or several) that saves when you leave it. */
export function Text({ value, onSave, label, area = false, placeholder, id }: {
  value: string | undefined; onSave: (s: string) => void; label: string; area?: boolean; placeholder?: string; id?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => { setText(value ?? ""); }, [value]);
  const props = { id, className: "input", "aria-label": label, placeholder, value: text,
    onBlur: () => { if (text !== (value ?? "")) onSave(text); } };
  return area
    ? <textarea {...props} rows={3} onChange={(e) => setText(e.target.value)} />
    : <input {...props} onChange={(e) => setText(e.target.value)} />;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
