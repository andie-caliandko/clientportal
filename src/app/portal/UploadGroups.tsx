"use client";

import { useState } from "react";
import { FilePreview } from "./FilePreview";

export type UploadItem = { id: string; url: string | null; name: string; kind: string; at: string; drive?: "in" | "copying" | null; driveUrl?: string | null };

const KIND: Record<string, string> = { branding: "Branding", content: "Content", task: "Task", message: "Message" };
const SHOWN = 12;

/**
 * Uploads grouped by day and type ("Content · 24 files · Oct 5"), each a grid
 * of small previews. The newest group starts open; big groups show 12 at first.
 * Clicking a file opens it and steps left and right through its group.
 */
export function UploadGroups({ items, timeZone, showKind = true }: { items: UploadItem[]; timeZone: string; showKind?: boolean }) {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  const groups: { key: string; kind: string; date: string; files: UploadItem[] }[] = [];
  for (const it of items) {
    const key = `${day(it.at)}-${it.kind}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.files.push(it);
    else groups.push({ key, kind: it.kind, date: it.at, files: [it] });
  }
  return (
    <div className="up-groups">
      {groups.map((g, i) => <Group key={g.key} group={g} open={i === 0} timeZone={timeZone} showKind={showKind} />)}
    </div>
  );
}

function Group({ group, open, timeZone, showKind }: { group: { kind: string; date: string; files: UploadItem[] }; open: boolean; timeZone: string; showKind: boolean }) {
  const [all, setAll] = useState(false);
  const gallery = group.files.flatMap((f) => (f.url ? [{ url: f.url, name: f.name }] : []));
  const shown = all ? group.files : group.files.slice(0, SHOWN);
  const copying = group.files.filter((f) => f.drive === "copying").length;
  const inDrive = group.files.filter((f) => f.drive === "in").length;
  const date = new Date(group.date).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
  return (
    <details className="up-group" open={open}>
      <summary>
        {showKind && <span className="pill info">{KIND[group.kind] ?? group.kind}</span>}
        <b>{group.files.length} file{group.files.length === 1 ? "" : "s"}</b>
        <span className="note">{date}</span>
        <span className="r">
          {copying > 0 && <span className="pill warn">{copying} copying to Drive</span>}
          {inDrive > 0 && !copying && <span className="pill ok">In Drive</span>}
        </span>
      </summary>
      <ul className="up-grid">
        {shown.map((f) => (
          <li key={f.id} title={f.name}>
            {f.url
              ? <FilePreview url={f.url} name={f.name} thumbnail className="up-tile" label={f.name}
                  gallery={gallery} index={gallery.findIndex((x) => x.url === f.url)} />
              : <span className="up-tile">{f.name}</span>}
          </li>
        ))}
      </ul>
      {group.files.length > SHOWN && (
        <button type="button" className="linkbtn note" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${group.files.length}`}
        </button>
      )}
    </details>
  );
}
