import { NextResponse } from "next/server";
import { answersPdf } from "@/lib/answersPdf";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Download a client's questionnaire answers as a PDF (team only; RLS limits it to clients they can see). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agency } = await requireTeam();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) return new NextResponse("Not found", { status: 404 });
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("id, position, prompt").eq("agency_id", agency.id).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", id),
  ]);
  const by = new Map((answers ?? []).map((a) => [a.question_id, a.body as string]));
  const pdf = await answersPdf({
    agency: agency.name,
    client: client.name,
    date: new Date().toLocaleDateString("en-US", { timeZone: agency.timezone, month: "long", day: "numeric", year: "numeric" }),
    items: (questions ?? []).map((q) => ({ position: q.position, prompt: q.prompt, answer: by.get(q.id) ?? "" })),
  });
  const file = `${client.name.replace(/[^\w\s-]/g, "").trim() || "Client"} questionnaire.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
