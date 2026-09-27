export type Placed<T> = T & { col: number; cols: number };

/**
 * Side-by-side placement for one day's timed events: events that overlap share
 * the width, each in its own column, like Google Calendar.
 */
export function layoutDay<T extends { start: number; end: number }>(events: T[]): Placed<T>[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let groupEnd = -Infinity;
  const colEnds: number[] = [];
  const close = () => {
    const cols = Math.max(1, ...group.map((e) => e.col + 1));
    group.forEach((e) => (e.cols = cols));
    out.push(...group);
    group = [];
    colEnds.length = 0;
  };
  for (const e of sorted) {
    // A new group starts once nothing in the current one is still going.
    if (group.length && e.start >= groupEnd) close();
    let col = colEnds.findIndex((end) => end <= e.start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = e.end;
    group.push({ ...e, col, cols: 1 });
    groupEnd = group.length === 1 ? e.end : Math.max(groupEnd, e.end);
  }
  if (group.length) close();
  return out;
}
