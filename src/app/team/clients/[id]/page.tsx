import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDue } from "@/lib/approval";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Calendar, type ClientUser, type Doc, type Message, type Question, type Role, type Step } from "@/lib/types";
import { addToClient, removeFromClient, replyAsTeam, setAccountManager, setStep } from "../../actions";
import { ClientInfoForm, ConfirmButton, CopyButton, DeleteClientForm, EditCalendar, NewTask, SendCalendarForm, UploadDocForm } from "../../TeamForms";
import { HealthTab } from "./HealthTab";
import { loadHealth } from "@/lib/healthData";
import { weekStart } from "@/lib/health";
import { driveFolderUrl } from "@/lib/links";
import { TaskCard } from "../../TaskCard";
import { loadTaskPeople } from "@/lib/taskPeople";
import type { Task } from "@/lib/types";

export default async function ClientDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; answers?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { agency, member, userId } = await requireTeam();
  const isAdmin = member.role === "admin";
  // Anyone who can open this page is on the client's team (or an admin); creators are view only.
  const canEdit = member.role !== "creator";
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();

  const [steps, status, cals, docs, people, messages, questions, answers, manager, teamRows, allMembers, tasks, taskPeople] = await Promise.all([
    supabase.from("onboarding_steps").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("client_step_status").select("step_id, completed_at").eq("client_id", id),
    supabase.from("content_calendars").select("*").eq("client_id", id).order("sent_at", { ascending: false }),
    supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("client_users").select("*").eq("client_id", id),
    supabase.from("messages").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("questions").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", id),
    client.account_manager_id
      ? supabase.from("agency_members").select("display_name").eq("user_id", client.account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("client_team").select("user_id").eq("client_id", id),
    supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agency.id).order("display_name"),
    supabase.from("tasks").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
    loadTaskPeople(supabase, agency.id, userId),
  ]);
  const names = new Map<string, string>(members0(allMembers.data));
  ((people.data ?? []) as ClientUser[]).forEach((p) => names.set(p.user_id, p.display_name));
  const allTasks = (tasks.data ?? []) as Task[];
  const openTasks = allTasks.filter((t) => t.status !== "done");
  const finishedByClient = allTasks.filter((t) => t.status === "done" && t.client_assignee_id).slice(0, 5);
  const onTeam = new Set((teamRows.data ?? []).map((t) => t.user_id));
  const members = (allMembers.data ?? []) as { user_id: string; display_name: string; role: Role }[];
  const accountTeam = members.filter((m) => m.role === "admin" || onTeam.has(m.user_id));
  const addable = members.filter((m) => m.role !== "admin" && !onTeam.has(m.user_id));

  const done = new Map((status.data ?? []).map((s) => [s.step_id, s.completed_at]));
  const answerBy = Object.fromEntries((answers.data ?? []).map((a) => [a.question_id, a.body]));
  const tz = agency.timezone;
  const short = (d: string) => new Date(d).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const monthName = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const portalLink = `${process.env.NEXT_PUBLIC_SITE_URL}/login?client=${client.slug}`;
  const headActions = (
    <div className="head-actions">
      <CopyButton text={portalLink} label="Copy portal link" done="Link copied" />
      <Link className="btn sm" href={`/preview/${client.id}`}>View their portal</Link>
    </div>
  );
  const tab = sp.tab === "health" ? "health" : "portal";
  const tabs = (
    <div className="tabs" role="tablist" aria-label="Client sections">
      <Link href={`/team/clients/${client.id}`} role="tab" aria-selected={tab === "portal"}>Portal</Link>
      <Link href={`/team/clients/${client.id}?tab=health`} role="tab" aria-selected={tab === "health"}>Account health · internal</Link>
    </div>
  );

  if (tab === "health") {
    const [{ byClient, health }, { data: noteRows }] = await Promise.all([
      loadHealth(supabase, [client.id]),
      supabase.from("scorecard_notes").select("week, note").eq("client_id", client.id),
    ]);
    const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return (
      <section style={{ display: "grid", gap: 18 }}>
        <Link href="/team/clients" className="note">← All clients</Link>
        <div className="top">
          <div>
            <p className="eyebrow">Account manager: {manager.data?.display_name ?? "Unassigned"}</p>
            <h1 style={{ marginTop: 6 }}>{client.name}</h1>
          </div>
          {headActions}
        </div>
        {tabs}
        <HealthTab clientId={client.id} clientName={client.name} kpis={byClient.get(client.id) ?? []}
          health={health.get(client.id) ?? null}
          notes={Object.fromEntries((noteRows ?? []).map((n) => [n.week, n.note]))}
          thisWeek={weekStart(todayLocal)} canEdit={canEdit} />
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <Link href="/team/clients" className="note">← All clients</Link>
      <div className="top">
        <div>
          <p className="eyebrow">Account manager: {manager.data?.display_name ?? "Unassigned"}</p>
          <h1 style={{ marginTop: 6 }}>{client.name}</h1>
        </div>
        {headActions}
      </div>
      {!canEdit && <p className="readonly">View only. Creators can see this account but can&apos;t make changes.</p>}
      {tabs}
      {sp.created && <p className="flash">Client created. {people.data?.[0]?.display_name ?? "The main contact"} has an invite to set their password.</p>}

      <div className="panel">
        <h2>Tasks</h2>
        {canEdit && <NewTask clients={[{ id: client.id, name: client.name }]} people={taskPeople} clientId={client.id} />}
        {[
          { key: "client", title: client.name, hint: "Assigned to the client, or waiting on them.", list: openTasks.filter((t) => t.client_assignee_id || t.status === "waiting") },
          { key: "team", title: agency.brand.shortName ?? agency.name, hint: "Only your team sees these.", list: openTasks.filter((t) => !t.client_assignee_id && t.status !== "waiting") },
        ].map((g) => (
          <div className="task-group" key={g.key}>
            <h3>{g.title} <span>{g.list.length} open · {g.hint}</span></h3>
            {g.list.length ? (
              <div className="board" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {g.list.map((t) => (
                  <TaskCard key={t.id} task={t} clientName={client.name} agencyName={agency.brand.shortName ?? agency.name}
                    showClientChip={false} personName={(uid) => names.get(uid)} timeZone={tz} canEdit={canEdit} />
                ))}
              </div>
            ) : (
              <p className="note">{g.key === "client" ? `Nothing assigned to ${client.name} right now.` : "No open team tasks."}</p>
            )}
          </div>
        ))}
        {finishedByClient.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 8 }}>Recently finished by the client</p>
            <ul className="list">
              {finishedByClient.map((t) => (
                <li key={t.id} style={{ display: "grid", gap: 4 }}>
                  <span><b>{t.title}</b> <span className="note">· {names.get(t.client_assignee_id!)} · {t.completed_at ? short(t.completed_at) : ""}</span></span>
                  {t.completion_comment && <span className="note">&ldquo;{t.completion_comment}&rdquo;</span>}
                  {t.completion_file_path && <FileLink path={t.completion_file_path} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="cgrid">
        <div className="panel">
          <h2>Content calendar</h2>
          <p className="note">
            Paste the Rella link when a month is ready. The client gets an email right away and has{" "}
            {agency.approval_window_hours} hours{agency.approval_skip_weekends ? ", not counting weekends," : ""} to approve.
            If they don&apos;t reply, it&apos;s approved automatically and marked that the client didn&apos;t approve in time.
          </p>
          {canEdit && <SendCalendarForm clientId={client.id} />}
          <ul className="list">
            {((cals.data ?? []) as Calendar[]).map((c) => (
              <li key={c.id}>
                <b>{monthName(c.month)}</b>
                <span className="note">Sent {short(c.sent_at)}</span>
                <span className="r">
                  {canEdit && <EditCalendar id={c.id} month={c.month.slice(0, 7)} url={c.rella_url} />}
                  {c.status === "pending" && <span className="pill warn">Due {formatDue(new Date(c.due_at), tz)}</span>}
                  {c.status === "approved" && <span className="pill ok">Approved by client</span>}
                  {c.status === "auto_approved" && <span className="pill info">Auto-approved · client did not approve in window</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Strategy &amp; reports</h2>
          <p className="note">PDFs show inside the client&apos;s portal. They can read them without downloading anything.</p>
          <ul className="list">
            {((docs.data ?? []) as Doc[]).map((d) => (
              <li key={d.id}>
                <span className="pill info">{d.kind === "report" ? "Report" : "Strategy"}</span>
                {d.title}
                <span className="r note">{short(d.created_at)}</span>
              </li>
            ))}
            {!docs.data?.length && <li className="note">Nothing added yet.</li>}
          </ul>
          {canEdit && <UploadDocForm agencyId={agency.id} clientId={client.id} />}
        </div>

        <div className="panel">
          <h2>Onboarding</h2>
          <ul className="list">
            {((steps.data ?? []) as Step[]).map((s) => (
              <li key={s.id}>
                {s.title}
                <span className="r">
                  {done.has(s.id) ? <span className="pill ok">Done {short(done.get(s.id)!)}</span> : <span className="note">Not yet</span>}
                  {canEdit && <form action={setStep}>
                    <input type="hidden" name="client" value={client.id} />
                    <input type="hidden" name="step" value={s.id} />
                    <input type="hidden" name="done" value={done.has(s.id) ? "0" : "1"} />
                    <button className="linkbtn note">{done.has(s.id) ? "Undo" : "Mark done"}</button>
                  </form>}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Link className="btn sm line" href={sp.answers ? `/team/clients/${client.id}` : `/team/clients/${client.id}?answers=1#answers`}>
              {sp.answers ? "Hide questionnaire answers" : "View questionnaire answers"}
            </Link>
          </div>
        </div>

        <div className="panel">
          <h2>Connected</h2>
          <dl className="kv">
            <dt>Google Drive</dt><dd>{client.drive_folder_id ? <a href={driveFolderUrl(client.drive_folder_id)} target="_blank" rel="noreferrer">Open folder</a> : <span className="note">Not set</span>}</dd>
            <dt>Slack channel</dt><dd>{client.slack_channel_id ?? <span className="note">Not set</span>}</dd>
            <dt>Rella space</dt><dd>{client.rella_space_url ? <a href={client.rella_space_url} target="_blank" rel="noreferrer">Open</a> : <span className="note">Not set</span>}</dd>
            <dt>Contract</dt><dd>{client.dubsado_project_url ? <a href={client.dubsado_project_url} target="_blank" rel="noreferrer">Open contract</a> : <span className="note">No link yet</span>}</dd>
            <dt>Dubsado email</dt><dd>{client.dubsado_email ?? <span className="note">Not set</span>}</dd>
            <dt>Website</dt><dd>{client.website ? <a href={client.website} target="_blank" rel="noreferrer">{client.website.replace(/^https?:\/\//, "")}</a> : <span className="note">Not set</span>}</dd>
            <dt>Start date</dt><dd>{client.start_date ? new Date(`${client.start_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : <span className="note">Not set</span>}</dd>
            <dt>Client logins</dt>
            <dd>{((people.data ?? []) as ClientUser[]).map((p) => `${p.display_name}${p.role === "owner" ? " (owner)" : ""}`).join(" · ") || "None"}</dd>
          </dl>
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Team on this account</h2>
          <p className="note">The client only sees their account manager. Admins can always see every account.</p>
          <ul className="list">
            {accountTeam.map((m) => (
              <li key={m.user_id}>
                <b>{m.display_name}</b>
                <span className="note">{ROLE_LABEL[m.role]}{m.role === "admin" ? " · all clients" : ""}</span>
                <span className="r">
                  {m.user_id === client.account_manager_id && <span className="pill ok">Client sees this person</span>}
                  {isAdmin && m.role !== "creator" && m.user_id !== client.account_manager_id && (
                    <form action={setAccountManager}>
                      <input type="hidden" name="client" value={client.id} />
                      <input type="hidden" name="user" value={m.user_id} />
                      <button className="btn sm line">Make account manager</button>
                    </form>
                  )}
                  {isAdmin && m.role !== "admin" && (
                    <form action={removeFromClient}>
                      <input type="hidden" name="client" value={client.id} />
                      <input type="hidden" name="user" value={m.user_id} />
                      <ConfirmButton label="Remove" confirmLabel="Remove from account?" />
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {isAdmin && addable.length > 0 && (
            <form action={addToClient} className="row">
              <input type="hidden" name="client" value={client.id} />
              <div className="field">
                <label htmlFor="add-member">Add a teammate</label>
                <select className="sel" id="add-member" name="user">
                  {addable.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name} · {ROLE_LABEL[m.role]}</option>)}
                </select>
              </div>
              <button className="btn sm">Add to this account</button>
            </form>
          )}
        </div>

        {isAdmin && (
          <div className="panel">
            <h2>Client info</h2>
            <ClientInfoForm client={client} />
          </div>
        )}
        {isAdmin && (
          <div className="panel">
            <h2>Delete client</h2>
            <p className="note">Removes their portal and everything in it.</p>
            <DeleteClientForm clientId={client.id} name={client.name} />
          </div>
        )}
      </div>

      {sp.answers && (
        <div className="panel" id="answers">
          <h2>Questionnaire answers</h2>
          <dl style={{ display: "grid", gap: 16, margin: 0 }}>
            {((questions.data ?? []) as Question[]).map((q) => (
              <div key={q.id}>
                <dt style={{ fontWeight: 600 }}>{q.position}. {q.prompt}</dt>
                <dd style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: answerBy[q.id] ? "var(--ink)" : "var(--ink-2)" }}>
                  {answerBy[q.id] || "Not answered yet"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="panel">
        <h2>Messages</h2>
        <p className="note">These also appear in the client&apos;s Slack channel. Replies in Slack show up in their portal automatically.</p>
        {canEdit && <form action={replyAsTeam} className="compose">
          <input type="hidden" name="client" value={client.id} />
          <label htmlFor="reply" className="sr">Reply</label>
          <textarea id="reply" name="body" placeholder={`Reply to ${client.name}…`} required />
          <button className="btn">Send</button>
        </form>}
        <div className="thread" style={{ maxHeight: 420 }}>
          {((messages.data ?? []) as Message[]).map((m) => (
            <div key={m.id} className={`msg ${m.author_kind === "team" ? "me" : ""}`}>
              <span className="av">{m.author_name[0]}</span>
              <div className="bubble"><small>{m.author_name} · {short(m.created_at)}</small>{m.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function members0(rows: { user_id: string; display_name: string }[] | null): [string, string][] {
  return (rows ?? []).map((m) => [m.user_id, m.display_name]);
}

async function FileLink({ path }: { path: string }) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60);
  const name = path.split("/").pop()?.replace(/^\d+-/, "") ?? "file";
  return data?.signedUrl ? <a className="note" href={data.signedUrl} target="_blank" rel="noreferrer">Attached: {name}</a> : null;
}
