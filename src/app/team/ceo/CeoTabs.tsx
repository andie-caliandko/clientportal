"use client";

import { useState } from "react";

/** "Clients this month" and "Starting later" as tabs on one panel; switching doesn't reload the page. */
export function CeoTabs({ tabs }: { tabs: { id: string; label: string; count: number; content: React.ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === on) ?? tabs[0];
  return (
    <div className="panel">
      <div className="tabs ceo-tabs" role="tablist" aria-label="Clients">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={t.id === current.id} aria-controls={`panel-${t.id}`} onClick={() => setOn(t.id)}>
            {t.label} <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== current.id} style={{ display: t.id === current.id ? "grid" : "none", gap: 14 }}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
