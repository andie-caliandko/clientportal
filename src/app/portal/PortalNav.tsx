"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Section } from "./sections";

const ICONS: Record<Section, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  messages: <path d="M4 5h16v11H9l-5 4z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  files: <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  strategy: <><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  meetings: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  logins: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
};
const LABELS: Record<Section, string> = {
  home: "Home", tasks: "Tasks", messages: "Messages", activity: "Activity",
  files: "Files", strategy: "Strategy", analytics: "Analytics", meetings: "Meetings", logins: "Logins",
};

export function PortalNav({ base, openTasks, newMessages }: { base: string; openTasks: number; newMessages: number }) {
  const current = (usePathname().slice(base.length).split("/")[1] || "home") as Section;
  // Opening Messages reads them; hide the count from then on (the menu doesn't reload between pages).
  const [readThrough, setReadThrough] = useState(0);
  useEffect(() => {
    if (current === "messages") setReadThrough(newMessages);
  }, [current, newMessages]);
  const unread = current === "messages" ? 0 : Math.max(0, newMessages - readThrough);
  return (
    <nav className="nav" aria-label="Your portal">
      {(Object.keys(LABELS) as Section[]).map((s) => (
        <Link key={s} href={s === "home" ? base : `${base}/${s}`} aria-current={s === current ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{ICONS[s]}</svg>
          {LABELS[s]}
          {s === "tasks" && openTasks > 0 && <span className="count">{openTasks}</span>}
          {s === "messages" && unread > 0 && <span className="count" aria-label={`${unread} new`}>{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
