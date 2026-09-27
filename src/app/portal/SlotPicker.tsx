"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { bookCall } from "./actions";

/** Pick a day, then a time. Times show in the client's own time zone. */
export function SlotPicker({ requestId, slots, durationMin, disabled }: {
  requestId: string;
  slots: string[];
  durationMin: number;
  /** Team preview: looks the same, can't book. */
  disabled?: boolean;
}) {
  // Time zones differ between the server and the browser, so wait for the browser.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  const byDay = useMemo(() => {
    if (!tz) return [];
    const groups = new Map<string, string[]>();
    for (const s of slots) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(s));
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [slots, tz]);

  if (msg.ok) return <p className="flash" role="status">{msg.ok}</p>;
  if (!tz) return <p className="note">Loading open times…</p>;
  if (!byDay.length) return <p className="note">There aren&apos;t any open times left in this window. Send us a message and we&apos;ll find one.</p>;

  const activeDay = day ?? byDay[0][0];
  const times = byDay.find(([d]) => d === activeDay)?.[1] ?? [];
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;

  return (
    <div className="slots">
      <div className="slot-days" role="group" aria-label="Day">
        {byDay.map(([d, list]) => (
          <button key={d} type="button" className={`slot-day ${d === activeDay ? "on" : ""}`} aria-pressed={d === activeDay}
            onClick={() => { setDay(d); setPick(null); }}>
            <small>{fmtDay(d, { weekday: "short" })}</small>
            <b>{fmtDay(d, { day: "numeric" })}</b>
            <small>{fmtDay(d, { month: "short" })}</small>
            <span className="sr-only">{list.length} times</span>
          </button>
        ))}
      </div>
      <div className="slot-times" role="group" aria-label="Time">
        {times.map((s) => (
          <button key={s} type="button" className={`slot-time ${s === pick ? "on" : ""}`} aria-pressed={s === pick} onClick={() => setPick(s)}>
            {fmtTime(s)}
          </button>
        ))}
      </div>
      <p className="note">Times are in {zone ?? tz}. Each call is {durationMin} minutes on Google Meet.</p>
      {msg.error && <p className="error">{msg.error}</p>}
      {pick && (
        <div>
          <button type="button" className="btn warm" disabled={disabled || pending} onClick={() => startTransition(async () => setMsg(await bookCall(requestId, pick)))}>
            {pending ? "Booking…" : `Book ${fmtDay(activeDay, { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(pick)}`}
          </button>
        </div>
      )}
    </div>
  );
}
