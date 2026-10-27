import "server-only";
import { answersPdf } from "./answersPdf";
import { createAdminClient } from "./supabase/server";
import type { Agency } from "./types";

/** A client's onboarding questionnaire answers as a branded PDF. Callers check who's asking. */
export async function questionnairePdf(clientId: string) {
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name, agencies(*)").eq("id", clientId).maybeSingle();
  if (!client) return null;
  const agency = client.agencies as unknown as Agency;
  const [{ data: questions }, { data: answers }] = await Promise.all([
    admin.from("questions").select("id, position, prompt").eq("agency_id", agency.id).order("position"),
    admin.from("answers").select("question_id, body").eq("client_id", clientId),
  ]);
  const by = new Map((answers ?? []).map((a) => [a.question_id, a.body as string]));
  return answersPdf({
    agency: agency.name,
    client: client.name,
    date: new Date().toLocaleDateString("en-US", { timeZone: agency.timezone, month: "long", day: "numeric", year: "numeric" }),
    primary: agency.brand?.colors?.primary,
    items: (questions ?? []).map((q) => ({ position: q.position, prompt: q.prompt, answer: by.get(q.id) ?? "" })),
  });
}
