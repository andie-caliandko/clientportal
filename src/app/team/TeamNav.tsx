"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/team", label: "Tasks" },
  { href: "/team/clients", label: "Clients" },
  { href: "/team/calendar", label: "Calendar" },
  { href: "/team/engagement", label: "Daily engagement", hideForCreators: true },
  { href: "/team/time", label: "Time tracker" },
  { href: "/team/templates", label: "Agency templates" },
  { href: "/team/team", label: "Team", adminOnly: true },
  { href: "/team/settings", label: "Settings", adminOnly: true },
];

export function TeamNav({ isAdmin, isCreator = false, showCeo = false }: { isAdmin: boolean; isCreator?: boolean; showCeo?: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Workspace">
      {[...(showCeo ? [{ href: "/team/ceo", label: "CEO dashboard" }] : []), ...LINKS].filter((l) => (isAdmin || !("adminOnly" in l && l.adminOnly)) && !(isCreator && "hideForCreators" in l && l.hideForCreators)).map((l) => {
        const active = l.href === "/team" ? path === "/team" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
