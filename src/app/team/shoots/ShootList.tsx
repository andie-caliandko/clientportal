import Link from "next/link";
import { daysBetween, shootDates, shootRepeatLabel, timeLabel } from "@/lib/shoots";
import { CancelShoot, ShootEditor, type ShootRow, type TeamPerson } from "./ShootForms";

export type ShootItem = ShootRow & {
  clientName?: string; managerId?: string | null; tasksDone: number; tasksTotal: number; nextTask: { title: string; due: string } | null;
  plan: "none" | "draft" | "sent";
};

/** Shoots as date cards: when, where, how often, and how planning is going. */
export function ShootList({ shoots, canEdit, showClient, timeZone, team }: { shoots: ShootItem[]; canEdit: boolean; showClient: boolean; timeZone: string; team: TeamPerson[] }) {
  const names = (ids: string[] | null | undefined) => (ids ?? []).map((id) => team.find((t) => t.user_id === id)?.display_name).filter(Boolean).join(", ");
  const part = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  return (
    <ul className="list shoots">
      {shoots.map((s) => (
        <li key={s.id} className="meet">
          <span className="date"><small>{part(s.shoot_date, { weekday: "short" })}</small><b>{part(s.shoot_date, { day: "numeric" })}</b><small>{part(s.shoot_date, { month: "short" })}</small></span>
          <span className="shoot-body">
            <b>{showClient ? <Link href={`/team/clients/${s.client_id}`}>{s.clientName}</Link> : "Content shoot"}</b>
            {s.end_date && s.end_date > s.shoot_date && <span className="note"><b>{daysBetween(s.shoot_date, s.end_date) + 1}-day shoot</b> · {shootDates(s.shoot_date, s.end_date)}</span>}
            <span className="note">{[timeLabel(s.start_time), s.location].filter(Boolean).join(" · ") || "Time and place to come"}</span>
            {((s.crew ?? []).length > 0 || s.photographer) && (
              <span className="note">{[names(s.crew) && `Team: ${names(s.crew)}`, s.photographer && `Photographer: ${s.photographer}`].filter(Boolean).join(" · ")}</span>
            )}
            {s.details && <span className="note shoot-details">{s.details}</span>}
            <span className="row" style={{ gap: 6, alignItems: "center" }}>
              {s.repeat && <span className="pill info">{shootRepeatLabel(s.repeat)}</span>}
              {s.tasksTotal > 0 && <span className={`pill ${s.tasksDone === s.tasksTotal ? "ok" : "warn"}`}>Planning {s.tasksDone} of {s.tasksTotal}</span>}
              {s.plan !== "none" && <span className={`pill ${s.plan === "sent" ? "ok" : ""}`}>{s.plan === "sent" ? "Plan sent" : "Plan in draft"}</span>}
              {s.nextTask && <span className="note">Next: {s.nextTask.title.split(" · ")[0]}, {new Date(s.nextTask.due).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}</span>}
            </span>
          </span>
          <span className="r row" style={{ gap: 10, alignItems: "center" }}>
            <Link href={`/team/shoots/${s.id}`} className="btn sm">{s.plan === "none" ? "Plan shoot" : "Shoot plan"}</Link>
            {canEdit && <ShootEditor shoot={s} team={team} label="Edit" className="btn sm line" />}
            {canEdit && <CancelShoot id={s.id} inSeries={!!s.series_id} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
