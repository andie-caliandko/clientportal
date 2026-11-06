import { NextResponse } from "next/server";
import { isOwner } from "@/lib/ceo";
import { rates } from "@/lib/pricing";
import { loadPricing } from "@/lib/pricing.server";
import { quotePdf } from "@/lib/quotePdf";
import { requireTeam } from "@/lib/session";

/** A quote as a PDF to send the prospect (owner only). */
export async function GET(req: Request) {
  const { agency, userId } = await requireTeam();
  if (!isOwner(agency, userId)) return new NextResponse("Not found", { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const p = await loadPricing(agency.id, today.slice(0, 7));
  const quote = p.quotes.find((q) => q.id === id);
  if (!quote) return new NextResponse("Not found", { status: 404 });
  const pdf = await quotePdf({
    agency: agency.name,
    primary: agency.brand?.colors?.primary,
    date: new Date().toLocaleDateString("en-US", { timeZone: agency.timezone, month: "long", day: "numeric", year: "numeric" }),
    quote,
    r: rates(p.settings, p.team.lines, p.expenses.lines),
  });
  const name = `${(quote.business || quote.name).replace(/[^\w\s-]/g, "").trim() || "Quote"} proposal.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
