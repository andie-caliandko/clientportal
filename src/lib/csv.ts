/** Splits CSV text into rows of cells (handles quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** "2026-03-15", "3/15/2026" or "3/15/26" → "2026-03-15". Null if it isn't a date. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  const d = Date.parse(t);
  if (!Number.isNaN(d) && /[a-z]/i.test(t)) { const x = new Date(d); return valid(x.getFullYear(), x.getMonth() + 1, x.getDate()); }
  return null;
}
function valid(y: number, mo: number, d: number) {
  const x = new Date(Date.UTC(y, mo - 1, d));
  return x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? x.toISOString().slice(0, 10) : null;
}

/** "$1,250.00", "1250", "(300)" → 1250 / -300. Null if it isn't money. */
export function parseMoney(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()$,\s-]/g, ""));
  return Number.isFinite(n) && t.replace(/[()$,\s.-]/g, "").length ? (negative ? -n : n) : null;
}

export type RevenueRow = { paid_on: string; amount: number; client_name: string | null; note: string | null };

/**
 * Reads a revenue spreadsheet. Columns are found by their header (date, amount,
 * client, note), in any order; without headers it assumes date, amount, client, note.
 */
export function readRevenueCsv(text: string): { rows: RevenueRow[]; skipped: number } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], skipped: 0 };
  const head = all[0].map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const hasHeader = !parseDate(all[0][0] ?? "") && head.some((h) => /date|amount|total|paid|client/.test(h));
  const col = hasHeader
    ? { date: find("date", "paid on", "day"), amount: find("amount", "total", "paid", "revenue", "price"), client: find("client", "customer", "name", "company"), note: find("note", "description", "memo", "invoice", "project") }
    : { date: 0, amount: 1, client: 2, note: 3 };
  let skipped = 0;
  const rows: RevenueRow[] = [];
  for (const r of hasHeader ? all.slice(1) : all) {
    const paid_on = col.date >= 0 ? parseDate(r[col.date] ?? "") : null;
    const amount = col.amount >= 0 ? parseMoney(r[col.amount] ?? "") : null;
    if (!paid_on || amount === null || amount === 0) { skipped++; continue; }
    rows.push({ paid_on, amount, client_name: col.client >= 0 ? r[col.client] || null : null, note: col.note >= 0 && col.note !== col.amount ? r[col.note] || null : null });
  }
  return { rows, skipped };
}
