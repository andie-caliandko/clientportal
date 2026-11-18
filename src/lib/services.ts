/** The services a client can get from us, in the order they're offered. */
export const SERVICES = [
  { id: "social", label: "Social media" },
  { id: "content", label: "Content shoots" },
  { id: "website", label: "Website" },
  { id: "branding", label: "Branding" },
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Paid ads" },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

export const serviceLabel = (id: string) => SERVICES.find((s) => s.id === id)?.label ?? id;

/** The services ticked on a form, in the standard order. */
export const readServices = (form: FormData): ServiceId[] =>
  SERVICES.map((s) => s.id).filter((id) => form.getAll("services").map(String).includes(id));

/** Only social clients get the Account health tab (red / yellow / green scorecards) and Daily engagement. */
export const isSocial = (services: string[] | null | undefined) => (services ?? []).includes("social");

/** Whether a client's health is tracked: turned on (the default) and a social client. Untracked clients get no scorecard reminders. */
export const isHealthTracked = (c: { health_tracked?: boolean | null; services?: string[] | null }) =>
  c.health_tracked !== false && isSocial(c.services);
