"use client";
/* eslint-disable @next/next/no-img-element -- photos come from short-lived storage links */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { galleryCount, isVideo, type GalleryItem } from "@/lib/gallery";
import { createClient } from "@/lib/supabase/browser";
import { uploadResumable } from "@/lib/resumableUpload";
import { addGalleryItem, hideGallery, removeGalleryItem, sendGallery, setGalleryCover } from "../galleryActions";

const THUMB = 900;

/** A small JPEG preview of a photo or the first moment of a video, made in the browser. Null if it can't be read (like HEIC). */
async function preview(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    let source: CanvasImageSource, w: number, h: number;
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file);
      source = bmp; w = bmp.width; h = bmp.height;
    } else if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "auto";
      video.src = URL.createObjectURL(file);
      await new Promise<void>((ok, fail) => { video.onloadeddata = () => ok(); video.onerror = () => fail(); });
      video.currentTime = Math.min(0.5, video.duration / 2 || 0);
      await new Promise<void>((ok) => { video.onseeked = () => ok(); });
      source = video; w = video.videoWidth; h = video.videoHeight;
    } else return null;
    const scale = Math.min(1, THUMB / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    return blob ? { blob, width: w, height: h } : null;
  } catch {
    return null;
  }
}

/** Upload photos and videos, pick a cover, then send the gallery to the client's portal. */
export function GalleryManager({ shootId, clientId, agencyId, items, coverId, sentAt, previewHref }: {
  shootId: string; clientId: string; agencyId: string; items: GalleryItem[]; coverId: string | null; sentAt: string | null; previewHref: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const favs = items.filter((i) => i.favorite).length;

  const upload = async (list: File[]) => {
    const files = list.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) return setErrors(["Choose photos or videos."]);
    setErrors([]); setMsg({});
    setProgress({ done: 0, total: files.length });
    const supabase = createClient();
    const failed: string[] = [];
    let done = 0;
    const one = async (f: File) => {
      const base = `${agencyId}/${clientId}/${shootId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const path = `${base}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const error = await uploadResumable("galleries", path, f, { contentType: f.type || undefined });
      if (error) {
        failed.push(`${f.name}: ${error}`);
      } else {
        const p = await preview(f);
        let thumbPath: string | null = null;
        if (p) {
          thumbPath = `${base}-thumb.jpg`;
          const t = await supabase.storage.from("galleries").upload(thumbPath, p.blob, { contentType: "image/jpeg" });
          if (t.error) thumbPath = null;
        }
        const r = await addGalleryItem(shootId, { path, thumbPath, name: f.name, mime: f.type, size: f.size, width: p?.width ?? null, height: p?.height ?? null });
        if (r.error) failed.push(r.error);
      }
      done++;
      setProgress({ done, total: files.length });
    };
    // Three at a time.
    const queue = [...files];
    await Promise.all(Array.from({ length: 3 }, async () => { for (let f = queue.shift(); f; f = queue.shift()) await one(f); }));
    setProgress(null);
    setErrors(failed);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const act = (fn: () => Promise<{ error?: string; ok?: string }>) => start(async () => { setMsg(await fn()); setConfirm(false); router.refresh(); });

  return (
    <div className="panel">
      <div className="sec-head">
        <div>
          <h2>Gallery</h2>
          <p className="note">{items.length ? galleryCount(items) : "No photos yet"}{favs ? ` · ${favs} client favorite${favs === 1 ? "" : "s"}` : ""}
            {sentAt ? ` · In their portal since ${sentAt}` : items.length ? " · Not sent yet" : ""}</p>
        </div>
        <span className="row" style={{ gap: 8, alignItems: "center" }}>
          {items.length > 0 && <a className="btn sm line" href={previewHref} target="_blank" rel="noreferrer">Preview as client</a>}
          {sentAt && <button type="button" className="linkbtn note" disabled={pending} onClick={() => act(() => hideGallery(shootId))}>Hide from client</button>}
          {confirm ? (
            <>
              <button type="button" className="btn sm" disabled={pending} onClick={() => act(() => sendGallery(shootId))}>{pending ? "Sending…" : "Yes, send it"}</button>
              <button type="button" className="linkbtn note" onClick={() => setConfirm(false)}>Not yet</button>
            </>
          ) : (
            <button type="button" className="btn sm" disabled={pending || !items.length || !!progress} onClick={() => setConfirm(true)}>{sentAt ? "Notify client again" : "Send gallery to client"}</button>
          )}
        </span>
      </div>
      {msg.error && <p className="error">{msg.error}</p>}
      {msg.ok && <p className="flash" role="status">{msg.ok}</p>}

      <label htmlFor="gallery-files" className={`gallery-drop ${drag ? "on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!progress) upload([...e.dataTransfer.files]); }}>
        <b>{progress ? `Uploading ${progress.done} of ${progress.total}…` : "Drop photos and videos here, or click to choose"}</b>
        <span className="note">They&apos;re saved here and copied to the shoot&apos;s Drive folder (Gallery). The client sees them once you send the gallery.</span>
        <input ref={input} id="gallery-files" type="file" multiple accept="image/*,video/*" className="sr-only" disabled={!!progress}
          onChange={(e) => upload([...(e.target.files ?? [])])} />
      </label>
      {errors.length > 0 && <div className="error">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

      {items.length > 0 && (
        <ul className="gallery-admin">
          {items.map((i) => (
            <li key={i.id} className={i.id === coverId ? "cover" : ""}>
              {i.thumb && !(isVideo(i) && i.thumb === i.url) ? <img src={i.thumb} alt="" loading="lazy" /> : isVideo(i) ? <video src={`${i.url}#t=0.5`} preload="metadata" muted /> : <span className="gallery-file">{i.name}</span>}
              {isVideo(i) && <span className="gallery-play" aria-hidden="true">▶</span>}
              {i.favorite && <span className="gallery-fav" title="Client favorite">♥</span>}
              <span className="gallery-admin-tools">
                {i.id === coverId ? <span className="pill ok">Cover</span> : (
                  <button type="button" className="linkbtn" disabled={pending || isVideo(i)} onClick={() => act(() => setGalleryCover(shootId, i.id))}>Make cover</button>
                )}
                <button type="button" className="linkbtn note" disabled={pending} aria-label={`Remove ${i.name}`} onClick={() => act(() => removeGalleryItem(i.id))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
