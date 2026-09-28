import { BriefForm } from "../BriefForm";
import { connectedMembers } from "@/lib/google";
import { inviteReplies, type CallRequest } from "@/lib/calls";
import { CallActions } from "../../calendar/CallRequestForm";
import { cancelCallRequest } from "../../calendar/actions";
import { memberColors } from "@/lib/memberColors";
import { Avatar } from "@/app/Avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDue } from "@/lib/approval";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Calendar, type ClientUser, type Doc, type Message, type Question, type Role, type Step } from "@/lib/types";
import { archiveClient, deleteBrief, removeClientContact, removeFromClient, replyAsTeam, setAccountManager, setStep } from "../../actions";
import { AddClientContact, AddTeammate, ClientInfoForm, ClientLogoForm, ConfirmButton, ContractLinkForm, CopyButton, DeleteClientForm, EditCalendar, NewTask, SendCalendarForm, UploadDocForm } from "../../TeamForms";
import { HealthTab } from "./HealthTab";
import { loadHealth } from "@/lib/healthData";
import { weekStart } from "@/lib/health";
import { clientLogoUrl, driveFolderUrl, embedUrl } from "@/lib/links";
import { driveFileUrl } from "@/lib/drive";
import { MessageComposer } from "@/app/portal/MessageComposer";
import { MessageFiles, signAttachments } from "@/app/portal/MessageFiles";
import { ScrollToLatest } from "@/app/portal/ScrollToLatest";
import { FilePreview } from "@/app/portal/FilePreview";
import { ApprovalCard, TaskCard } from "../../TaskCard";
import { loadTaskPeople } from "@/lib/taskPeople";
import type { Task } from "@/lib/types";
import { isClientFacing } from "@/lib/tasks";

// Saving a Drive folder link copies the client's waiting files in the background.
export const maxDuration = 300;

export default async function ClientDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; answers?: string; tab?: string; restored?: string; invite?: string; brief?: string }>;
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
  if (client.archived_at && member.role !== "admin") notFound();

  const [steps, status, cals, docs, people, messages, questions, answers, manager, teamRows, allMembers, tasks, taskPeople, uploads, callRows, linked, briefRows] = await Promise.all([
    supabase.from("onboarding_steps").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("client_step_status").select("step_id, completed_at").eq("client_id", id),
    supabase.from("content_calendars").select("*").eq("client_id", id).order("sent_at", { ascending: false }),
    supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("client_users").select("*").eq("client_id", id),
    supabase.from("messages").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("questions").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("answers").select("question_id, body").eq("client_id", id),
    client.account_manager_id
      ? supabase.from("agency_members").select("display_name").eq("user_id", client.account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("client_team").select("user_id").eq("client_id", id),
    supabase.from("agency_members").select("user_id, display_name, role, avatar_path").eq("agency_id", agency.id).order("display_name"),
    supabase.from("tasks").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
    loadTaskPeople(supabase, agency.id, userId),
    supabase.from("uploads").select("id, kind, file_name, storage_path, drive_file_id, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("call_requests").select("*").eq("client_id", id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(10),
    connectedMembers(agency.id),
    supabase.from("client_briefs").select("*").eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  const briefs = (briefRows.data ?? []) as { id: string; title: string; notes: string | null; url: string | null; file_path: string | null; file_name: string | null; created_by: string | null; created_at: string }[];
  const uploadRows = uploads.data ?? [];
  const calls = (callRows.data ?? []) as CallRequest[];
  // File links and invite replies from Google, all at once.
  const briefPaths = briefs.map((b) => b.file_path).filter(Boolean) as string[];
  const [messageFileUrls, signedUploads, replyList, signedBriefs] = await Promise.all([
    signAttachments(supabase, (messages.data ?? []) as Message[]),
    uploadRows.length ? supabase.storage.from("uploads").createSignedUrls(uploadRows.map((u) => u.storage_path), 60 * 60) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    Promise.all(
      calls.filter((c) => c.kind === "invite" && c.status === "booked" && c.event_end && new Date(c.event_end).getTime() > Date.now())
        .map(async (c) => [c.id, await inviteReplies(c)] as const),
    ),
    briefPaths.length ? supabase.storage.from("briefs").createSignedUrls(briefPaths, 60 * 60) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const briefLinks = new Map((signedBriefs.data ?? []).map((u) => [u.path, u.signedUrl]));
  const uploadLinks = new Map<string | null, string>((signedUploads.data ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl as string]));
  const replies = new Map(replyList);
  const names = new Map<string, string>(members0(allMembers.data));
  ((people.data ?? []) as ClientUser[]).forEach((p) => names.set(p.user_id, p.display_name));
  const allTasks = (tasks.data ?? []) as Task[];
  // Overdue first, then soonest due, then no date.
  const openTasks = allTasks.filter((t) => t.status !== "done").sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const pendingCals = ((cals.data ?? []) as Calendar[]).filter((c) => c.status === "pending");
  const finishedByClient = allTasks.filter((t) => t.status === "done" && t.client_assignee_id).slice(0, 5);
  const onTeam = new Set((teamRows.data ?? []).map((t) => t.user_id));
  const members = (allMembers.data ?? []) as { user_id: string; display_name: string; role: Role; avatar_path: string | null }[];
  const colors = memberColors(members.map((m) => m.user_id));
  const photoOf = (m: Message) => members.find((x) => x.user_id === m.author_id)?.avatar_path ?? (m.author_kind === "team" ? members.find((x) => x.display_name === m.author_name)?.avatar_path : null);
  // Account managers and creators added here show to the client; admins never do
  // (unless an admin is the account manager). Admins can open every account anyway.
  const accountTeam = members.filter((m) => onTeam.has(m.user_id) && (m.role !== "admin" || m.user_id === client.account_manager_id));
  const otherAdmins = members.filter((m) => m.role === "admin" && m.user_id !== client.account_manager_id);
  const addable = members.filter((m) => m.role !== "admin" && !onTeam.has(m.user_id));

  const done = new Map((status.data ?? []).map((s) => [s.step_id, s.completed_at]));
  // Who can host a client call: the account manager, teammates on the account, and admins.
  const hosts = members
    .filter((m) => m.role !== "creator" && (m.role === "admin" || onTeam.has(m.user_id) || m.user_id === client.account_manager_id))
    .map((m) => ({ user_id: m.user_id, display_name: m.display_name, connected: linked.has(m.user_id) }));
  const defaultHost = (client.account_manager_id && hosts.find((h) => h.user_id === client.account_manager_id && h.connected)?.user_id) || hosts.find((h) => h.connected)?.user_id || userId;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const plusDays = (n: number) => new Date(Date.parse(`${todayStr}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const answerBy = Object.fromEntries((answers.data ?? []).map((a) => [a.question_id, a.body]));
  const tz = agency.timezone;
  const short = (d: string) => new Date(d).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const monthName = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const portalLink = `${process.env.NEXT_PUBLIC_SITE_URL}/login?client=${client.slug}`;
  const logo = clientLogoUrl(client.logo_path);
  const headActions = (
    <div className="head-actions">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img className="head-logo" src={logo} alt={`${client.name} logo`} />}
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
        <div className="row" style={{ alignItems: "center" }}>
          <Link className="btn sm" href={`/team/clients/${client.id}/report`}>Create a report</Link>
          <span className="note">Pick a time frame, then share it with the client or the team.</span>
        </div>
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
      {client.archived_at && (
        <div className="readonly" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <span>Archived on {new Date(client.archived_at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" })}. Their portal is closed; everything here is saved.</span>
          {isAdmin && (
            <form action={archiveClient}>
              <input type="hidden" name="client" value={client.id} />
              <input type="hidden" name="archive" value="0" />
              <button className="btn sm">Restore client</button>
            </form>
          )}
        </div>
      )}
      {sp.restored && <p className="flash">{client.name} is active again. Their portal is open.</p>}
      {sp.created && !sp.invite && <p className="flash">Client created. {people.data?.[0]?.display_name ?? "The main contact"} has an invite to set their password.</p>}
      {sp.created && sp.invite === "failed" && <p className="readonly">Client created, but the portal invite didn&apos;t send. Check their email and add them under People on their portal.</p>}
      {sp.brief && <p className="readonly">The project brief didn&apos;t save{sp.brief === "brief-file" ? " (the file didn't upload)" : ""}. Add it under Project briefs below.</p>}

      <div className="panel">
        <h2>Tasks</h2>
        {canEdit && <NewTask clients={[{ id: client.id, name: client.name }]} people={taskPeople} clientId={client.id} />}
        {[
          { key: "client", title: client.name, hint: "Assigned to the client, or waiting on them.", list: openTasks.filter(isClientFacing), approvals: pendingCals },
          { key: "team", title: agency.brand.shortName ?? agency.name, hint: "Only your team sees these.", list: openTasks.filter((t) => !isClientFacing(t)), approvals: [] as Calendar[] },
        ].map((g) => (
          <div className="task-group" key={g.key}>
            <h3>{g.title} <span>{g.list.length + g.approvals.length} open · {g.hint}</span></h3>
            {g.list.length || g.approvals.length ? (
              <div className="board" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {g.approvals.map((c) => <ApprovalCard key={c.id} cal={c} clientName={client.name} timeZone={tz} showClient={false} canEdit={canEdit} />)}
                {g.list.map((t) => (
                  <TaskCard key={t.id} task={t} clientName={client.name}
                    showClientChip={false} personName={(uid) => names.get(uid)} colorOf={(uid) => colors.get(uid)} timeZone={tz} canEdit={canEdit} />
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

      <div className="panel">
        <div>
          <p className="eyebrow">Internal · the client never sees this</p>
          <h2 style={{ marginTop: 4 }}>Project briefs</h2>
        </div>
        {briefs.length > 0 && (
          <div className="templates">
            {briefs.map((b) => {
              const embed = b.url ? embedUrl(b.url) : null;
              const file = b.file_path ? briefLinks.get(b.file_path) : null;
              return (
                <article key={b.id} className="template brief">
                  <div>
                    <h3>{b.title}</h3>
                    {b.notes && <p className="note">{b.notes}</p>}
                  </div>
                  {embed && <div className="template-embed"><iframe src={embed} title={b.title} loading="lazy" allowFullScreen /></div>}
                  <div className="row" style={{ alignItems: "center" }}>
                    {b.url && <a className="btn sm line" href={b.url} target="_blank" rel="noreferrer">Open</a>}
                    {file && <FilePreview url={file} name={b.file_name ?? "Brief"} label={b.file_name ?? "Open file"} />}
                  </div>
                  <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <span className="task-by">Added by {b.created_by ? names.get(b.created_by) ?? "a former teammate" : "the team"} · {short(b.created_at)}</span>
                    {canEdit && (
                      <form action={deleteBrief}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmButton label="Delete" confirmLabel={`Delete "${b.title}"?`} />
                      </form>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!briefs.length && <p className="note">No briefs yet. Add the first one for {client.name}.</p>}
        {canEdit && <BriefForm agencyId={agency.id} clientId={client.id} />}
      </div>

      <div className="panel">
        <h2>Calls</h2>
        {calls.length > 0 && (
          <ul className="list">
            {calls.map((c) => (
              <li key={c.id}>
                <b>{c.title}</b>
                <span className="note">
                  with {names.get(c.host_id) ?? "the team"} ·{" "}
                  {c.kind === "invite" ? "Invite · " : ""}
                  {c.status === "booked" && c.event_start
                    ? new Date(c.event_start).toLocaleString("en-US", { timeZone: agency.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                    : `waiting for them to pick (${c.window_start.slice(5).replace("-", "/")} – ${c.window_end.slice(5).replace("-", "/")})`}
                </span>
                <span className="r">
                  {c.kind === "invite" ? (
                    (() => {
                      const r = replies.get(c.id);
                      if (c.accepted_at || (r && r.accepted)) return <span className="pill ok">Accepted{r ? ` · ${r.accepted} of ${r.total}` : ""}</span>;
                      if (r && r.declined === r.total) return <span className="pill crit">Declined</span>;
                      return <span className="pill warn">Waiting for a reply</span>;
                    })()
                  ) : c.status === "booked" ? <span className="pill ok">Booked</span> : <span className="pill warn">Waiting on client</span>}
                  {c.status === "booked" && c.meet_link && <a className="btn sm line" href={c.meet_link} target="_blank" rel="noreferrer">Meet link</a>}
                  {c.status === "open" && canEdit && (
                    <form action={cancelCallRequest}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton label="Cancel" confirmLabel="Cancel this request?" />
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <CallActions clientId={client.id} hosts={hosts} defaultHost={defaultHost} from={plusDays(1)} to={plusDays(14)}
            contacts={((people.data ?? []) as ClientUser[]).map((p) => ({ user_id: p.user_id, display_name: p.display_name, email: p.email }))} />
        )}
      </div>

      {/* Side-by-side cards match heights. */}
      <div className="cgrid pairs">
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
          {canEdit ? <ContractLinkForm clientId={client.id} url={client.dubsado_project_url} /> : null}
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

        <div className="panel">
          <h2>People on their portal</h2>
          <ul className="list">
            {((people.data ?? []) as ClientUser[]).map((p) => (
              <li key={p.user_id}>
                <span><b>{p.display_name}</b><br /><span className="note">{p.email}</span></span>
                <span className="r">
                  <span className="pill info">{p.role === "owner" ? "Owner" : "Team member"}</span>
                  {canEdit && p.role !== "owner" && (
                    <form action={removeClientContact}>
                      <input type="hidden" name="client" value={client.id} />
                      <input type="hidden" name="user" value={p.user_id} />
                      <ConfirmButton label="Remove" confirmLabel="Remove access?" />
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {canEdit && (people.data?.length ?? 0) < 2 ? <AddClientContact clientId={client.id} /> : <p className="note">2 of 2 client seats used.</p>}
        </div>

        <div className="panel">
          <h2>Client logo</h2>
          {canEdit ? (
            <ClientLogoForm agencyId={agency.id} clientId={client.id} logoUrl={logo} />
          ) : (
            <div className="logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt="Client logo" /> : <span className="note">No logo yet</span>}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Files from the client</h2>
          <p className="note">
            {client.drive_folder_id
              ? "Everything they upload is also copied into their Google Drive folder."
              : "Add their Google Drive folder under Client info, and uploads will be copied there."}
          </p>
          {uploadRows.length ? (
            <ul className="list">
              {uploadRows.map((u) => (
                <li key={u.id}>
                  <span className="pill info">{u.kind === "task" ? "Task" : u.kind === "branding" ? "Branding" : "Content"}</span>
                  {uploadLinks.get(u.storage_path) ? <FilePreview url={uploadLinks.get(u.storage_path)!} name={u.file_name} /> : u.file_name}
                  <span className="r">
                    {u.drive_file_id ? (
                      <a className="pill ok" href={driveFileUrl(u.drive_file_id)} target="_blank" rel="noreferrer">In Drive</a>
                    ) : client.drive_folder_id ? (
                      <span className="pill warn">Copying to Drive</span>
                    ) : null}
                    <span className="note">{short(u.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Nothing uploaded yet.</p>
          )}
        </div>

        <div className="panel">
          <h2>Team on this account</h2>
          <p className="note">Everyone listed here shows in the client&apos;s Members panel. Admins aren&apos;t shown to clients, and can open every account.</p>
          <ul className="list">
            {accountTeam.map((m) => (
              <li key={m.user_id}>
                <Avatar name={m.display_name} path={m.avatar_path} style={{ width: 32, height: 32 }} />
                <b>{m.display_name}</b>
                <span className="note">{m.user_id === client.account_manager_id ? "Account manager" : ROLE_LABEL[m.role]}</span>
                <span className="r">
                  <span className="pill ok">Client sees them</span>
                  {isAdmin && m.role !== "creator" && m.user_id !== client.account_manager_id && (
                    <form action={setAccountManager}>
                      <input type="hidden" name="client" value={client.id} />
                      <input type="hidden" name="user" value={m.user_id} />
                      <button className="btn sm line">Make account manager</button>
                    </form>
                  )}
                  {isAdmin && (
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
          {!accountTeam.length && <p className="note">No one added yet.</p>}
          {otherAdmins.length > 0 && (
            <p className="note">Admins with access (not shown to the client): {otherAdmins.map((m) => m.display_name).join(", ")}.</p>
          )}
          {isAdmin && <AddTeammate clientId={client.id} clientName={client.name} existing={addable} />}
        </div>

        {isAdmin && (
          <div className="panel">
            <h2>Client info</h2>
            <ClientInfoForm client={client} />
          </div>
        )}
        {isAdmin && (
        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        {!client.archived_at && (
          <div className="panel">
            <h2>Archive client</h2>
            <p className="note">For clients whose term has ended. Their portal closes and reminders stop, but nothing is deleted. You can restore them any time.</p>
            <form action={archiveClient}>
              <input type="hidden" name="client" value={client.id} />
              <input type="hidden" name="archive" value="1" />
              <ConfirmButton label="Archive client" confirmLabel={`Archive ${client.name}?`} />
            </form>
          </div>
        )}
          <div className="panel">
            <h2>Delete client</h2>
            <p className="note">Removes their portal and everything in it.</p>
            <DeleteClientForm clientId={client.id} name={client.name} />
          </div>
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
        <ScrollToLatest className="thread" style={{ maxHeight: 460 }} latest={messages.data?.[0]?.id}>
          {[...((messages.data ?? []) as Message[])].reverse().map((m) => (
            <div key={m.id} className={`msg ${m.author_kind === "team" ? "me" : ""}`}>
              <Avatar name={m.author_name} path={photoOf(m)} />
              <div className="bubble"><small>{m.author_name} · {short(m.created_at)}</small>{m.body}<MessageFiles files={m.attachments} urls={messageFileUrls} /></div>
            </div>
          ))}
        </ScrollToLatest>
        {canEdit && (
          <MessageComposer folder={`${agency.id}/${client.id}/messages`} placeholder={`Reply to ${client.name}…`} send={replyAsTeam} hidden={{ client: client.id }} />
        )}
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
  return data?.signedUrl ? <FilePreview url={data.signedUrl} name={name} label={`Attached: ${name}`} /> : null;
}
