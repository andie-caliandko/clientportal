"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/team", label: "Tasks" },
  { href: "/team/clients", label: "Clients" },
  { href: "/team/team", label: "Team", adminOnly: true },
  { href: "/team/settings", label: "Agency settings", adminOnly: true },
];

export function TeamNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Workspace">
      {LINKS.filter((l) => isAdmin || !l.adminOnly).map((l) => {
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
