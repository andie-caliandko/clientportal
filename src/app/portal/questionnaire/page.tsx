import { requireClient } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Question } from "@/lib/types";
import { Questionnaire } from "./Questionnaire";

export default async function QuestionnairePage() {
  const { agency, client } = await requireClient();
  const supabase = await createClient();
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", client.id),
  ]);
  const saved = Object.fromEntries((answers ?? []).map((a) => [a.question_id, a.body]));
  // Start at the first unanswered question so people pick up where they left off.
  const qs = (questions ?? []) as Question[];
  const start = Math.max(0, qs.findIndex((q) => !saved[q.id]?.trim()));
  return <Questionnaire questions={qs} saved={saved} start={start} brand={agency.brand} agencyName={agency.name} />;
}
