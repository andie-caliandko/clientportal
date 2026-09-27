"use client";

import { useEffect, useRef } from "react";

/** A message thread that opens on the newest message; scroll up for older ones. */
export function ScrollToLatest({ className, style, children, count }: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** Changes when messages are added, so the thread jumps to the newest. */
  count: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return <div ref={box} className={className} style={style} aria-live="polite">{children}</div>;
}
