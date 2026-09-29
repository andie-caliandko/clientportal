"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "./actions";

// Drag task cards between columns (To do, In progress, Waiting on client) or
// onto Done. The buttons on each card still work for phones and keyboards.

type Ctx = { dragging: string | null; setDragging: (id: string | null) => void; enabled: boolean; drop: (status: string) => void; gone: Set<string> };
const DragCtx = createContext<Ctx | null>(null);

export function DragBoard({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [dragging, setDragging] = useState<string | null>(null);
  // Cards dropped on Done disappear right away, before the save finishes.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const drop = (status: string) => {
    const id = dragging;
    setDragging(null);
    if (!id) return;
    if (status === "done") setGone((g) => new Set(g).add(id));
    startTransition(async () => {
      await setTaskStatus(id, status);
      router.refresh();
    });
  };
  return (
    <DragCtx.Provider value={{ dragging, setDragging, enabled, drop, gone }}>
      <div className={pending ? "board saving" : "board"}>{children}</div>
      {enabled && dragging && <DoneZone />}
    </DragCtx.Provider>
  );
}

function DoneZone() {
  const ctx = useContext(DragCtx)!;
  const [over, setOver] = useState(false);
  return (
    <div className={`done-zone ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); ctx.drop("done"); }}>
      Drop here to mark done
    </div>
  );
}

export function DropColumn({ status, children }: { status: string; children: React.ReactNode }) {
  const ctx = useContext(DragCtx)!;
  const [over, setOver] = useState(false);
  return (
    <div className={`col ${over ? "drop-over" : ""}`}
      onDragOver={(e) => { if (ctx.enabled && ctx.dragging) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); ctx.drop(status); }}>
      {children}
    </div>
  );
}

export function DragCard({ id, tags, children }: { id: string; /** Due-date filter tags, e.g. "overdue week". */ tags?: string; children: React.ReactNode }) {
  const ctx = useContext(DragCtx)!;
  if (ctx.gone.has(id)) return null;
  return (
    <div draggable={ctx.enabled} data-due={tags} className={ctx.dragging === id ? "dragging" : undefined}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); ctx.setDragging(id); }}
      onDragEnd={() => ctx.setDragging(null)}>
      {children}
    </div>
  );
}
