import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe, wrap } from "./answersPdf";
import {
  DEFAULT_LEAD_ROWS, FUNNEL_ROWS, MAGNET, fmtMoney, fmtNum, fmtPct, leadKey, monthName, yearSummary,
  type Daily, type MonthData, type MonthSummary,
} from "./ceoTracker";
import { pdfBrand, type PdfBrand } from "./pdfBrand";

type Month = { month: string; data: MonthData; daily: Daily; s: MonthSummary };
const RATING = { green: rgb(0.24, 0.6, 0.38), yellow: rgb(0.9, 0.68, 0.15), red: rgb(0.8, 0.27, 0.24) };

/** A writer that flows text down letter pages, starting a new page when one fills up. */
function writer(doc: PDFDocument, b: PdfBrand, size: [number, number]) {
  const [W, H] = size, M = 44;
  const w = { page: doc.addPage(size) as PDFPage, y: H - M, W, H, M, width: W - M * 2 };
  const room = (h: number) => { if (w.y - h < M) { w.page = doc.addPage(size); w.y = H - M; } };
  const text = (s: string, x: number, y: number, font: PDFFont, sz: number, color = b.ink) =>
    w.page.drawText(pdfSafe(s, font), { x, y, size: sz, font, color });
  const right = (s: string, xRight: number, y: number, font: PDFFont, sz: number) => {
    const safe = pdfSafe(s, font);
    w.page.drawText(safe, { x: xRight - font.widthOfTextAtSize(safe, sz), y, size: sz, font, color: b.ink });
  };
  const para = (s: string, font: PDFFont, sz: number, x = M, width = w.width) => {
    for (const line of wrap(pdfSafe(s, font), font, sz, width)) { room(sz + 4); text(line, x, w.y - sz, font, sz); w.y -= sz + 4; }
  };
  const heading = (s: string) => { room(40); w.y -= 10; text(s, M, w.y - 16, b.heading, 16); w.y -= 22; w.page.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.5, color: b.line }); w.y -= 8; };
  /** Label and value pairs in `cols` columns. */
  const pairs = (items: [string, string][], cols = 2) => {
    const colW = w.width / cols, sz = 9.5, rowH = 16;
    for (let i = 0; i < items.length; i += cols) {
      room(rowH);
      items.slice(i, i + cols).forEach(([label, value], c) => {
        const x = M + c * colW;
        text(label, x, w.y - sz - 2, b.body, sz);
        right(value, x + colW - 14, w.y - sz - 2, b.label, sz);
      });
      w.y -= rowH;
    }
  };
  /** A simple table: header row tinted, numbers right-aligned in every column after the first. */
  const table = (head: string[], rows: string[][], widths?: number[], sz = 8.5) => {
    const ws = widths ?? [w.width * 0.3, ...head.slice(1).map(() => (w.width * 0.7) / (head.length - 1))];
    const rowH = sz + 8;
    const drawRow = (cells: string[], font: PDFFont, tint: boolean) => {
      room(rowH);
      if (tint) w.page.drawRectangle({ x: M, y: w.y - rowH, width: w.width, height: rowH, color: b.tint });
      let x = M;
      cells.forEach((c, i) => {
        const fit = fitText(c, font, sz, ws[i] - 8);
        if (i === 0) text(fit, x + 4, w.y - sz - 3, font, sz); else right(fit, x + ws[i] - 4, w.y - sz - 3, font, sz);
        x += ws[i];
      });
      w.y -= rowH;
    };
    drawRow(head, b.label, true);
    rows.forEach((r, i) => drawRow(r, i === rows.length - 1 && r[0] === "Total" ? b.label : b.body, false));
    w.y -= 4;
  };
  return { w, room, text, para, heading, pairs, table };
}

const fitText = (s: string, font: PDFFont, sz: number, max: number) => {
  let t = pdfSafe(s, font);
  if (font.widthOfTextAtSize(t, sz) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, sz) > max) t = t.slice(0, -1);
  return `${t}…`;
};

function monthPages(doc: PDFDocument, b: PdfBrand, agency: string, m: Month) {
  const { w, text, para, heading, pairs, table } = writer(doc, b, [612, 792]);
  const { s, data: d } = m;
  text(agency.toUpperCase(), w.M, w.y - 9, b.label, 8.5);
  w.y -= 18;
  text(`${monthName(m.month)}`, w.M, w.y - 26, b.heading, 28);
  w.y -= 34;
  text("CEO tracker", w.M, w.y - 10, b.body, 10);
  w.y -= 20;

  heading("Revenue");
  pairs([["Goal monthly revenue", fmtMoney(s.goal)], ["Starting monthly revenue", fmtMoney(s.starting)], ["New revenue needed", fmtMoney(s.newNeeded)],
    ["Projected (retainers)", fmtMoney(s.projected)], ["Actual ending revenue", fmtMoney(s.ending)], ["Profit margin", fmtPct(s.margin)]]);

  heading("What you can pay yourself");
  pairs([["Income", fmtMoney(s.incomeTotal)], ["Paid so far", fmtMoney(s.paid)], ["Team pay", fmtMoney(s.salary)], ["Expenses (OPEX)", fmtMoney(s.opex)],
    ["Profit", fmtMoney(s.profit)], [`Taxes to set aside (${fmtPct(s.taxRate)})`, fmtMoney(s.taxes)], [`Reinvest (${fmtPct(s.reinvestRate)})`, fmtMoney(s.reinvest)], ["You can pay yourself", fmtMoney(s.takeHome)]]);
  if (s.income.length) {
    w.y -= 6;
    table(["Income", "Status", "Amount"], [
      ...s.income.map((r) => [r.label || "—", r.status === "paid" ? "Paid" : r.status === "added" ? "Added" : "Not paid yet", fmtMoney(r.amount)]),
      ["Total", "", fmtMoney(s.incomeTotal)],
    ], [w.width * 0.55, w.width * 0.2, w.width * 0.25]);
  }
  if (d.team?.length) table(["Team pay", "Amount"], [...d.team.map((t) => [t.label || "—", fmtMoney(t.amount)]), ["Total", fmtMoney(s.salary)]], [w.width * 0.7, w.width * 0.3]);
  if (d.expenses?.length) table(["Expense", "Cost"], [...d.expenses.map((e) => [e.label || "—", fmtMoney(e.amount)]), ["Total", fmtMoney(s.opex)]], [w.width * 0.7, w.width * 0.3]);
  table(["Goal budget", "Goal", "Of income"], s.budget.map((x) => [x.label, fmtPct(x.pct), fmtMoney(x.amount)]), [w.width * 0.5, w.width * 0.25, w.width * 0.25]);

  heading("Scorecard");
  pairs([
    ["Happiness", fmtNum(d.happiness ?? null)], ["Routine consistency", fmtPct(d.routine ?? null)], ["CEO identity rating", fmtNum(d.identity ?? null)], ["Inbound leads", fmtNum(s.inboundLeads, 0)],
    ["Total touch points", fmtNum(s.touchPoints, 0)], ["Disco calls had (outbound)", fmtNum(s.callsHad, 0)], ["Touch points per booked call", fmtNum(s.touchPerCall)], ["Disco calls had (inbound)", fmtNum(s.inboundCalls, 0)],
    ["Disco calls offered", fmtNum(s.callsOffered, 0)], ["Show rate", fmtPct(s.showRate)], ["New clients", fmtNum(s.signed, 0)], ["Close rate", fmtPct(s.closeRate)],
    ["Clients", fmtNum(s.clients, 0)], ["Clients upgraded", fmtNum(s.upgraded, 0)], ["Cancellations", fmtNum(s.cancellations, 0)], ["Churn", fmtPct(s.churn)],
    ["Team members", fmtNum(s.teamMembers, 0)], ["Revenue per team member", fmtMoney(s.revenuePerMember)],
  ]);

  heading("Lead generation");
  const leadRows = d.leadRows ?? DEFAULT_LEAD_ROWS;
  const total = (k: string) => Object.values(m.daily[k] ?? {}).reduce((a, x) => a + x, 0);
  pairs([...leadRows.map((r) => [r, fmtNum(total(leadKey(r)), 0)] as [string, string]), ...FUNNEL_ROWS.map((r) => [r.label, fmtNum(total(r.key), 0)] as [string, string])]);

  if (d.magnet && Object.keys(d.magnet).length) {
    heading("MAGNET framework");
    const items = MAGNET.flatMap((g) => g.items.map((i) => ({ group: g.group, item: i, r: d.magnet?.[i] })));
    const colW = w.width / 2;
    for (let i = 0; i < items.length; i += 2) {
      if (w.y - 16 < w.M) { w.page = doc.addPage([612, 792]); w.y = 792 - w.M; }
      items.slice(i, i + 2).forEach((it, c) => {
        const x = w.M + c * colW;
        if (it.r) w.page.drawCircle({ x: x + 4, y: w.y - 7, size: 4, color: RATING[it.r] });
        else w.page.drawCircle({ x: x + 4, y: w.y - 7, size: 4, borderColor: b.line, borderWidth: 0.8 });
        text(`${it.item}  ·  ${it.group}`, x + 14, w.y - 10.5, b.body, 9);
      });
      w.y -= 16;
    }
  }

  if (d.reflection?.trim()) {
    heading("Personal reflections");
    para(d.reflection, b.body, 9.5);
  }
}

/** The chosen months compared side by side, on a landscape page. */
function overviewPage(doc: PDFDocument, b: PdfBrand, agency: string, months: Month[]) {
  const { w, text, table } = writer(doc, b, [792, 612]);
  const y = yearSummary(months);
  text(agency.toUpperCase(), w.M, w.y - 9, b.label, 8.5);
  w.y -= 18;
  const span = months.length > 1 ? `${monthName(months[0].month, "short")} to ${monthName(months.at(-1)!.month, "short")}` : monthName(months[0].month);
  text(`CEO tracker: ${span}`, w.M, w.y - 22, b.heading, 24);
  w.y -= 36;
  const cols = months.map((m) => monthName(m.month, "short").split(" ")[0]);
  const row = (label: string, f: (m: Month) => string, total: string) => [label, ...months.map(f), total];
  const first = 150, rest = (w.width - first) / (months.length + 1);
  table(["", ...cols, "Total"], [
    row("Goal revenue", (m) => fmtMoney(m.s.goal || null), ""),
    row("Starting revenue", (m) => fmtMoney(m.s.starting || null), ""),
    row("Projected revenue", (m) => fmtMoney(m.s.projected || null), fmtMoney(y.income)),
    row("Ending revenue", (m) => fmtMoney(m.s.ending || null), fmtMoney(y.revenue)),
    row("Profit", (m) => (m.s.incomeTotal ? fmtMoney(m.s.profit) : "—"), fmtMoney(y.profit)),
    row("Profit margin", (m) => fmtPct(m.s.margin), fmtPct(y.margin)),
    row("Happiness", (m) => fmtNum(m.data.happiness ?? null), fmtNum(y.happiness)),
    row("Inbound leads", (m) => fmtNum(m.s.inboundLeads, 0), fmtNum(y.inboundLeads, 0)),
    row("Touch points", (m) => fmtNum(m.s.touchPoints, 0), fmtNum(y.touchPoints, 0)),
    row("Disco calls offered", (m) => fmtNum(m.s.callsOffered, 0), fmtNum(y.callsOffered, 0)),
    row("Disco calls had", (m) => fmtNum(m.s.callsHad, 0), fmtNum(y.callsHad, 0)),
    row("Show rate", (m) => fmtPct(m.s.showRate), fmtPct(y.showRate)),
    row("New clients", (m) => fmtNum(m.s.signed, 0), fmtNum(y.signed, 0)),
    row("Close rate", (m) => fmtPct(m.s.closeRate), fmtPct(y.closeRate)),
    row("Clients", (m) => fmtNum(m.s.clients, 0), fmtNum(y.clientsServed, 0)),
    row("Cancellations", (m) => fmtNum(m.s.cancellations, 0), fmtNum(y.cancellations, 0)),
    row("Team pay", (m) => fmtMoney(m.s.salary || null), fmtMoney(y.salary)),
    row("OPEX", (m) => fmtMoney(m.s.opex || null), fmtMoney(y.opex)),
    row("Taxes to set aside", (m) => fmtMoney(m.s.taxes || null), fmtMoney(y.taxes)),
    row("You could pay yourself", (m) => (m.s.incomeTotal ? fmtMoney(m.s.takeHome) : "—"), fmtMoney(y.takeHome)),
  ], [first, ...months.map(() => rest), rest], months.length > 8 ? 7.5 : 8.5);
}

export async function ceoTrackerPdf(opts: { agency: string; primary?: string; months: Month[]; overview: boolean }) {
  const doc = await PDFDocument.create();
  const b = await pdfBrand(doc, opts.primary);
  doc.setTitle(`CEO tracker ${opts.months.map((m) => m.month).join(", ")}`);
  doc.setAuthor(opts.agency);
  if (opts.overview && opts.months.length > 1) overviewPage(doc, b, opts.agency, opts.months);
  for (const m of opts.months) monthPages(doc, b, opts.agency, m);
  return doc.save();
}
