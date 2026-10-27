import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { pdfSafe, wrap } from "./answersPdf";
import { lines, usedFor, type ShootPlan } from "./shootPlan";

/** What goes in a table cell: plain text, a checklist, a bulleted list or one checkbox. */
type Cell = string | { checks: string[] } | { bullets: string[] } | { box: boolean };

const hex = (h: string | undefined, fallback: RGB) => {
  const m = h?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : fallback;
};

/** A shoot plan as a letter-size PDF, in the same shape as our shoot strategy docs. */
export async function shootPlanPdf(opts: {
  agency: string; client: string; title: string; when: string; plan: ShootPlan; accent?: string;
}) {
  const { plan } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.client} ${opts.title}`);
  doc.setAuthor(opts.agency);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.16, 0.16), muted = rgb(0.42, 0.46, 0.46), line = rgb(0.2, 0.2, 0.2);
  const accent = hex(opts.accent, rgb(0.21, 0.31, 0.29));
  const stripe = rgb(0.95, 0.95, 0.95), white = rgb(1, 1, 1);
  const W = 612, H = 792, M = 48, width = W - M * 2;
  const SIZE = 9.5, LEAD = 12.5, PAD = 6;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const room = (h: number) => { if (y - h < M) newPage(); };

  const text = (t: string, font: PDFFont, size: number, color = ink, x = M, w = width, gap = 3.5, center = false) => {
    for (const l of wrap(pdfSafe(t, font), font, size, w)) {
      room(size + gap);
      const dx = center ? (w - font.widthOfTextAtSize(l, size)) / 2 : 0;
      page.drawText(l, { x: x + dx, y: y - size, size, font, color });
      y -= size + gap;
    }
  };
  let section = 0;
  const heading = (t: string) => {
    room(60);
    y -= 14;
    section++;
    text(`${section}. ${t}`, bold, 12, accent);
    page.drawLine({ start: { x: M, y: y - 1 }, end: { x: M + width, y: y - 1 }, thickness: 0.8, color: accent });
    y -= 10;
  };
  const sub = (t: string) => { room(50); y -= 6; text(t, bold, 10.5, accent); y -= 3; };

  // Cell layout: wrapped lines with their font and an optional marker in front.
  type Line = { t: string; font: PDFFont; color: RGB; mark?: "box" | "checked" | "dot"; indent?: boolean };
  const layout = (c: Cell, w: number): Line[] => {
    if (typeof c === "string") return wrap(pdfSafe(c, regular), regular, SIZE, w).map((t) => ({ t, font: regular, color: ink }));
    if ("box" in c) return [{ t: "", font: regular, color: ink, mark: c.box ? "checked" : "box" }];
    const items = "checks" in c ? c.checks : c.bullets;
    return items.flatMap((item) => wrap(pdfSafe(item, regular), regular, SIZE, w - 13)
      .map((t, i) => ({ t, font: regular, color: ink, mark: i === 0 ? ("checks" in c ? "box" as const : "dot" as const) : undefined, indent: true })));
  };
  const cellHeight = (ls: Line[]) => Math.max(1, ls.length) * LEAD + PAD * 2 - 2;
  const drawLines = (ls: Line[], x: number, top: number) => {
    ls.forEach((l, i) => {
      const base = top - PAD - SIZE - i * LEAD + 1;
      let tx = x + PAD;
      if (l.mark === "box" || l.mark === "checked") {
        page.drawRectangle({ x: tx, y: base - 0.5, width: 7.5, height: 7.5, borderColor: ink, borderWidth: 0.7 });
        if (l.mark === "checked") page.drawText("x", { x: tx + 1.6, y: base + 0.4, size: 7, font: bold, color: ink });
      } else if (l.mark === "dot") page.drawText("•", { x: tx + 1, y: base, size: SIZE, font: regular, color: ink });
      if (l.indent) tx += 13;
      if (l.t) page.drawText(l.t, { x: tx, y: base, size: SIZE, font: l.font, color: l.color });
    });
  };

  /** A table with a dark header row; rows move to the next page whole, with the header repeated. */
  const table = (cols: { label: string; w: number }[], rows: Cell[][]) => {
    const xs = cols.reduce<number[]>((a, c, i) => [...a, i ? a[i - 1] + cols[i - 1].w * width : M], []);
    const ws = cols.map((c) => c.w * width);
    const head = () => {
      const hl = cols.map((c, i) => wrap(pdfSafe(c.label, bold), bold, SIZE, ws[i] - PAD * 2));
      const h = Math.max(...hl.map((l) => l.length)) * LEAD + PAD * 2 - 2;
      room(h + 30);
      cols.forEach((_, i) => {
        page.drawRectangle({ x: xs[i], y: y - h, width: ws[i], height: h, color: accent, borderColor: line, borderWidth: 0.6 });
        hl[i].forEach((l, k) => page.drawText(l, { x: xs[i] + PAD, y: y - PAD - SIZE - k * LEAD + 1, size: SIZE, font: bold, color: white }));
      });
      y -= h;
    };
    head();
    rows.forEach((row, r) => {
      const ls = row.map((c, i) => layout(c, ws[i] - PAD * 2));
      const h = Math.min(Math.max(...ls.map(cellHeight)), H - M * 2 - 40);
      if (y - h < M) { newPage(); head(); }
      row.forEach((_, i) => {
        page.drawRectangle({ x: xs[i], y: y - h, width: ws[i], height: h, color: r % 2 ? stripe : white, borderColor: line, borderWidth: 0.6 });
        drawLines(ls[i], xs[i], y);
      });
      y -= h;
    });
    y -= 10;
  };

  // Title block
  text(opts.client.toUpperCase(), bold, 9, accent, M, width, 4, true);
  text(opts.title, bold, 20, accent, M, width, 5, true);
  text(`Shoot: ${opts.when} | Prepared by ${opts.agency}`, regular, 9.5, muted, M, width, 3, true);

  if (plan.purpose || plan.goal || plan.tone || plan.setups.length) {
    heading("Shoot overview");
    if (plan.purpose) { text(plan.purpose, regular, 10, ink, M, width, 4); y -= 4; }
    if (plan.goal) { text(`Goal: ${plan.goal}`, regular, 10, ink, M, width, 4); y -= 2; }
    if (plan.tone) { text(`Direction: ${plan.tone}`, regular, 10, ink, M, width, 4); y -= 2; }
    if (plan.setups.length) {
      y -= 8;
      const models = (id: string) => plan.models.filter((m) => m.setupIds.includes(id)).map((m) => m.name).join(", ") || "TBD";
      table(
        [{ label: "Priority", w: 0.1 }, { label: "Setup", w: plan.needsModels ? 0.2 : 0.24 }, { label: "Featuring", w: plan.needsModels ? 0.2 : 0.24 },
          { label: "Location", w: plan.needsModels ? 0.18 : 0.24 }, { label: "Time", w: 0.18 }, ...(plan.needsModels ? [{ label: "Models", w: 0.14 }] : [])],
        plan.setups.map((s, i) => [String(i + 1), s.name, s.featuring, s.location, s.time, ...(plan.needsModels ? [models(s.id)] : [])]),
      );
    }
  }

  if (plan.needsModels && plan.models.length) {
    heading("Models");
    const setupName = (id: string) => plan.setups.find((s) => s.id === id)?.name ?? "";
    table(
      [{ label: "Name", w: 0.24 }, { label: "Setups", w: 0.26 }, { label: "Size", w: 0.14 }, { label: "Waiver signed", w: 0.14 }, { label: "Notes", w: 0.22 }],
      plan.models.map((m) => [m.name, m.setupIds.map(setupName).filter(Boolean).join(", "), m.size, { box: m.waiverSigned }, m.notes]),
    );
  }

  if (plan.locations.length) {
    heading("Locations");
    table(
      [{ label: "Venue", w: 0.2 }, { label: "Address", w: 0.3 }, { label: "Use for", w: 0.22 }, { label: "Notes", w: 0.28 }],
      plan.locations.map((l) => [l.venue, l.address, usedFor(plan, l.venue).join(", "), l.notes]),
    );
  }

  if (plan.setups.length || plan.bonus) {
    heading("Shot list");
    plan.setups.forEach((s, i) => {
      sub(`Setup ${i + 1}: ${[s.name, s.featuring && `(${s.featuring})`, s.time].filter(Boolean).join(" ")}`);
      if (s.location) text(s.location, regular, 9, muted);
      y -= 2;
      const rows = s.shots.filter((r) => r.shots || r.type);
      const products = lines(s.products), props = lines(s.props);
      table(
        [{ label: "Shot type", w: 0.17 }, { label: "Shots to get", w: 0.39 }, { label: "Products / wardrobe", w: 0.24 }, { label: "Props", w: 0.2 }],
        (rows.length ? rows : [{ type: "", shots: "" }]).map((r, k) => [
          r.type, r.shots,
          k === 0 && products.length ? { checks: products } : "",
          k === 0 && props.length ? { bullets: props } : "",
        ]),
      );
    });
    const extra = lines(plan.bonus);
    if (extra.length) {
      sub("Bonus b-roll (any setup, any location)");
      for (const b of extra) { room(LEAD); page.drawText("•", { x: M + 2, y: y - SIZE, size: SIZE + 0.5, font: regular, color: ink }); text(b, regular, 10, ink, M + 14, width - 14, 4); }
    }
  }

  if (plan.timeline.length) {
    heading("Shoot schedule");
    sub(opts.when);
    table([{ label: "Time", w: 0.22 }, { label: "Activity", w: 0.78 }], plan.timeline.map((t) => [t.time, t.text]));
  }

  return doc.save();
}
