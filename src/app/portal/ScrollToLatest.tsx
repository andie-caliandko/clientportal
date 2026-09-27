"use client";

import { useEffect, useRef } from "react";

/** A message thread that opens on the newest message; scroll up for older ones. */
export function ScrollToLatest({ className, style, children, latest }: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** The newest message's id: when it changes, the thread jumps to the bottom. */
  latest: string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Stay pinned to the bottom until the reader scrolls up themselves.
  const pinned = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    pinned.current = true;
    const toBottom = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    // Pictures and previews load after the text and make the thread taller;
    // keep the newest message in view as they do.
    const resize = new ResizeObserver(toBottom);
    Array.from(el.children).forEach((child) => resize.observe(child));
    el.addEventListener("load", toBottom, true);
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener("load", toBottom, true);
      el.removeEventListener("scroll", onScroll);
    };
  }, [latest]);

  return <div ref={box} className={className} style={style} aria-live="polite">{children}</div>;
}
