import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formTitle, inOrder, nextOpen, type SentForm } from "@/lib/questionnaires";
import type { Question } from "@/lib/types";
import { Questionnaire } from "./Questionnaire";

export default async function QuestionnairePage({ searchParams }: { searchParams: Promise<{ form?: string; done?: string }> }) {
  const { form: asked, done } = await searchParams;
  const { agency, client } = await requireClient();
  const supabase = await createClient();
  const { data: sentRows } = await supabase.from("client_questionnaires").select("form, sent_at, submitted_at").eq("client_id", client.id);
  const sent = inOrder((sentRows ?? []) as SentForm[]);
  // No questionnaire picked: the next one waiting, or the first to look back over.
  const current = sent.find((r) => r.form === asked) ?? (asked ? null : nextOpen(sent) ?? sent[0]);
  if (!current) redirect(sent.length ? "/portal/questionnaire" : "/portal/tasks");

  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("*").eq("agency_id", agency.id).eq("form", current.form).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", client.id),
  ]);
  const saved = Object.fromEntries((answers ?? []).map((a) => [a.question_id, a.body]));
  const qs = (questions ?? []) as Question[];
  const title = formTitle(current.form);
  const others = sent.filter((r) => r.form !== current.form);

  // Once it's submitted, they can read it back; the team can send it again for changes.
  if (current.submitted_at) {
    const short = agency.brand.shortName ?? agency.name;
    return (
      <main className="q-view">
        <Link href="/portal/tasks" className="note">← Back to your portal</Link>
        <div>
          <p className="eyebrow">{client.name}</p>
          <h1>Your {title.toLowerCase()}</h1>
          <p className="note">This is what you sent us. Need to change something? Send {short} a message and we&apos;ll open it back up for you.</p>
        </div>
        {others.length > 0 && (
          <nav className="row" aria-label="Your other questionnaires">
            {others.map((r) => (
              <Link key={r.form} className={`btn sm ${r.submitted_at ? "line" : ""}`} href={`/portal/questionnaire?form=${r.form}`}>
                {r.submitted_at ? `View your ${formTitle(r.form).toLowerCase()}` : `Fill out your ${formTitle(r.form).toLowerCase()}`}
              </Link>
            ))}
          </nav>
        )}
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
  return (
    <Questionnaire key={current.form} form={current.form} title={title} questions={qs} saved={saved} start={start}
      brand={agency.brand} agencyName={agency.name} justSent={!!done} />
  );
}
