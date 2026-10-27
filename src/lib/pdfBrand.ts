import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { rgb, type PDFDocument, type PDFFont, type RGB } from "pdf-lib";

/** Our brand look for downloaded PDFs: Instrument Serif headings, Instrument Sans text, Poppins labels, all in the dark green. */
export type PdfBrand = { heading: PDFFont; body: PDFFont; label: PDFFont; ink: RGB; tint: RGB; line: RGB };

const dir = path.join(process.cwd(), "assets", "fonts");
let files: Promise<Buffer[]> | null = null;

export const hexColor = (h: string | undefined, fallback: RGB) => {
  const m = h?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : fallback;
};

/** Embed the brand fonts in `doc`. `primary` is the agency's dark green (falls back to ours). */
export async function pdfBrand(doc: PDFDocument, primary?: string): Promise<PdfBrand> {
  files ??= Promise.all(["InstrumentSerif-Regular.ttf", "InstrumentSans-Variable.ttf", "Poppins-SemiBold.ttf"].map((f) => readFile(path.join(dir, f))));
  const [serif, sans, poppins] = await files;
  doc.registerFontkit(fontkit);
  const [heading, body, label] = await Promise.all([serif, sans, poppins].map((b) => doc.embedFont(b, { subset: true })));
  const ink = hexColor(primary, rgb(0x36 / 255, 0x4e / 255, 0x4a / 255));
  return {
    heading, body, label, ink,
    // Light sage for header rows and stripes, and soft green rules.
    tint: rgb(0xe4 / 255, 0xee / 255, 0xeb / 255),
    line: rgb(0.62, 0.7, 0.68),
  };
}
