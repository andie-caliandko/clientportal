import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadTaskPeople } from "@/lib/taskPeople";
import type { Task } from "@/lib/types";
import { getDueDates, googleStatus } from "@/lib/google";
import { describeDueDates, monthKey, weekOfMonth, weekRange } from "@/lib/rhythm";
import { RhythmPanel } from "./RhythmPanel";
import { TaskCard } from "./TaskCard";
import { DragBoard, DragCard, DropColumn } from "./DragBoard";
import { NewTask } from "./TeamForms";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "waiting", label: "Waiting on client" },
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { agency, userId, member } = await requireTeam();
  const canEdit = member.role !== "creator";
  const agencyShort = agency.brand.shortName ?? agency.name;
  const { who = "all" } = await searchParams;
  const supabase = await createClient();
  const monthStart = new Date(`${monthKey(agency.timezone)}T00:00:00Z`);
  const horizon = new Date(monthStart.getTime() + 75 * 86_400_000);
  const [{ data: tasks }, { data: clients }, { data: members }, people, { data: checks }, dueEvents, google, { count: openApprovals }] = await Promise.all([
    supabase.from("tasks").select("*").neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id, name").is("archived_at", null).order("name"),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id),
    loadTaskPeople(supabase, agency.id, userId),
    supabase.from("rhythm_checks").select("user_id, week, item").eq("agency_id", agency.id).eq("month", monthKey(agency.timezone)),
    getDueDates(agency.id, monthStart.toISOString(), horizon.toISOString()),
    googleStatus(agency.id),
    supabase.from("content_calendars").select("id, clients!inner(archived_at)", { count: "exact", head: true }).eq("status", "pending").is("clients.archived_at", null),
  ]);
  // My own check-offs. Admins also get everyone else's rows (RLS), for the progress circles.
  const rhythmChecks = Object.fromEntries((checks ?? []).filter((c) => c.user_id === userId).map((c) => [`${c.week}-${c.item}`, true]));
  const rhythm = agency.monthly_rhythm ?? [];
  const currentWeek = weekOfMonth(agency.timezone);
  const weekTotal = rhythm.find((w) => w.week === currentWeek)?.items.length ?? 0;
  const soFarTotal = rhythm.filter((w) => w.week <= currentWeek).reduce((n, w) => n + w.items.length, 0);
  const teamProgress = member.role === "admin"
    ? (members ?? []).map((m) => {
        const mine = (checks ?? []).filter((c) => c.user_id === m.user_id);
        return {
          id: m.user_id,
          name: m.display_name,
          weekDone: mine.filter((c) => c.week === currentWeek).length,
          weekTotal,
          soFarDone: mine.filter((c) => c.week <= currentWeek).length,
          soFarTotal,
          items: mine.filter((c) => c.week === currentWeek).map((c) => c.item),
        };
      })
    : null;

  const clientName = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]));
  const names = new Map<string, string>((members ?? []).map((m) => [m.user_id, m.display_name]));
  Object.values(people.contacts).flat().forEach((c) => names.set(c.user_id, c.display_name));
  // Archived clients drop off the board.
  const list = ((tasks ?? []) as Task[]).filter((t) => !t.client_id || t.client_id in clientName).filter((t) => who === "all" || t.assignee_id === (who === "me" ? userId : who));

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const overdue = (t: Task) => !!t.due_at && new Date(t.due_at).getTime() < now;
  const dueToday = list.filter((t) => t.due_at && new Date(t.due_at) <= endOfToday && !overdue(t)).length;

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <div className="top">
        <h1>Tasks</h1>
        <form className="row" style={{ alignItems: "center" }}>
          <label htmlFor="who" className="note">Show tasks for</label>
          <select className="sel" id="who" name="who" defaultValue={who}>
            <option value="all">Everyone</option>
            <option value="me">Me</option>
            {(members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
          <button className="btn sm line">Show</button>
        </form>
      </div>

      <RhythmPanel rhythm={rhythm} current={currentWeek} teamProgress={teamProgress}
        ranges={Object.fromEntries([1, 2, 3, 4].map((w) => [w, weekRange(w, agency.timezone)]))}
        checks={rhythmChecks} canEdit
        dueDates={describeDueDates(dueEvents, agency.timezone)} calendarName={google.calendarId ? google.calendarName : null} />

      <div className="stats">
        <div className="stat"><b>{dueToday}</b><span>Due today</span></div>
        <div className={`stat ${list.some(overdue) ? "crit" : ""}`}><b>{list.filter(overdue).length}</b><span>Overdue</span></div>
        <div className="stat warn"><b>{list.filter((t) => t.status === "waiting" || t.client_assignee_id).length}</b><span>Waiting on clients</span></div>
        <div className="stat"><b>{openApprovals ?? 0}</b><span>Content approvals open</span></div>
      </div>

      {canEdit ? <NewTask clients={clients ?? []} people={people} /> : <p className="note">You have view-only access. You can see tasks on your clients but can&apos;t change them.</p>}

      {canEdit && <p className="note">Drag a card to another column to change its status, or onto Done to finish it.</p>}
      <DragBoard enabled={canEdit}>
        {COLUMNS.map((col) => {
          const items = list.filter((t) => t.status === col.key);
          return (
            <DropColumn status={col.key} key={col.key}>
              <h2>{col.label}<span>{items.length}</span></h2>
              {items.map((t) => (
                <DragCard id={t.id} key={t.id}>
                  <TaskCard task={t} clientName={t.client_id ? clientName[t.client_id] : undefined} agencyName={agencyShort}
                    personName={(id) => names.get(id)} timeZone={agency.timezone} canEdit={canEdit} />
                </DragCard>
              ))}
              {!items.length && <p className="note" style={{ padding: 6 }}>Nothing here.</p>}
            </DropColumn>
          );
        })}
      </DragBoard>
    </section>
  );
}
