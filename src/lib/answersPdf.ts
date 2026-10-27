import { PDFDocument, type PDFFont } from "pdf-lib";
import { pdfBrand } from "./pdfBrand";

/** Keep only characters the font can draw (emoji and the like become "?"). */
export function pdfSafe(text: string, font: PDFFont) {
  // Embedded fonts list their characters; the built-in ones throw on anything they can't encode.
  let known: Set<number> | null = null;
  try { known = new Set(font.getCharacterSet()); } catch { known = null; }
  return [...text.replace(/\r/g, "").replace(/\t/g, "    ")].map((ch) => {
    if (ch === "\n") return ch;
    if (known && known.size) return known.has(ch.codePointAt(0)!) ? ch : "?";
    try { font.encodeText(ch); return ch; } catch { return "?"; }
  }).join("");
}

/** Break text into lines that fit `width` at `size`. */
export function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      // A single word longer than the line is split across lines.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

/** A client's questionnaire answers as a letter-size PDF. */
export async function answersPdf(opts: { agency: string; client: string; date: string; primary?: string; items: { position: number; prompt: string; answer: string }[] }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.client} onboarding questionnaire`);
  doc.setAuthor(opts.agency);
  // Brand fonts, and every word in the brand's dark green.
  const brand = await pdfBrand(doc, opts.primary);
  const regular = brand.body, bold = brand.label, serif = brand.heading;
  const ink = brand.ink, muted = brand.ink;
  const W = 612, H = 792, M = 56, width = W - M * 2;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const draw = (text: string, font: PDFFont, size: number, color = ink, gap = 4) => {
    for (const line of wrap(pdfSafe(text, font), font, size, width)) {
      if (y - size < M) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(line, { x: M, y: y - size, size, font, color });
      y -= size + gap;
    }
  };

  draw(opts.agency.toUpperCase(), bold, 9, muted);
  y -= 4;
  draw(`${opts.client}: onboarding questionnaire`, serif, 26, ink, 10);
  draw(`Downloaded ${opts.date}`, regular, 10, muted);
  y -= 14;
  for (const q of opts.items) {
    if (y - 40 < M) { page = doc.addPage([W, H]); y = H - M; }
    draw(`${q.position}. ${q.prompt}`, bold, 10.5);
    y -= 2;
    draw(q.answer.trim() || "Not answered yet", regular, 10.5, muted, 4.5);
    y -= 14;
  }
  return doc.save();
}
