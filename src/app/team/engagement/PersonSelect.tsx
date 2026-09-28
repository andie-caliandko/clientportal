"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Admins: whose work to show. Switches without jumping to the top of the page. */
export function PersonSelect({ value, options, param = "am", label = "Account manager" }: { value: string; options: { value: string; label: string }[]; param?: string; label?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <label htmlFor={`pick-${param}`} className="note">{label}</label>
      <select className="sel" id={`pick-${param}`} value={value} onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set(param, e.target.value);
        router.replace(`${path}?${next}`, { scroll: false });
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
