import Link from "next/link";
import { EventChip } from "./EventDialog";
import { CalLegend, ShootChip, type Legend, type WeekItem } from "./TogetherWeek";

const SHOW = 4;

/** A month of everyone's events, each person in their color. Click a date for its full day. */
export function MonthGrid({ days, month, today, items, legend, dayHref }: {
  days: string[];
  /** "2026-09": days outside it are dimmed. */
  month: string;
  today: string;
  items: Record<string, WeekItem[]>;
  legend: Legend;
  dayHref: (date: string) => string;
}) {
  const weekdays = days.slice(0, 7).map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }));
  return (
    <div className="tw">
      <CalLegend legend={legend} />
      <div className="tw-scroll">
        <div className="mg">
          {weekdays.map((w) => <div key={w} className="mg-wd">{w}</div>)}
          {days.map((d) => {
            // Shoots first, then all-day things, then by start time.
            const list = [...(items[d] ?? [])].sort((a, b) => ("shoot" in a ? -2 : a.start ?? -1) - ("shoot" in b ? -2 : b.start ?? -1));
            const more = list.length - SHOW;
            return (
              <div key={d} className={`mg-day ${d.slice(0, 7) === month ? "" : "other"} ${d === today ? "today" : ""}`}>
                <span className="mg-top">
                  <Link className="mg-num" href={dayHref(d)} aria-label={`Open ${d}`} aria-current={d === today ? "date" : undefined}>{+d.slice(8)}</Link>
                  {d === today && <span className="mg-today">Today</span>}
                </span>
                {list.slice(0, more > 0 ? SHOW - 1 : SHOW).map((i) => "shoot" in i ? <ShootChip key={i.key} item={i} className="tw-ev mg-ev" /> : (
                  <EventChip key={i.key} info={i.info} className={`tw-ev mg-ev who-${i.color} ${i.ooo ? "ooo" : ""}`} title={`${i.who} · ${i.timeLabel} · ${i.title}`}>
                    <b>{i.start !== undefined && <span className="mg-time">{i.timeLabel.split("–")[0]} </span>}{i.ooo ? `${i.who} out` : i.title}</b>
                  </EventChip>
                ))}
                {more > 0 && <Link className="mg-more" href={dayHref(d)}>+{more + 1} more</Link>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
