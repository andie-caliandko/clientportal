import { layoutDay } from "@/lib/calendarLayout";
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
};

/** Everyone's week on one grid, each person in their own color; overlaps sit side by side. */
export function TogetherWeek({ days, today, nowMinutes, items, legend }: {
  days: { date: string; weekday: string; label: string }[];
  today: string;
  /** Minutes after midnight right now, in the agency's time zone, for the "now" line. */
  nowMinutes: number;
  /** date → that day's events */
  items: Record<string, WeekItem[]>;
  legend: { name: string; color: number }[];
}) {
  const timed = Object.values(items).flat().filter((i) => i.start !== undefined);
  const first = Math.min(7, ...timed.map((i) => Math.floor(i.start! / 60)));
  const last = Math.max(19, ...timed.map((i) => Math.ceil(i.end! / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const hourLabel = (h: number) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

  return (
    <div className="tw">
      <ul className="tw-legend" aria-label="Colors">
        {legend.map((l) => <li key={l.name}><i className={`who-${l.color}`} aria-hidden="true" />{l.name}</li>)}
      </ul>
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
              {(items[d.date] ?? []).filter((i) => i.start === undefined).map((i) => (
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
            const placed = layoutDay((items[d.date] ?? []).filter((i) => i.start !== undefined).map((i) => ({ ...i, start: i.start!, end: i.end! })));
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
