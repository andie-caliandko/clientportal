/** The services a client can get from us, in the order they're offered. */
export const SERVICES = [
  { id: "social", label: "Social media" },
  { id: "content", label: "Content shoots" },
  { id: "website", label: "Website" },
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Paid ads" },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

const IDS = new Set<string>(SERVICES.map((s) => s.id));

export const serviceLabel = (id: string) => SERVICES.find((s) => s.id === id)?.label ?? id;

/** The services ticked on a form, in the standard order. */
export const readServices = (form: FormData): ServiceId[] =>
  SERVICES.map((s) => s.id).filter((id) => form.getAll("services").map(String).includes(id));

/**
 * Social clients get red / yellow / green scorecards and Daily engagement.
 * A client with no services picked yet is treated as social, so nothing disappears before they're set.
 */
export const isSocial = (services: string[] | null | undefined) => {
  const list = (services ?? []).filter((s) => IDS.has(s));
  return !list.length || list.includes("social");
};
