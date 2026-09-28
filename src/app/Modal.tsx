"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A pop-up window over the page, for adding and editing things. The page
 * behind it doesn't move: it stays dimmed where it was and can't scroll until
 * the window closes. Closes with Esc, the close button, or a click outside.
 */
export function Modal({ title, onClose, children, wide = false }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Lock page scrolling without the page shifting sideways when the scrollbar goes away.
    const body = document.body;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    // Start typing in the first field.
    box.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.overflow = before.overflow;
      body.style.paddingRight = before.paddingRight;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
