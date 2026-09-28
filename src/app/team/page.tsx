import { memberColors } from "@/lib/memberColors";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadTaskPeople } from "@/lib/taskPeople";
import type { Task } from "@/lib/types";
import { getDueDates, googleStatus } from "@/lib/google";
import { describeDueDates, monthKey, weekOfMonth, weekRange } from "@/lib/rhythm";
import { RhythmPanel } from "./RhythmPanel";
import { ApprovalCard, TaskCard } from "./TaskCard";
import { FilterStat, FilterTabs, TaskFilterRoot, WhoSelect } from "./TaskFilter";
import { DragBoard, DragCard, DropColumn } from "./DragBoard";
import { NewTask } from "./TeamForms";
import { isClientFacing } from "@/lib/tasks";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "waiting", label: "Waiting on client" },
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; due?: string }> }) {
  const { agency, userId, member } = await requireTeam();
  const canEdit = member.role !== "creator";
  const { who = "all", due: dueFilter = "all" } = await searchParams;
  const supabase = await createClient();
  const monthStart = new Date(`${monthKey(agency.timezone)}T00:00:00Z`);
  const horizon = new Date(monthStart.getTime() + 75 * 86_400_000);
  const [{ data: tasks }, { data: clients }, { data: members }, people, { data: checks }, dueEvents, google, { data: openApprovalRows }] = await Promise.all([
    supabase.from("tasks").select("*").neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id, name").is("archived_at", null).order("name"),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id),
    loadTaskPeople(supabase, agency.id, userId),
    supabase.from("rhythm_checks").select("user_id, week, item").eq("agency_id", agency.id).eq("month", monthKey(agency.timezone)),
    getDueDates(agency.id, monthStart.toISOString(), horizon.toISOString()),
    googleStatus(agency.id),
    supabase.from("content_calendars").select("id, client_id, month, rella_url, due_at, clients!inner(archived_at)").eq("status", "pending").is("clients.archived_at", null).order("due_at"),
  ]);
  const pendingCals = (openApprovalRows ?? []) as { id: string; client_id: string; month: string; rella_url: string; due_at: string }[];
  const openApprovals = pendingCals.length;
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
  const colors = memberColors((members ?? []).map((m) => m.user_id));
  Object.values(people.contacts).flat().forEach((c) => names.set(c.user_id, c.display_name));
  // Archived clients drop off the board.
  const forWho = ((tasks ?? []) as Task[]).filter((t) => !t.client_id || t.client_id in clientName).filter((t) => who === "all" || t.assignee_id === (who === "me" ? userId : who));

  const now = Date.now();
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(d);
  const todayKey = dayOf(new Date());
  const weekEnd = dayOf(new Date(now + 6 * 86_400_000));
  const overdue = (t: Task) => !!t.due_at && new Date(t.due_at).getTime() < now;
  const isToday = (t: Task) => !!t.due_at && !overdue(t) && dayOf(new Date(t.due_at)) === todayKey;
  const inWeek = (t: Task) => !!t.due_at && dayOf(new Date(t.due_at)) <= weekEnd;
  const dueToday = forWho.filter(isToday).length;
  const FILTERS: Record<string, { label: string; test: (t: Task) => boolean }> = {
    all: { label: "All", test: () => true },
    overdue: { label: "Overdue", test: overdue },
    today: { label: "Due today", test: isToday },
    week: { label: "Due in the next 7 days", test: inWeek },
  };
  const filter = FILTERS[dueFilter] ? dueFilter : "all";
  // Overdue first, then soonest due, then no date. The due filter runs in the browser (see TaskFilter).
  const list = [...forWho].sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const tagsFor = (t: { due_at: string | null }) => {
    const x = t as Task;
    return ["all", ...(["overdue", "today", "week"] as const).filter((k) => FILTERS[k].test(x))].join(" ");
  };
  const counts = (items: { due_at: string | null }[]) => Object.fromEntries(Object.keys(FILTERS).map((k) => [k, items.filter((t) => FILTERS[k].test(t as Task)).length]));

  // A friendly hello, like clients get in their portal. Counts are for this person.
  const mine = ((tasks ?? []) as Task[]).filter((t) => t.assignee_id === userId && (!t.client_id || t.client_id in clientName));
  const myToday = mine.filter(isToday).length;
  const myLate = mine.filter(overdue).length;
  const hour = +new Intl.DateTimeFormat("en-US", { timeZone: agency.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date());
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const summary = [
    myToday ? `${myToday} task${myToday === 1 ? "" : "s"} due today` : null,
    myLate ? `${myLate} overdue` : null,
    openApprovals ? `${openApprovals} content approval${openApprovals === 1 ? "" : "s"} waiting on clients` : null,
  ].filter(Boolean);

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <div className="hello">
        <p className="eyebrow">{agency.brand.shortName ?? agency.name} · Week {currentWeek}</p>
        <h1>{hello}, <em>{member.display_name.split(" ")[0]}.</em></h1>
        <p>{summary.length ? `You have ${summary.join(", ")}.` : "You're all caught up. Nice work."}</p>
      </div>
      <div className="top">
        <h2 style={{ fontSize: "2rem" }}>Tasks</h2>
        <WhoSelect value={who} options={[{ value: "all", label: "Everyone" }, { value: "me", label: "Me" }, ...(members ?? []).map((m) => ({ value: m.user_id, label: m.display_name }))]} />
      </div>

      <RhythmPanel rhythm={rhythm} current={currentWeek} teamProgress={teamProgress}
        ranges={Object.fromEntries([1, 2, 3, 4].map((w) => [w, weekRange(w, agency.timezone)]))}
        checks={rhythmChecks} canEdit
        dueDates={describeDueDates(dueEvents, agency.timezone)} calendarName={google.calendarId ? google.calendarName : null} />

      <TaskFilterRoot initial={filter}>
      <div className="stats">
        <FilterStat filter="today" className={dueToday ? "warn" : ""}><b>{dueToday}</b><span>Due today</span></FilterStat>
        <FilterStat filter="overdue" className={forWho.some(overdue) ? "crit" : ""}><b>{forWho.filter(overdue).length}</b><span>Overdue</span></FilterStat>
        <div className="stat warn"><b>{forWho.filter(isClientFacing).length}</b><span>Waiting on clients</span></div>
        <div className="stat"><b>{openApprovals ?? 0}</b><span>Content approvals open</span></div>
      </div>

      <div className="task-bar">
        {canEdit ? <NewTask clients={clients ?? []} people={people} /> : <p className="note">You have view-only access. You can see tasks on your clients but can&apos;t change them.</p>}
        <FilterTabs options={Object.entries(FILTERS).map(([key, f]) => {
          const n = forWho.filter(f.test).length;
          return { key, label: f.label, count: key === "all" ? undefined : n, alert: key === "overdue" && n > 0 };
        })} />
      </div>

      {canEdit && <p className="note">Drag a card to another column to change its status, or onto Done to finish it.</p>}
      <DragBoard enabled={canEdit}>
        {COLUMNS.map((col) => {
          const items = list.filter((t) => t.status === col.key);
          // Content calendars waiting for approval sit with the other things waiting on clients.
          const approvals = col.key === "waiting" ? pendingCals.filter((c) => c.client_id in clientName) : [];
          return (
            <DropColumn status={col.key} key={col.key}>
              <h2>{col.label}{Object.entries(counts([...items, ...approvals])).map(([k, n]) => <span key={k} data-count-for={k}>{n}</span>)}</h2>
              {approvals.map((c) => (
                <div key={c.id} data-due={tagsFor(c)}>
                  <ApprovalCard cal={c} clientName={clientName[c.client_id]} timeZone={agency.timezone} canEdit={canEdit} />
                </div>
              ))}
              {items.map((t) => (
                <DragCard id={t.id} key={t.id} tags={tagsFor(t)}>
                  <TaskCard task={t} clientName={t.client_id ? clientName[t.client_id] : undefined} 
                    personName={(id) => names.get(id)} colorOf={(id) => colors.get(id)} timeZone={agency.timezone} canEdit={canEdit} />
                </DragCard>
              ))}
              {Object.entries(counts([...items, ...approvals])).filter(([, n]) => !n).map(([k]) => (
                <p key={k} className="note" data-empty-for={k} style={{ padding: 6 }}>{k === "all" ? "Nothing here." : "Nothing matches this filter."}</p>
              ))}
            </DropColumn>
          );
        })}
      </DragBoard>
      </TaskFilterRoot>
    </section>
  );
}
