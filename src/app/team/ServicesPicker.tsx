"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SERVICES, serviceLabel } from "@/lib/services";
import { setClientServices } from "./actions";

/**
 * A drop-down of services with a checkbox for each; any mix can be picked.
 * In a form it sends "services". Given a `clientId`, it saves each change on the spot.
 */
export function ServicesPicker({ id, initial = [], clientId, compact = false }: { id: string; initial?: string[]; clientId?: string; compact?: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    // The list floats over the page, so a table around it can't cut it off.
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 216), width: Math.max(r.width, 200) });
    const away = (e: MouseEvent) => !btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (sid: string, on: boolean) => {
    const next = SERVICES.map((s) => s.id).filter((x) => (x === sid ? on : picked.includes(x)));
    setPicked(next);
    if (!clientId) return;
    startTransition(async () => {
      const res = await setClientServices(clientId, next);
      setError(res.error ?? null);
      router.refresh();
    });
  };

  const chosen = SERVICES.filter((s) => picked.includes(s.id));
  return (
    <div className={`multi ${compact ? "compact" : ""}`}>
      <button ref={btn} type="button" id={id} className="multi-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        {chosen.length
          ? <span className="services">{chosen.map((s) => <ServiceTag key={s.id} id={s.id} />)}</span>
          : <span className="note">Choose services</span>}
      </button>
      {!clientId && picked.map((s) => <input key={s} type="hidden" name="services" value={s} />)}
      {pending && <span className="note sr-only" role="status">Saving…</span>}
      {error && <span className="error" style={{ fontSize: ".8rem" }}>{error}</span>}
      {open && pos && createPortal(
        <div ref={list} className="multi-list" role="group" aria-label="Services" style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}>
          {SERVICES.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              <span className={`svc-dot svc-${s.id}`} aria-hidden="true" />
              {s.label}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A service as a colored tag (each service has its own color). */
export function ServiceTag({ id }: { id: string }) {
  return <span className={`svc svc-${id}`}>{serviceLabel(id)}</span>;
}
