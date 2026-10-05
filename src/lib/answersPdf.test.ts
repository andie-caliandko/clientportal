import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { answersPdf, pdfSafe, wrap } from "./answersPdf";

describe("answers PDF", () => {
  it("wraps long text and splits very long words", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrap(`${"word ".repeat(40)}\n${"x".repeat(200)}`, font, 10, 200);
    expect(lines.length).toBeGreaterThan(4);
    lines.forEach((l) => expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(200));
  });
  it("replaces characters the font can't draw", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(pdfSafe("Hi 😀 “there”", font)).toBe("Hi ? “there”");
  });
  it("builds a PDF over several pages", async () => {
    const bytes = await answersPdf({ agency: "Sample Agency", client: "Sample Bakery", date: "Oct 5, 2026",
      items: Array.from({ length: 30 }, (_, i) => ({ position: i + 1, prompt: `Question ${i + 1}?`, answer: "An answer. ".repeat(30) })) });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
