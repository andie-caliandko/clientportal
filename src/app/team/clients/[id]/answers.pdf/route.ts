import { NextResponse } from "next/server";
import { questionnairePdf } from "@/lib/questionnairePdf";
import { formTitle, isForm } from "@/lib/questionnaires";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Download a client's questionnaire answers as a PDF (team only; RLS limits it to clients they can see). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTeam();
  const { data: client } = await (await createClient()).from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) return new NextResponse("Not found", { status: 404 });
  const asked = new URL(req.url).searchParams.get("form");
  const form = isForm(asked) ? asked : "social";
  const pdf = await questionnairePdf(client.id, form);
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  const file = `${client.name.replace(/[^\w\s-]/g, "").trim() || "Client"} ${formTitle(form).toLowerCase()}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
