"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Admins: whose accounts to show. Switches without jumping to the top of the page. */
export function PersonSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <label htmlFor="eg-am" className="note">Account manager</label>
      <select className="sel" id="eg-am" value={value} onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set("am", e.target.value);
        router.replace(`${path}?${next}`, { scroll: false });
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
