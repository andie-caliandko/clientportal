"use client";

import { useState } from "react";

/**
 * The shoot page's Plan and Gallery tabs. Both stay loaded, so switching never loses unsaved plan
 * edits; the address keeps the tab (…?tab=gallery) so links and refreshes land on the same one.
 */
export function ShootTabs({ initial, plan, gallery, galleryCount }: {
  initial: "plan" | "gallery";
  plan: React.ReactNode;
  gallery: React.ReactNode;
  galleryCount: number;
}) {
  const [tab, setTab] = useState(initial);
  const pick = (t: "plan" | "gallery") => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "gallery") url.searchParams.set("tab", "gallery");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
  return (
    <>
      <div className="tabs shoot-tabs" role="tablist" aria-label="Shoot">
        <button type="button" role="tab" id="tab-plan" aria-controls="panel-plan" aria-selected={tab === "plan"} onClick={() => pick("plan")}>Plan</button>
        <button type="button" role="tab" id="tab-gallery" aria-controls="panel-gallery" aria-selected={tab === "gallery"} onClick={() => pick("gallery")}>
          Gallery {galleryCount > 0 && <span className="tab-count">{galleryCount}</span>}
        </button>
      </div>
      <div role="tabpanel" id="panel-plan" aria-labelledby="tab-plan" hidden={tab !== "plan"} className="shoot-tab">{plan}</div>
      <div role="tabpanel" id="panel-gallery" aria-labelledby="tab-gallery" hidden={tab !== "gallery"} className="shoot-tab">{gallery}</div>
    </>
  );
}
