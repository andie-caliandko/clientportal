import { NextResponse, type NextRequest } from "next/server";
import { canSeeCeo } from "@/lib/ceo";
import { monthName } from "@/lib/ceoTracker";
import { loadMonths } from "@/lib/ceoTracker.server";
import { ceoTrackerPdf } from "@/lib/ceoTrackerPdf";
import { requireTeam } from "@/lib/session";

/** Download the chosen months of the CEO tracker as one PDF (owner and admins they share with). */
export async function GET(request: NextRequest) {
  const { agency, member, userId } = await requireTeam();
  if (!canSeeCeo(agency, userId, member.role)) return new NextResponse("Not found", { status: 404 });
  const months = [...new Set((request.nextUrl.searchParams.get("months") ?? "").split(",").filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort().slice(0, 36);
  if (!months.length) return new NextResponse("Pick at least one month.", { status: 400 });
  const loaded = (await loadMonths(agency.id, months[0], months.at(-1)!)).filter((m) => months.includes(m.month));
  const pdf = await ceoTrackerPdf({ agency: agency.name, primary: agency.brand?.colors?.primary, months: loaded, overview: request.nextUrl.searchParams.get("overview") === "1" });
  const label = months.length === 1 ? monthName(months[0]) : `${monthName(months[0], "short")} to ${monthName(months.at(-1)!, "short")}`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="CEO tracker ${label.replace(/[^\w\s-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
