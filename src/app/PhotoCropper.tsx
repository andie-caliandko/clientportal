"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STAGE = 280;
const OUT = 512;
const MAX_ZOOM = 4;

/**
 * Drag and zoom a photo inside a circle, then save it as a small square
 * image. Any size photo works: the result is always 512 × 512.
 */
export function PhotoCropper({ file, onCancel, onSave, saving }: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
  saving?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    let live = true;
    el.onload = () => live && setImg(el);
    el.onerror = () => live && setFailed(true);
    el.src = url;
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const base = img ? Math.max(STAGE / img.naturalWidth, STAGE / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = (img?.naturalWidth ?? 0) * scale;
  const h = (img?.naturalHeight ?? 0) * scale;
  // Keep the photo covering the whole circle.
  const clamp = (p: { x: number; y: number }, width = w, height = h) => ({
    x: Math.max(-(width - STAGE) / 2, Math.min((width - STAGE) / 2, p.x)),
    y: Math.max(-(height - STAGE) / 2, Math.min((height - STAGE) / 2, p.y)),
  });
  const setZoomClamped = (z: number) => {
    const next = Math.max(1, Math.min(MAX_ZOOM, z));
    setZoom(next);
    if (img) setPos((p) => clamp(p, img.naturalWidth * base * next, img.naturalHeight * base * next));
  };

  const save = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    const r = OUT / STAGE;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (STAGE / 2 + pos.x - w / 2) * r, (STAGE / 2 + pos.y - h / 2) * r, w * r, h * r);
    canvas.toBlob((blob) => blob && onSave(blob), "image/jpeg", 0.9);
  };

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Crop your photo" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="cropper">
        <h2>Fit your photo</h2>
        {failed ? (
          <p className="error">That file couldn&apos;t be opened as a picture. Try a JPG or PNG.</p>
        ) : (
          <>
            <div
              className="crop-stage"
              style={{ width: STAGE, height: STAGE }}
              tabIndex={0}
              aria-label="Photo position. Drag, or use the arrow keys."
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.002)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 20 : 5;
                const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                const m = moves[e.key];
                if (!m) return;
                e.preventDefault();
                setPos((p) => clamp({ x: p.x + m[0], y: p.y + m[1] }));
              }}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.src} alt="" draggable={false}
                  style={{ width: w, height: h, left: STAGE / 2 + pos.x - w / 2, top: STAGE / 2 + pos.y - h / 2 }} />
              )}
              <span className="crop-ring" aria-hidden="true" />
            </div>
            <label className="crop-zoom" htmlFor="crop-zoom">
              <span className="note">Zoom</span>
              <input id="crop-zoom" type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoomClamped(+e.target.value)} />
            </label>
            <p className="note">Drag the photo to move it.</p>
          </>
        )}
        <div className="row">
          <button type="button" className="btn sm" onClick={save} disabled={!img || saving}>{saving ? "Saving…" : "Save photo"}</button>
          <button type="button" className="btn sm line" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
