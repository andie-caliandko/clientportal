/** Words too common in business names to tell clients apart. */
const GENERIC = new Set(["the", "and", "events", "event", "marketing", "group", "studio", "studios", "company", "llc", "inc", "condos", "condo",
  "law", "firm", "design", "designs", "wellness", "realty", "real", "estate", "home", "homes", "co", "shop", "salon", "spa", "team", "club", "media"]);

/** The distinctive words in a client or channel name ("Epting Events" → ["epting"]). */
export function nameWords(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
}

/**
 * If a Slack channel's name points at a different client than the one it's being
 * linked to (say #epting-events on 100 Prince Condos), returns that client's name.
 */
export function channelBelongsToOther(channelName: string, clientName: string, others: string[]) {
  const channel = new Set(nameWords(channelName));
  if (nameWords(clientName).some((w) => channel.has(w))) return null;
  return others.find((o) => nameWords(o).some((w) => channel.has(w))) ?? null;
}
