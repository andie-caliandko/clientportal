"use client";

import { useState } from "react";

/** Tabs on one panel (like "Clients this month" and "Starting later"); switching doesn't reload the page. */
export function CeoTabs({ tabs, label = "Clients" }: { tabs: { id: string; label: string; count: number; content: React.ReactNode }[]; label?: string }) {
  const [on, setOn] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === on) ?? tabs[0];
  return (
    <div className="panel">
      <div className="tabs ceo-tabs" role="tablist" aria-label={label}>
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
