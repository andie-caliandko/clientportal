"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const kindOf = (name: string, type?: string | null) => {
  const t = (type ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (t === "application/pdf" || ext === "pdf") return "pdf";
  if (t.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  return "other";
};

export type GalleryFile = { url: string; name: string; type?: string | null };

/**
 * A file or image that opens in a preview over the page instead of a new tab.
 * Given the files around it (`gallery` and its `index`), the preview steps
 * left and right through them with the arrows, arrow keys or a swipe.
 */
export function FilePreview({ url, name, type, thumbnail = false, className, label, gallery, index = 0 }: {
  url: string;
  name: string;
  type?: string | null;
  gallery?: GalleryFile[];
  index?: number;
  /** Button text, if it should say something other than the file name. */
  label?: string;
  /** Show images as a small preview in place of the file name. */
  thumbnail?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(index);
  const swipe = useRef<number | null>(null);
  const swiped = useRef(false);
  const many = (gallery?.length ?? 0) > 1;
  const cur = gallery?.[at] ?? { url, name, type };
  const kind = kindOf(cur.name, cur.type);
  const step = (d: number) => gallery && setAt((i) => (i + d + gallery.length) % gallery.length);
  // Storage links download (rather than open) when asked to.
  const downloadUrl = `${cur.url}${cur.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(cur.name)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button type="button" className={`file-link ${className ?? ""}`} onClick={() => { setAt(index); setOpen(true); }} aria-label={`Open ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumbnail && kindOf(name, type) === "image" ? <img src={url} alt={name} loading="lazy" /> : <span>{label ?? name}</span>}
      </button>
      {/* Rendered at the top of the page so nothing around the link can get in the way. */}
      {open && createPortal(
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={cur.name}
          onClick={() => { if (swiped.current) swiped.current = false; else setOpen(false); }}
          onPointerDown={(e) => { swipe.current = e.clientX; }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            if (many && start !== null && Math.abs(e.clientX - start) > 60 && e.pointerType !== "mouse") {
              swiped.current = true;
              step(e.clientX < start ? 1 : -1);
            }
          }}>
          <div className="lightbox-bar">
            <span className="lightbox-name">{cur.name}{many && <span className="lightbox-count"> · {at + 1} of {gallery!.length}</span>}</span>
            <a className="btn sm line" href={downloadUrl} onClick={(e) => e.stopPropagation()}>Download</a>
            <button type="button" className="btn sm" onClick={() => setOpen(false)} autoFocus>Close</button>
          </div>
          {/* Clicking the dark space (or an image) closes it; PDFs and videos stay open so you can use them. */}
          {many && (
            <>
              <button type="button" className="lightbox-nav prev" aria-label="Previous file" onClick={(e) => { e.stopPropagation(); step(-1); }}>‹</button>
              <button type="button" className="lightbox-nav next" aria-label="Next file" onClick={(e) => { e.stopPropagation(); step(1); }}>›</button>
            </>
          )}
          <div className="lightbox-body" key={cur.url}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {kind === "image" && <img src={cur.url} alt={cur.name} />}
            {kind === "pdf" && <iframe src={`${cur.url}#view=FitH`} title={cur.name} />}
            {kind === "video" && <video src={cur.url} controls autoPlay onClick={(e) => e.stopPropagation()} />}
            {kind === "other" && (
              <div className="lightbox-file" onClick={(e) => e.stopPropagation()}>
                <p><b>{cur.name}</b></p>
                <p className="note">This kind of file can&apos;t be previewed here. Download it to open it.</p>
                <a className="btn" href={downloadUrl}>Download</a>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
