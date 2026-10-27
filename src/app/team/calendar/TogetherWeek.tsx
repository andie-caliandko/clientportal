import { layoutDay } from "@/lib/calendarLayout";
import Link from "next/link";
import { EventChip, type EventInfo } from "./EventDialog";

const HOUR = 52; // pixels per hour

export type WeekItem = {
  key: string;
  title: string;
  who: string;
  color: number;
  ooo: boolean;
  /** Timed events: minutes after midnight, already clipped to this day. */
  start?: number;
  end?: number;
  timeLabel: string;
  info: EventInfo;
} | ShootItem;

/** A content shoot: one color for everyone, and it opens the shoot's plan. */
export type ShootItem = {
  key: string; shoot: true; title: string; href: string; timeLabel: string;
  /** First names of teammates going, their ids, and the photographer. */
  crew?: string[]; crewIds?: string[]; photographer?: string | null;
  start?: undefined; end?: undefined; ooo?: false; who?: undefined;
};

export type Legend = { name: string; color: number | "shoot" }[];

const CAMERA = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;

/** A content shoot chip: links to its plan. */
export function ShootChip({ item, className }: { item: ShootItem; className: string }) {
  return (
    <Link href={item.href} className={`${className} shoot-ev`}
      title={[`Content shoot · ${item.title}`, item.timeLabel, item.crew?.length && `Team: ${item.crew.join(", ")}`, item.photographer && `Photographer: ${item.photographer}`].filter(Boolean).join(" · ")}>
      <b>{CAMERA}{item.timeLabel && <span className="mg-time">{item.timeLabel} </span>}{item.title}</b>
      {!!item.crew?.length && <span className="shoot-crew">{item.crew.join(", ")}</span>}
    </Link>
  );
}

export function CalLegend({ legend }: { legend: Legend }) {
  return (
    <ul className="tw-legend" aria-label="Colors">
      {legend.map((l) => <li key={l.name}><i className={l.color === "shoot" ? "shoot-ev" : `who-${l.color}`} aria-hidden="true" />{l.name}</li>)}
    </ul>
  );
}

/** Everyone's week on one grid, each person in their own color; overlaps sit side by side. */
export function TogetherWeek({ days, today, nowMinutes, items, legend }: {
  days: { date: string; weekday: string; label: string }[];
  today: string;
  /** Minutes after midnight right now, in the agency's time zone, for the "now" line. */
  nowMinutes: number;
  /** date → that day's events */
  items: Record<string, WeekItem[]>;
  legend: Legend;
}) {
  const timed = Object.values(items).flat().filter((i): i is Exclude<WeekItem, ShootItem> => i.start !== undefined);
  const first = Math.min(7, ...timed.map((i) => Math.floor(i.start! / 60)));
  const last = Math.max(19, ...timed.map((i) => Math.ceil(i.end! / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const hourLabel = (h: number) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

  return (
    <div className="tw">
      <CalLegend legend={legend} />
      <div className="tw-scroll">
        <div className="tw-grid" style={{ "--tw-hours": hours.length, "--tw-hour": `${HOUR}px`, "--tw-days": days.length } as React.CSSProperties}>
          <div className="tw-corner" />
          {days.map((d) => (
            <div key={d.date} className={`tw-head ${d.date === today ? "today" : ""}`} aria-current={d.date === today ? "date" : undefined}>
              <small>{d.date === today ? `Today · ${d.weekday}` : d.weekday}</small> {d.label}
            </div>
          ))}

          <div className="tw-gutter tw-allday-label">All day</div>
          {days.map((d) => (
            <div key={d.date} className={`tw-allday ${d.date === today ? "today" : ""}`}>
              {(items[d.date] ?? []).filter((i) => i.start === undefined).map((i) => "shoot" in i ? <ShootChip key={i.key} item={i} className="tw-ev" /> : (
                <EventChip key={i.key} info={i.info} className={`tw-ev who-${i.color} ${i.ooo ? "ooo" : ""}`} title={`${i.who} · ${i.title}`}>
                  <b>{i.ooo ? `${i.who} out` : i.title}</b>
                </EventChip>
              ))}
            </div>
          ))}

          <div className="tw-gutter">
            {hours.map((h) => <span key={h} style={{ top: (h - first) * HOUR }}>{hourLabel(h)}</span>)}
          </div>
          {days.map((d) => {
            const placed = layoutDay((items[d.date] ?? []).filter((i): i is Exclude<WeekItem, ShootItem> => i.start !== undefined).map((i) => ({ ...i, start: i.start!, end: i.end! })));
            return (
              <div key={d.date} className={`tw-day ${d.date === today ? "today" : ""}`}>
                {d.date === today && nowMinutes >= first * 60 && nowMinutes <= last * 60 && (
                  <div className="tw-now" style={{ top: ((nowMinutes - first * 60) / 60) * HOUR }} aria-hidden="true" />
                )}
                {placed.map((i) => {
                  const top = ((i.start - first * 60) / 60) * HOUR;
                  const height = Math.max(22, ((i.end - i.start) / 60) * HOUR - 2);
                  return (
                    <EventChip key={i.key} info={i.info} className={`tw-ev timed who-${i.color} ${i.ooo ? "ooo" : ""} ${i.cols > 1 ? "shared" : ""}`}
                      style={{ top, height, left: `calc(${(i.col / i.cols) * 100}% + 2px)`, width: `calc(${100 / i.cols}% - 4px)` }}
                      title={`${i.who} · ${i.timeLabel} · ${i.title}`}>
                      <b>{i.ooo ? `${i.who} out` : i.title}</b>
                      {height > 34 && i.cols < 3 && <span>{i.timeLabel}</span>}
                    </EventChip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
