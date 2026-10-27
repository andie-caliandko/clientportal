/**
 * A content shoot plan, laid out like our shoot strategy docs: an overview, setups in priority
 * order (each with its own shot table), locations, optional models, bonus b-roll and the schedule.
 */
export const SHOT_TYPES = ["Stills", "Video / Reel b-roll", "Group / candid", "Detail / product"] as const;

export type ShotRow = { type: string; shots: string };
export type Setup = {
  id: string;
  name: string;
  /** The product, collection, service or story it's about. */
  featuring: string;
  time: string;
  location: string;
  shots: ShotRow[];
  /** One per line, shown as a checklist. */
  products: string;
  props: string;
};
export type ShootLocation = { id: string; venue: string; address: string; notes: string };
export type Model = { id: string; name: string; setupIds: string[]; size: string; waiverSigned: boolean; notes: string };
export type TimelineItem = { time: string; text: string };
export type ShootPlan = {
  /** Shown at the top, like "Q2 Content Shoot". */
  title: string;
  purpose: string;
  goal: string;
  tone: string;
  setups: Setup[];
  locations: ShootLocation[];
  needsModels: boolean;
  models: Model[];
  /** One per line. */
  bonus: string;
  timeline: TimelineItem[];
};

export const EMPTY_PLAN: ShootPlan = { title: "", purpose: "", goal: "", tone: "", setups: [], locations: [], needsModels: false, models: [], bonus: "", timeline: [] };

export const newId = () => Math.random().toString(36).slice(2, 10);

export const newSetup = (n: number): Setup => ({
  id: newId(), name: `Setup ${n}`, featuring: "", time: "", location: "",
  shots: [{ type: "Stills", shots: "" }, { type: "Video / Reel b-roll", shots: "" }], products: "", props: "",
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, max) : "");
const list = (v: unknown, max: number) => ((Array.isArray(v) ? v : []) as unknown[]).filter((x) => x && typeof x === "object").slice(0, max) as Record<string, unknown>[];
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : newId());

/** Tidy a plan from the form or the database: keeps known fields, caps sizes, drops blank rows. */
export function cleanPlan(raw: unknown): ShootPlan {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const setups = list(p.setups, 30).map((s): Setup => ({
    id: id(s.id),
    name: str(s.name, 120).trim(),
    featuring: str(s.featuring, 200).trim(),
    time: str(s.time, 60).trim(),
    location: str(s.location, 160).trim(),
    shots: list(s.shots, 12).map((r) => ({ type: str(r.type, 60).trim(), shots: str(r.shots, 3000).trim() })).filter((r) => r.type || r.shots),
    products: str(s.products, 3000).trim(),
    props: str(s.props, 3000).trim(),
  })).filter((s) => s.name || s.featuring || s.shots.some((r) => r.shots) || s.products || s.props);
  const setupIds = new Set(setups.map((s) => s.id));
  return {
    title: str(p.title, 120).trim(),
    purpose: str(p.purpose, 4000).trim(),
    goal: str(p.goal, 2000).trim(),
    tone: str(p.tone, 2000).trim(),
    setups,
    locations: list(p.locations, 20).map((l) => ({ id: id(l.id), venue: str(l.venue, 160).trim(), address: str(l.address, 300).trim(), notes: str(l.notes, 1000).trim() }))
      .filter((l) => l.venue || l.address),
    needsModels: p.needsModels === true,
    models: list(p.models, 40).map((m) => ({
      id: id(m.id), name: str(m.name, 120).trim(),
      setupIds: (Array.isArray(m.setupIds) ? m.setupIds : []).filter((x): x is string => typeof x === "string" && setupIds.has(x)),
      size: str(m.size, 40).trim(), waiverSigned: m.waiverSigned === true, notes: str(m.notes, 500).trim(),
    })).filter((m) => m.name),
    bonus: str(p.bonus, 3000).trim(),
    timeline: list(p.timeline, 60).map((t) => ({ time: str(t.time, 40).trim(), text: str(t.text, 300).trim() })).filter((t) => t.text),
  };
}

/** Lines of a one-per-line field, without bullets someone typed. */
export const lines = (text: string) => text.split("\n").map((l) => l.replace(/^\s*(?:[-•*●]|\d+[.)])\s*/, "").trim()).filter(Boolean);

/** Which setups use a location (matched by venue name). */
export const usedFor = (plan: ShootPlan, venue: string) =>
  plan.setups.filter((s) => venue && s.location.toLowerCase().includes(venue.toLowerCase())).map((s) => s.name || "Untitled setup");

export const planIsEmpty = (p: ShootPlan) => JSON.stringify(cleanPlan(p)) === JSON.stringify(cleanPlan(EMPTY_PLAN));

export const samePlan = (a: ShootPlan, b: ShootPlan) => JSON.stringify(cleanPlan(a)) === JSON.stringify(cleanPlan(b));
