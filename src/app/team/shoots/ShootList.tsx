import Link from "next/link";
import { shootRepeatLabel, timeLabel } from "@/lib/shoots";
import { CancelShoot, ShootEditor, type ShootRow } from "./ShootForms";

export type ShootItem = ShootRow & { clientName?: string; tasksDone: number; tasksTotal: number; nextTask: { title: string; due: string } | null };

/** Shoots as date cards: when, where, how often, and how planning is going. */
export function ShootList({ shoots, canEdit, showClient, timeZone }: { shoots: ShootItem[]; canEdit: boolean; showClient: boolean; timeZone: string }) {
  const part = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  return (
    <ul className="list shoots">
      {shoots.map((s) => (
        <li key={s.id} className="meet">
          <span className="date"><small>{part(s.shoot_date, { weekday: "short" })}</small><b>{part(s.shoot_date, { day: "numeric" })}</b><small>{part(s.shoot_date, { month: "short" })}</small></span>
          <span className="shoot-body">
            <b>{showClient ? <Link href={`/team/clients/${s.client_id}`}>{s.clientName}</Link> : "Content shoot"}</b>
            <span className="note">{[timeLabel(s.start_time), s.location].filter(Boolean).join(" · ") || "Time and place to come"}</span>
            {s.details && <span className="note shoot-details">{s.details}</span>}
            <span className="row" style={{ gap: 6, alignItems: "center" }}>
              {s.repeat && <span className="pill info">{shootRepeatLabel(s.repeat)}</span>}
              {s.tasksTotal > 0 && <span className={`pill ${s.tasksDone === s.tasksTotal ? "ok" : "warn"}`}>Planning {s.tasksDone} of {s.tasksTotal}</span>}
              {s.nextTask && <span className="note">Next: {s.nextTask.title.split(" · ")[0]}, {new Date(s.nextTask.due).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}</span>}
            </span>
          </span>
          {canEdit && (
            <span className="r row" style={{ gap: 10, alignItems: "center" }}>
              <ShootEditor shoot={s} label="Edit" className="btn sm line" />
              <CancelShoot id={s.id} inSeries={!!s.series_id} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
