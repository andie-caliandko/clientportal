"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { NotificationItem } from "@/lib/notificationsList";
import { markRead } from "./actions";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Bell with unread count, a list, and a pop-up when something new arrives. */
export function Bell({ userId, initial }: { userId: string; initial: NotificationItem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<NotificationItem | null>(null);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => setItems(initial), [initial]);

  // New notifications arrive live and pop up for a few seconds.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as NotificationItem;
        setItems((cur) => [n, ...cur].slice(0, 20));
        setPopup(n);
        router.refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, router]);

  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => setPopup(null), 6000);
    return () => clearTimeout(t);
  }, [popup]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const go = async (n: NotificationItem) => {
    setOpen(false);
    setPopup(null);
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await markRead(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {unread > 0 && (
              <button type="button" className="linkbtn note" onClick={async () => {
                setItems((cur) => cur.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
                await markRead();
              }}>Mark all read</button>
            )}
          </div>
          {items.length ? (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.read_at ? "" : "unread"} onClick={() => go(n)}>
                    <span className={`bell-dot ${n.kind}`} aria-hidden="true" />
                    <span><b>{n.title}</b>{n.body && <small>{n.body}</small>}<small>{ago(n.created_at)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note" style={{ padding: 14 }}>Nothing yet. New messages and tasks for you show up here.</p>
          )}
        </div>
      )}
      {popup && (
        <button type="button" className="bell-pop" onClick={() => go(popup)}>
          <b>{popup.title}</b>
          {popup.body && <small>{popup.body}</small>}
        </button>
      )}
    </div>
  );
}
