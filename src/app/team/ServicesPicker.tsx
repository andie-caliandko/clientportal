"use client";

import { useEffect, useRef, useState } from "react";
import { SERVICES } from "@/lib/services";

/** A drop-down of services with a checkbox for each; any mix can be picked. Sends "services". */
export function ServicesPicker({ id, initial = [] }: { id: string; initial?: string[] }) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", away);
    box.current?.addEventListener("keydown", esc);
    const el = box.current;
    return () => { document.removeEventListener("mousedown", away); el?.removeEventListener("keydown", esc); };
  }, [open]);
  const summary = SERVICES.filter((s) => picked.includes(s.id)).map((s) => s.label).join(", ");
  return (
    <div className="multi" ref={box}>
      <button type="button" id={id} className="sel multi-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={summary ? "" : "note"}>{summary || "Choose services"}</span>
      </button>
      {/* Always in the form, so the picks are sent even while the list is closed. */}
      {picked.map((s) => <input key={s} type="hidden" name="services" value={s} />)}
      {open && (
        <div className="multi-list" role="group" aria-label="Services">
          {SERVICES.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={picked.includes(s.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((p) => p !== s.id))} />
              {s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
