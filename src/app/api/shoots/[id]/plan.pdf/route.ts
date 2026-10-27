import { NextResponse } from "next/server";
import { getViewer } from "@/lib/session";
import { buildShootPlanPdf } from "@/lib/shootPlanFile";
import { createClient } from "@/lib/supabase/server";

/**
 * Download a shoot plan as a PDF. The team gets the working draft; clients only ever get the
 * version that was sent to them. `?sent=1` gets the sent version for anyone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in first", { status: 401 });
  // RLS decides whether this person can see the shoot at all.
  const supabase = await createClient();
  const { data: shoot } = await supabase.from("content_shoots").select("id").eq("id", id).maybeSingle();
  if (!shoot) return new NextResponse("Not found", { status: 404 });
  const version = v.kind === "team" && !new URL(req.url).searchParams.has("sent") ? "draft" : "sent";
  const file = await buildShootPlanPdf(id, version);
  if (!file) return new NextResponse("There's no plan for this shoot yet.", { status: 404 });
  return new NextResponse(Buffer.from(file.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.fileName.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" },
  });
}
