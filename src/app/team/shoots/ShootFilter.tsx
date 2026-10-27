"use client";

import { useRouter } from "next/navigation";

/** Admins: show every account manager's shoots, or one person's. */
export function ShootFilter({ who, managers }: { who: string; managers: { user_id: string; display_name: string }[] }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="shoot-who" className="sr-only">Account manager</label>
      <select className="sel" id="shoot-who" value={who} onChange={(e) => router.replace(e.target.value === "all" ? "/team/shoots" : `/team/shoots?who=${e.target.value}`, { scroll: false })}>
        <option value="all">Everyone</option>
        {managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
      </select>
    </>
  );
}
