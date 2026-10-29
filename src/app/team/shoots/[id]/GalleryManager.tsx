"use client";
/* eslint-disable @next/next/no-img-element -- photos come from short-lived storage links */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { galleryCount, isVideo, type GalleryItem } from "@/lib/gallery";
import { createClient } from "@/lib/supabase/browser";
import { uploadResumable } from "@/lib/resumableUpload";
import { addGalleryItem, hideGallery, removeGalleryItem, sendGallery, setGalleryCover, shareGalleryLink, stopGalleryLink } from "../galleryActions";

// Previews are sharp on big phone and laptop screens (a grid tile is ~360px wide, twice that on retina)
// while staying a fraction of the original's size.
const THUMB = 1400;

/**
 * A JPEG preview of a photo or video frame, shrunk in steps with high-quality smoothing so
 * edges stay clean (one big jump from a 6000px photo looks jagged and soft).
 * Shown right after upload; the server then swaps in its own sharper versions of photos.
 */
async function preview(src: { file: Blob; video: boolean }): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    let source: CanvasImageSource, w: number, h: number;
    if (!src.video) {
      const bmp = await createImageBitmap(src.file);
      source = bmp; w = bmp.width; h = bmp.height;
    } else {
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "auto";
      video.src = URL.createObjectURL(src.file);
      await new Promise<void>((ok, fail) => { video.onloadeddata = () => ok(); video.onerror = () => fail(); });
      video.currentTime = Math.min(0.5, video.duration / 2 || 0);
      await new Promise<void>((ok) => { video.onseeked = () => ok(); });
      source = video; w = video.videoWidth; h = video.videoHeight;
    }
    const scale = Math.min(1, THUMB / Math.max(w, h));
    const tw = Math.round(w * scale), th = Math.round(h * scale);
    let cw = w, ch = h;
    while (cw / 2 >= tw) {
      const step = document.createElement("canvas");
      step.width = Math.round(cw / 2); step.height = Math.round(ch / 2);
      const ctx = step.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, step.width, step.height);
      source = step; cw = step.width; ch = step.height;
    }
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, tw, th);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.86));
    return blob ? { blob, width: w, height: h } : null;
  } catch {
    return null;
  }
}

/** Upload photos and videos, pick a cover, then send the gallery to the client's portal. */
export function GalleryManager({ shootId, clientId, agencyId, items, coverId, sentAt, previewHref, shareToken, namedLink, viewers, timeZone, sizing }: {
  shootId: string; clientId: string; agencyId: string; items: GalleryItem[]; coverId: string | null; sentAt: string | null; previewHref: string;
  /** The gallery's no-sign-in share link, once one has been made. */
  shareToken: string | null;
  /** Whether the link ends in the client's name (older links end in random letters). */
  namedLink: boolean;
  /** People who entered their email to open the share link. */
  viewers: GalleryViewer[];
  timeZone: string;
  /** Photos still waiting for their server-made previews. */
  sizing: number;
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
        const p = await preview({ file: f, video: f.type.startsWith("video/") });
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
      {items.length > 0 && <ShareLink shootId={shootId} token={shareToken} named={namedLink} viewers={viewers} timeZone={timeZone} />}

      <label htmlFor="gallery-files" className={`gallery-drop ${drag ? "on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!progress) upload([...e.dataTransfer.files]); }}>
        <b>{progress ? `Uploading ${progress.done} of ${progress.total}…` : "Drop photos and videos here, or click to choose"}</b>
        <span className="note">They&apos;re saved here and copied to the shoot&apos;s Drive folder (Gallery). The client sees them once you send the gallery.</span>
        <input ref={input} id="gallery-files" type="file" multiple accept="image/*,video/*" className="sr-only" disabled={!!progress}
          onChange={(e) => upload([...(e.target.files ?? [])])} />
      </label>
      {errors.length > 0 && <div className="error">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

      {sizing > 0 && <p className="note" role="status">Making sharp previews for {sizing} photo{sizing === 1 ? "" : "s"}. They swap in on their own over the next few minutes.</p>}
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

/**
 * A link to the gallery that opens without signing in, to text or email to anyone
 * (one-time shoots, or clients who aren't in the portal).
 */
export type GalleryViewer = { email: string; first: string; last: string; visits: number };

function ShareLink({ shootId, token, named, viewers, timeZone }: { shootId: string; token: string | null; named: boolean; viewers: GalleryViewer[]; timeZone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setUrl(token ? `${window.location.origin}/g/${token}` : null); }, [token]);
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); setNote("Link copied. Paste it into a text or email."); }
    catch { setNote("Select the link and copy it."); }
  };
  const make = () => start(async () => {
    const r = await shareGalleryLink(shootId);
    if (r.error || !r.token) return setNote(r.error ?? "The link couldn't be made.");
    await copy(`${window.location.origin}/g/${r.token}`);
    router.refresh();
  });
  const stop = () => start(async () => { const r = await stopGalleryLink(shootId); setNote(r.error ?? r.ok ?? null); router.refresh(); });
  return (
    <div className="share-link">
      <div>
        <b>Share link</b>
        <p className="note">{url ? "Anyone with this link can view and download the gallery after entering their email (no password)." : "A link anyone can open with just their email, no portal sign-in. Good for one-time shoots."}</p>
      </div>
      {url ? (
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input id={`share-${shootId}`} className="share-url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Gallery link" />
          <button type="button" className="btn sm" onClick={() => copy(url)}>Copy link</button>
          <a className="btn sm line" href={url} target="_blank" rel="noreferrer">Open gallery</a>
          {!named && <button type="button" className="linkbtn" disabled={pending} onClick={make}>Use a link with their name</button>}
          <button type="button" className="linkbtn note" disabled={pending} onClick={stop}>Turn off link</button>
        </div>
      ) : (
        <button type="button" className="btn sm line" disabled={pending} onClick={make}>{pending ? "Making link…" : "Get share link"}</button>
      )}
      {note && <p className="note" role="status">{note}</p>}
      {viewers.length > 0 && (
        <details className="share-viewers">
          <summary>Viewed by {viewers.length} {viewers.length === 1 ? "person" : "people"}</summary>
          <table>
            <thead><tr><th>Email</th><th>First opened</th><th>Last opened</th><th>Visits</th></tr></thead>
            <tbody>
              {viewers.map((v) => (
                <tr key={v.email}><td>{v.email}</td><td>{when(v.first, timeZone)}</td><td>{when(v.last, timeZone)}</td><td>{v.visits}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

const when = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
