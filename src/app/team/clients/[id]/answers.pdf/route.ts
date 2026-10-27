import { NextResponse } from "next/server";
import { questionnairePdf } from "@/lib/questionnairePdf";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Download a client's questionnaire answers as a PDF (team only; RLS limits it to clients they can see). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTeam();
  const { data: client } = await (await createClient()).from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) return new NextResponse("Not found", { status: 404 });
  const pdf = await questionnairePdf(client.id);
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  const file = `${client.name.replace(/[^\w\s-]/g, "").trim() || "Client"} questionnaire.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
