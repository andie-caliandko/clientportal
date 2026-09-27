"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { DueItem, RhythmWeek } from "@/lib/rhythm";
import { toggleRhythm } from "./actions";

const when = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} ago` : `In ${d} days`);

function Ring({ done, total }: { done: number; total: number }) {
  const r = 20, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg className="ring" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="track" />
      <circle cx="24" cy="24" r={r} className="fill" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

export function RhythmPanel({ rhythm, current, ranges, checks, canEdit, dueDates, calendarName, teamProgress }: {
  rhythm: RhythmWeek[];
  current: number;
  ranges: Record<number, string>;
  /** My own check-offs this month, keyed "week-item". */
  checks: Record<string, boolean>;
  /** Admins only: everyone's progress on this week's list. */
  teamProgress: { id: string; name: string; weekDone: number; weekTotal: number; soFarDone: number; soFarTotal: number; items: number[] }[] | null;
  canEdit: boolean;
  dueDates: DueItem[];
  /** Name of the connected Google due-dates calendar, if any. */
  calendarName: string | null;
}) {
  const [week, setWeek] = useState(current);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(checks, (state, u: { key: string; on: boolean }) => {
    const next = { ...state };
    if (u.on) next[u.key] = true;
    else delete next[u.key];
    return next;
  });
  const [person, setPerson] = useState<string | null>(null);
  const currentItems = rhythm.find((w) => w.week === current)?.items ?? [];
  const r = rhythm.find((w) => w.week === week);
  if (!rhythm.length && !dueDates.length) return null;
  const upcoming = dueDates.filter((d) => d.daysAway >= 0).slice(0, 4);

  return (
    <section className="rhythm" aria-labelledby="rh-title">
      <div className="rh-head">
        <div>
          <p className="eyebrow">Monthly rhythm</p>
          <h2 id="rh-title">Week {week}{r ? `: ${r.title}` : ""}</h2>
        </div>
        <div className="rh-weeks">
          {rhythm.map((w) => (
            <button key={w.week} type="button" aria-pressed={w.week === week} className={w.week === current ? "now" : ""}
              onClick={() => setWeek(w.week)}>
              Week {w.week}
            </button>
          ))}
        </div>
      </div>
      <div className="rh-this">
        <p className="eyebrow">{week === current ? "This week" : `Week ${week}`} · {ranges[week]}</p>
      <p className="note">Your checklist. Check things off as you go; it&apos;s just for you{teamProgress ? ", and you can see everyone's progress below" : ", and admins can see your progress"}.</p>
      <ul className="rh-list">
        {r?.items.map((item, i) => {
          const key = `${week}-${i}`;
          const by = optimistic[key];
          return (
            <li key={key}>
              <label>
                <input type="checkbox" checked={!!by} disabled={!canEdit}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    startTransition(async () => {
                      setOptimistic({ key, on: checked });
                      await toggleRhythm({ week, item: i, checked });
                    });
                  }} />
                <span>
                  {item.title}
                  <small>{item.detail}</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      </div>
      {calendarName && (
        <div className="due-strip" aria-label="Coming up">
          <p className="eyebrow">Coming up · from {calendarName}</p>
          {upcoming.length ? (
            <ul>
              {upcoming.map((d) => (
                <li key={d.id} className={d.daysAway <= 3 ? "soon" : ""}>
                  <b>{d.title}</b>
                  <span>{d.label} · {when(d.daysAway)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Nothing due in the next few weeks.</p>
          )}
        </div>
      )}
      {teamProgress && teamProgress.length > 0 && (
        <div className="team-progress">
          <p className="eyebrow">Team progress · week {current}</p>
          <ul>
            {teamProgress.map((p) => (
              <li key={p.id}>
                <button type="button" aria-expanded={person === p.id} onClick={() => setPerson(person === p.id ? null : p.id)}
                  aria-label={`${p.name}: ${p.weekDone} of ${p.weekTotal} done this week`}>
                  <Ring done={p.weekDone} total={p.weekTotal} />
                  <span><b>{p.name.split(" ")[0]}</b><small>{p.weekDone} of {p.weekTotal} this week · {p.soFarDone} of {p.soFarTotal} this month</small></span>
                </button>
                {person === p.id && (
                  <ul className="who-list">
                    {currentItems.map((it, i) => (
                      <li key={i} className={p.items.includes(i) ? "done" : ""}>{p.items.includes(i) ? "Done: " : "Not yet: "}{it.title}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
