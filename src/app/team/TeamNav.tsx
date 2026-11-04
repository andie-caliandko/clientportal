"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/team", label: "Tasks" },
  { href: "/team/clients", label: "Clients" },
  { href: "/team/calendar", label: "Calendar" },
  { href: "/team/shoots", label: "Content shoots" },
  { href: "/team/engagement", label: "Daily engagement", hideForCreators: true },
  { href: "/team/time", label: "Time tracker" },
  { href: "/team/goals", label: "Goals" },
  { href: "/team/templates", label: "Templates & SOPs" },
  { href: "/team/team", label: "Team", adminOnly: true },
  { href: "/team/settings", label: "Settings", adminOnly: true },
];

export function TeamNav({ isAdmin, isCreator = false, showCeo = false, showTracker = false }: { isAdmin: boolean; isCreator?: boolean; showCeo?: boolean; showTracker?: boolean }) {
  const path = usePathname();
  const links = [...(showCeo ? [{ href: "/team/ceo", label: "CEO dashboard" }] : []), ...(showTracker ? [{ href: "/team/ceo/tracker", label: "CEO tracker" }] : []), ...LINKS]
    .filter((l) => (isAdmin || !("adminOnly" in l && l.adminOnly)) && !(isCreator && "hideForCreators" in l && l.hideForCreators));
  // The most specific link that matches is the current page (so the tracker doesn't also light up the dashboard).
  const current = links.map((l) => l.href).filter((h) => (h === "/team" ? path === "/team" : path === h || path.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="nav" aria-label="Workspace">
      {links.map((l) => {
        const active = l.href === current;
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
