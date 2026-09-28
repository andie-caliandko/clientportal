"use client";

import { createContext, useContext, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const Ctx = createContext<{ filter: string; set: (f: string) => void } | null>(null);

/**
 * Filters the task board in place: cards stay on the page and are shown or
 * hidden by their data-due tags, so nothing reloads and the page doesn't move.
 * The address bar keeps the filter, so a refresh or shared link opens the same view.
 */
export function TaskFilterRoot({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [filter, setFilter] = useState(initial);
  const set = (f: string) => {
    setFilter(f);
    const url = new URL(window.location.href);
    if (f === "all") url.searchParams.delete("due");
    else url.searchParams.set("due", f);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <Ctx.Provider value={{ filter, set }}>
      <div className="tf" data-filter={filter}>{children}</div>
    </Ctx.Provider>
  );
}

export function FilterTabs({ options }: { options: { key: string; label: string; count?: number; alert?: boolean }[] }) {
  const ctx = useContext(Ctx)!;
  return (
    <div className="view-switch due-filter" role="group" aria-label="Filter by due date">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={ctx.filter === o.key} className={o.alert ? "has-overdue" : ""} onClick={() => ctx.set(o.key)}>
          {o.label}{o.count !== undefined ? ` · ${o.count}` : ""}
        </button>
      ))}
    </div>
  );
}

/** A stat box that applies a filter when clicked. */
export function FilterStat({ filter, className, children }: { filter: string; className: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx)!;
  return (
    <button type="button" className={`stat ${className}`} aria-pressed={ctx.filter === filter} onClick={() => ctx.set(ctx.filter === filter ? "all" : filter)}>
      {children}
    </button>
  );
}

/** "Show tasks for": switches person without jumping to the top of the page. */
export function WhoSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <label htmlFor="who" className="note">Show tasks for</label>
      <select className="sel" id="who" value={value} onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value === "all") next.delete("who");
        else next.set("who", e.target.value);
        // Keep whatever due filter is showing right now.
        const due = new URL(window.location.href).searchParams.get("due");
        if (due) next.set("due", due);
        router.replace(`${path}?${next}`, { scroll: false });
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
