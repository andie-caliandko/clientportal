"use client";
/* eslint-disable @next/next/no-img-element -- photos come from short-lived storage links */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { isVideo, type GalleryItem } from "@/lib/gallery";
import { toggleGalleryFavorite } from "./actions";

const HEART = (on: boolean) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z" />
  </svg>
);

/**
 * A content shoot gallery as the client sees it: cover, grid, a full-screen viewer
 * (arrows, arrow keys, swipe), favorites and downloads.
 */
export function GalleryView({ title, sub, cover, items: initial, canFavorite, zipName }: {
  title: string;
  sub: string;
  cover: string | null;
  items: GalleryItem[];
  /** Clients can heart photos; the team preview can't. */
  canFavorite: boolean;
  zipName: string;
}) {
  const [items, setItems] = useState(initial);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = onlyFavs ? items.filter((i) => i.favorite) : items;
  const favs = items.filter((i) => i.favorite).length;

  const heart = (id: string) => {
    const on = !items.find((i) => i.id === id)?.favorite;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, favorite: on } : i)));
    start(async () => { await toggleGalleryFavorite(id, on); });
  };

  // Everything (or just the favorites) in one .zip, put together in the browser.
  const downloadAll = async () => {
    const list = shown.filter((i) => i.url);
    if (!list.length) return;
    try {
      const { downloadZip } = await import("client-zip");
      let done = 0;
      setZip(`Preparing 0 of ${list.length}…`);
      async function* files() {
        const used = new Set<string>();
        for (const i of list) {
          let name = i.name, n = 1;
          while (used.has(name)) name = i.name.replace(/(\.[^.]*)?$/, ` (${++n})$1`);
          used.add(name);
          const res = await fetch(i.url!);
          done++;
          setZip(`Preparing ${done} of ${list.length}…`);
          yield { name, input: res };
        }
      }
      const blob = await downloadZip(files()).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${zipName}${onlyFavs ? " favorites" : ""}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setZip(null);
    } catch {
      setZip("The download didn't finish. Try again, or download photos one at a time.");
    }
  };

  return (
    <section className="gallery">
      <header className={`gallery-hero ${cover ? "" : "plain"}`}>
        {cover && <Photo src={cover} alt="" />}
        <div className="gallery-hero-text">
          <p className="eyebrow">Content shoot gallery</p>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
      </header>

      <div className="gallery-bar">
        {canFavorite || favs ? (
          <div className="tabs" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={!onlyFavs} onClick={() => setOnlyFavs(false)}>All <span className="tab-count">{items.length}</span></button>
            <button type="button" role="tab" aria-selected={onlyFavs} onClick={() => setOnlyFavs(true)}>Favorites <span className="tab-count">{favs}</span></button>
          </div>
        ) : <span />}
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {zip && <span className="note" role="status">{zip}</span>}
          <button type="button" className="btn sm" disabled={!!zip && zip.startsWith("Preparing")} onClick={downloadAll}>
            {onlyFavs ? "Download favorites" : "Download all"}
          </button>
        </div>
      </div>

      {canFavorite && !onlyFavs && <p className="note">Tap the heart on the ones you love most. Your team sees your favorites.</p>}
      {onlyFavs && !favs && <p className="note">No favorites yet. Tap the heart on a photo to add it here.</p>}

      <ul className="gallery-grid">
        {shown.map((i, k) => (
          <li key={i.id}>
            <button type="button" className="gallery-tile" onClick={() => setOpen(k)} aria-label={`Open ${i.name}`}
              onPointerEnter={() => warm(i)} onPointerDown={() => warm(i)} onFocus={() => warm(i)}>
              {i.thumb && !(isVideo(i) && i.thumb === i.url) ? (
                <img src={i.thumb} alt="" loading="lazy" decoding="async" style={i.width && i.height ? { aspectRatio: `${i.width} / ${i.height}` } : undefined} />
              ) : isVideo(i) ? (
                <video src={`${i.url}#t=0.5`} preload="metadata" muted playsInline />
              ) : <span className="gallery-file">{i.name}</span>}
              {isVideo(i) && <span className="gallery-play" aria-hidden="true">▶</span>}
            </button>
            {(canFavorite || i.favorite) && (
              <button type="button" className={`gallery-heart ${i.favorite ? "on" : ""}`} aria-pressed={i.favorite} aria-label={i.favorite ? "Remove from favorites" : "Add to favorites"}
                disabled={!canFavorite} onClick={() => heart(i.id)}>{HEART(i.favorite)}</button>
            )}
          </li>
        ))}
      </ul>

      {open !== null && shown[open] && (
        <Viewer items={shown} at={open} setAt={setOpen} onHeart={canFavorite ? heart : null} />
      )}
    </section>
  );
}

/** The large version for the full-screen view, or the original when there isn't one yet (never HEIC, which browsers can't show). */
const bigOf = (i: Pick<GalleryItem, "url" | "large" | "mime">) => i.large ?? (/hei[cf]/i.test(i.mime ?? "") ? null : i.url);

/** Starts loading a photo's big version (on hover or touch), so it's ready when the photo is opened. */
export const warm = (i: Pick<GalleryItem, "url" | "large" | "mime" | "name">) => {
  const big = isVideo({ mime: i.mime, name: i.name }) ? null : bigOf(i);
  if (big) new Image().src = big;
};

/**
 * Only ever the sharp version: nothing shows until it has loaded (a soft spinner meanwhile),
 * then it fades in. Never a blurry preview first.
 */
function Photo({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [ready, setReady] = useState<string | null>(null);
  return (
    <>
      {src && ready !== src && <span className="photo-wait" aria-hidden="true" />}
      {src && <img key={src} src={src} alt={alt} className={`photo-in ${ready === src ? "on" : ""} ${className ?? ""}`}
        onLoad={() => setReady(src)} ref={(el) => { if (el?.complete && el.naturalWidth && ready !== src) setReady(src); }} />}
    </>
  );
}

/** Full-screen photo viewer; the team's gallery tab uses it too. */
export function Viewer({ items, at, setAt, onHeart }: { items: GalleryItem[]; at: number; setAt: (n: number | null) => void; onHeart: ((id: string) => void) | null }) {
  const item = items[at];
  const swipe = useRef<number | null>(null);
  const go = useCallback((d: number) => setAt((at + d + items.length) % items.length), [at, items.length, setAt]);
  // The next and previous photos load in the background, so arrowing through is instant.
  useEffect(() => {
    for (const d of [1, -1, 2]) {
      const n = items[(at + d + items.length) % items.length];
      const big = n && !isVideo(n) ? n.large : null; // not 8MB originals
      if (big) new Image().src = big;
    }
  }, [at, items]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAt(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }, [go, setAt]);
  return createPortal(
    <div className="gallery-viewer" role="dialog" aria-modal="true" aria-label={item.name}
      onTouchStart={(e) => { swipe.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (swipe.current === null) return; const dx = e.changedTouches[0].clientX - swipe.current; swipe.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <div className="gallery-viewer-bar">
        <span>{at + 1} of {items.length}</span>
        <span className="row" style={{ gap: 8, alignItems: "center" }}>
          {onHeart && (
            <button type="button" className={`gallery-heart inline ${item.favorite ? "on" : ""}`} aria-pressed={item.favorite} onClick={() => onHeart(item.id)}>
              {HEART(item.favorite)} {item.favorite ? "Favorite" : "Add to favorites"}
            </button>
          )}
          {item.download && <a className="btn sm line light" href={item.download}>Download</a>}
          <button type="button" className="btn sm line light" onClick={() => setAt(null)}>Close</button>
        </span>
      </div>
      <div className="gallery-stage" onClick={(e) => { if (e.target === e.currentTarget) setAt(null); }}>
        {isVideo(item)
          ? <video key={item.id} src={item.url ?? undefined} controls autoPlay playsInline />
          : <Photo key={item.id} src={bigOf(item) ?? item.thumb} alt={item.name} />}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="gallery-nav prev" aria-label="Previous" onClick={() => go(-1)}>‹</button>
          <button type="button" className="gallery-nav next" aria-label="Next" onClick={() => go(1)}>›</button>
        </>
      )}
    </div>,
    document.body,
  );
}
