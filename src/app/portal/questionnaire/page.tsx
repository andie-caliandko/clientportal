import Link from "next/link";
import { requireClient } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Question } from "@/lib/types";
import { Questionnaire } from "./Questionnaire";

export default async function QuestionnairePage() {
  const { agency, client } = await requireClient();
  const supabase = await createClient();
  const [{ data: questions }, { data: answers }, { data: step }] = await Promise.all([
    supabase.from("questions").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", client.id),
    supabase.from("onboarding_steps").select("id").eq("agency_id", agency.id).eq("kind", "questionnaire").maybeSingle(),
  ]);
  const saved = Object.fromEntries((answers ?? []).map((a) => [a.question_id, a.body]));
  const qs = (questions ?? []) as Question[];
  const { data: finished } = step
    ? await supabase.from("client_step_status").select("step_id").eq("client_id", client.id).eq("step_id", step.id).maybeSingle()
    : { data: null };

  // Once it's submitted, they can read it back; the team can send it again for changes.
  if (finished) {
    const short = agency.brand.shortName ?? agency.name;
    return (
      <main className="q-view">
        <Link href="/portal/tasks" className="note">← Back to your portal</Link>
        <div>
          <p className="eyebrow">{client.name}</p>
          <h1>Your onboarding questionnaire</h1>
          <p className="note">This is what you sent us. Need to change something? Send {short} a message and we&apos;ll open it back up for you.</p>
        </div>
        <ol className="q-answers">
          {qs.map((q) => (
            <li key={q.id}>
              <h2>{q.prompt}</h2>
              <p>{saved[q.id]?.trim() || <span className="note">No answer</span>}</p>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  // Start at the first unanswered question so people pick up where they left off.
  const start = Math.max(0, qs.findIndex((q) => !saved[q.id]?.trim()));
  return <Questionnaire questions={qs} saved={saved} start={start} brand={agency.brand} agencyName={agency.name} />;
}
