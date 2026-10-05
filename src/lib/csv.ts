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

/** A cell with one or more dates ("Aug 4, 2026, Sep 15, 2026"): the last one, when it was fully paid. */
function lastDate(text: string): string | null {
  const one = parseDate(text);
  if (one) return one;
  const named = text.match(/[A-Za-z]{3,9}\.? \d{1,2}, \d{4}/g);
  if (named?.length) return parseDate(named[named.length - 1]);
  const numeric = text.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/g);
  return numeric?.length ? parseDate(numeric[numeric.length - 1]) : null;
}

export type RevenueRow = { paid_on: string; amount: number; client_name: string | null; note: string | null };

/**
 * Reads a revenue spreadsheet. Columns are found by their header, in any order
 * (exact names like HoneyBook's TRANSACTION_DATE and TOTAL_AMOUNT win over loose
 * matches like "date"); without headers it assumes date, amount, client, note.
 * Rows marked unpaid are skipped, and refunds are taken off.
 */
export function readRevenueCsv(text: string): { rows: RevenueRow[]; skipped: number } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], skipped: 0 };
  const head = all[0].map((h) => h.toLowerCase().replace(/\(s\)/g, "").replace(/[_-]+/g, " ").trim());
  // Exact header names first, then any header containing one of the words.
  const find = (exact: string[], loose: string[]) => {
    for (const e of exact) { const i = head.indexOf(e); if (i >= 0) return i; }
    return head.findIndex((h) => loose.some((n) => h.includes(n)));
  };
  const hasHeader = !parseDate(all[0][0] ?? "") && head.some((h) => /date|amount|total|paid|client/.test(h));
  const col = hasHeader
    ? {
        date: find(["transaction date", "date paid", "paid on", "payment date", "paid date", "date"], ["date", "day"]),
        // What was actually paid wins over an invoice total (an unpaid invoice has a total but $0 paid).
        amount: find(["amount paid", "paid amount", "total amount", "amount", "total"], ["amount paid", "amount", "total", "revenue", "price"]),
        client: find(["project name", "invoice project", "client", "client name", "customer", "company"], ["client", "customer", "company", "name"]),
        note: find(["payment name", "invoice", "memo", "note", "notes", "description"], ["memo", "note", "description", "invoice"]),
        status: find(["payment status", "status"], []),
        refunded: find(["refunded amount", "refund"], []),
      }
    : { date: 0, amount: 1, client: 2, note: 3, status: -1, refunded: -1 };
  let skipped = 0;
  const rows: RevenueRow[] = [];
  for (const r of hasHeader ? all.slice(1) : all) {
    // Only money that came in: skip unpaid, void or cancelled lines ("unpaid" isn't "paid").
    const status = col.status >= 0 ? (r[col.status] ?? "").toLowerCase().trim() : "";
    if (status && (/unpaid|void|cancel|draft|overdue|refunded/.test(status) || !/paid|complete|succeeded|closed/.test(status))) { skipped++; continue; }
    const paid_on = col.date >= 0 ? lastDate(r[col.date] ?? "") : null;
    const gross = col.amount >= 0 ? parseMoney(r[col.amount] ?? "") : null;
    const refund = col.refunded >= 0 ? parseMoney(r[col.refunded] ?? "") ?? 0 : 0;
    const amount = gross === null ? null : Math.round((gross - Math.abs(refund)) * 100) / 100;
    if (!paid_on || amount === null || amount === 0) { skipped++; continue; }
    // The payment name, plus the invoice number when it's its own column.
    const invoice = head.indexOf("invoice");
    const parts = [col.note >= 0 && col.note !== col.amount ? r[col.note] : "", invoice >= 0 && invoice !== col.note ? r[invoice] : ""];
    const note = parts.filter(Boolean).join(" · ") || null;
    rows.push({ paid_on, amount, client_name: col.client >= 0 ? r[col.client] || null : null, note });
  }
  return { rows, skipped };
}
