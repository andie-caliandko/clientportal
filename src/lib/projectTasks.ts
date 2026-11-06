import { SERVICES, serviceLabel, type ServiceId } from "./services";

/** A project is one of our services (website, branding and so on), with a timeline of team tasks, usually a month long. */
export const PROJECTS = SERVICES;

export type ProjectId = ServiceId;
export const isProject = (id: unknown): id is ProjectId => SERVICES.some((p) => p.id === id);
export const projectLabel = (id: string) => serviceLabel(id);

/** One task in the timeline. `days` counts from the project's start date. */
export type TemplateTask = { title: string; note?: string; days?: number; assignee?: string };

/** The length the timelines are written for. */
export const BASE_DAYS = 30;

export type PlannedTask = { title: string; note: string | null; date: string; assignee_id: string };

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Dated tasks for a project. A longer or shorter project stretches every date to match,
 * so a 45-day website keeps the same steps in the same order. "me" tasks go to whoever starts it.
 */
export function planProject(project: ProjectId, template: TemplateTask[], opts: { start: string; length?: number; am: string; me: string }): PlannedTask[] {
  const scale = (opts.length ?? BASE_DAYS) / BASE_DAYS;
  const label = projectLabel(project);
  return [...template]
    .filter((t) => t.title?.trim())
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .map((t) => ({
      title: `${label}: ${t.title.trim()}`,
      note: t.note?.trim() || null,
      date: addDays(opts.start, Math.round((t.days ?? 0) * scale)),
      assignee_id: t.assignee === "me" ? opts.me : opts.am,
    }));
}

/** A timeline from the Settings form: titles, notes, days and who it goes to, sorted by day. */
export function readTemplate(form: FormData): TemplateTask[] {
  const titles = form.getAll("title").map((t) => String(t).trim().slice(0, 200));
  const notes = form.getAll("note").map((t) => String(t).trim().slice(0, 1000));
  const days = form.getAll("days").map((d) => Math.max(0, Math.min(365, Math.round(Number(d) || 0))));
  const who = form.getAll("assignee").map(String);
  return titles
    .map((title, i) => ({ title, days: days[i] ?? 0, assignee: who[i] === "me" ? "me" : "account_manager", ...(notes[i] ? { note: notes[i] } : {}) }))
    .filter((t) => t.title)
    .sort((a, b) => a.days - b.days);
}
