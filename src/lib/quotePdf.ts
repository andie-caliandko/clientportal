import { PDFDocument, type PDFFont } from "pdf-lib";
import { pdfSafe, wrap } from "./answersPdf";
import { pdfBrand } from "./pdfBrand";
import { optionSummary, type Quote, type Rates } from "./pricing";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });

/** A quote for the prospect: each option, what's included and its price. Never hours, rates or costs. */
export async function quotePdf(opts: { agency: string; primary?: string; date: string; quote: Quote; r: Rates }) {
  const { quote: q } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.agency} proposal for ${q.business || q.name}`);
  doc.setAuthor(opts.agency);
  const brand = await pdfBrand(doc, opts.primary);
  const W = 612, H = 792, M = 56, width = W - M * 2;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const room = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };
  const draw = (text: string, font: PDFFont, size: number, gap = 4, x = M, w = width) => {
    for (const line of wrap(pdfSafe(text, font), font, size, w)) {
      room(size);
      page.drawText(line, { x, y: y - size, size, font, color: brand.ink });
      y -= size + gap;
    }
  };

  draw(opts.agency.toUpperCase(), brand.label, 9);
  y -= 4;
  draw(`Your investment${q.business || q.name ? `, ${q.business || q.name}` : ""}`, brand.heading, 28, 8);
  draw(opts.date, brand.body, 10);
  y -= 16;

  for (const o of q.options) {
    const s = optionSummary(o, opts.r);
    room(110);
    page.drawRectangle({ x: M, y: y - 52, width, height: 52, color: brand.tint });
    page.drawText(pdfSafe(o.label, brand.heading), { x: M + 14, y: y - 34, size: 20, font: brand.heading, color: brand.ink });
    const prices = [
      s.monthly.hours || s.monthly.cost ? `${money(s.monthly.price)} / month` : "",
      s.once.hours || s.once.cost ? `${money(s.once.price)} one time` : "",
    ].filter(Boolean).join("  +  ");
    const pw = brand.label.widthOfTextAtSize(prices, 12);
    page.drawText(pdfSafe(prices, brand.label), { x: M + width - 14 - pw, y: y - 31, size: 12, font: brand.label, color: brand.ink });
    y -= 70;
    const groups = [...new Set(o.lines.map((l) => l.group ?? ""))];
    for (const g of groups) {
      const lines = o.lines.filter((l) => (l.group ?? "") === g && l.label.trim());
      if (!lines.length) continue;
      if (g) { room(30); draw(g.toUpperCase(), brand.label, 9, 6); }
      for (const l of lines) {
        room(14);
        page.drawCircle({ x: M + 4, y: y - 6, size: 1.8, color: brand.ink });
        draw(`${l.label}${l.once && s.monthly.hours ? " (one time)" : ""}`, brand.body, 10.5, 4, M + 14, width - 14);
      }
      y -= 8;
    }
    y -= 14;
  }
  return doc.save();
}
