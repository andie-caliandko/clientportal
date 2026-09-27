"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const kindOf = (name: string, type?: string | null) => {
  const t = (type ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (t === "application/pdf" || ext === "pdf") return "pdf";
  if (t.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  return "other";
};

/** A file or image that opens in a preview over the page instead of a new tab. */
export function FilePreview({ url, name, type, thumbnail = false, className, label }: {
  url: string;
  name: string;
  type?: string | null;
  /** Button text, if it should say something other than the file name. */
  label?: string;
  /** Show images as a small preview in place of the file name. */
  thumbnail?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(name, type);
  // Storage links download (rather than open) when asked to.
  const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className={`file-link ${className ?? ""}`} onClick={() => setOpen(true)} aria-label={`Open ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumbnail && kind === "image" ? <img src={url} alt={name} /> : <span>{label ?? name}</span>}
      </button>
      {/* Rendered at the top of the page so nothing around the link can get in the way. */}
      {open && createPortal(
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={name} onClick={() => setOpen(false)}>
          <div className="lightbox-bar">
            <span className="lightbox-name">{name}</span>
            <a className="btn sm line" href={downloadUrl} onClick={(e) => e.stopPropagation()}>Download</a>
            <button type="button" className="btn sm" onClick={() => setOpen(false)} autoFocus>Close</button>
          </div>
          {/* Clicking the dark space (or an image) closes it; PDFs and videos stay open so you can use them. */}
          <div className="lightbox-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {kind === "image" && <img src={url} alt={name} />}
            {kind === "pdf" && <iframe src={`${url}#view=FitH`} title={name} />}
            {kind === "video" && <video src={url} controls autoPlay onClick={(e) => e.stopPropagation()} />}
            {kind === "other" && (
              <div className="lightbox-file" onClick={(e) => e.stopPropagation()}>
                <p><b>{name}</b></p>
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
