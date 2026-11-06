/** The questionnaires a client can be sent, one per kind of project. */
export const FORMS = [
  { id: "social", label: "Social media", title: "Social media questionnaire" },
  { id: "website", label: "Website", title: "Website questionnaire" },
  { id: "branding", label: "Branding", title: "Branding questionnaire" },
] as const;

export type FormId = (typeof FORMS)[number]["id"];

const IDS = new Set<string>(FORMS.map((f) => f.id));

export const isForm = (id: unknown): id is FormId => typeof id === "string" && IDS.has(id);

export const formTitle = (id: string) => FORMS.find((f) => f.id === id)?.title ?? "Questionnaire";

/** The questionnaires ticked on a form, in the standard order. */
export const readForms = (form: FormData, name = "questionnaires"): FormId[] => {
  const picked = form.getAll(name).map(String);
  return FORMS.map((f) => f.id).filter((id) => picked.includes(id));
};

/** A questionnaire a client has been sent. */
export type SentForm = { form: FormId; sent_at: string; submitted_at: string | null };

/** Sorted the standard way, so the client goes through them in the same order every time. */
export const inOrder = <T extends { form: string }>(rows: T[]) =>
  [...rows].sort((a, b) => FORMS.findIndex((f) => f.id === a.form) - FORMS.findIndex((f) => f.id === b.form));

/** The first questionnaire still waiting on the client, if any. */
export const nextOpen = <T extends { form: string; submitted_at: string | null }>(rows: T[]) =>
  inOrder(rows).find((r) => !r.submitted_at) ?? null;

/** The onboarding step is done once everything they've been sent is back. */
export const allIn = (rows: { submitted_at: string | null }[]) => rows.every((r) => !!r.submitted_at);
