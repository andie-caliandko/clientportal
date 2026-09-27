/** How many teammate colors there are (see .who-0 … .who-7 in globals.css). */
export const MEMBER_COLORS = 8;

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Gives each teammate their own color. Each person keeps the same color as
 * the team grows, and nobody shares one until there are more than 8 people.
 */
export function memberColors(userIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const id of [...new Set(userIds)].sort()) {
    let slot = hash(id) % MEMBER_COLORS;
    if (taken.size < MEMBER_COLORS) while (taken.has(slot)) slot = (slot + 1) % MEMBER_COLORS;
    taken.add(slot);
    out.set(id, slot);
  }
  return out;
}
