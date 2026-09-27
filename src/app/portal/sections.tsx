import Link from "next/link";
import { formatDue } from "@/lib/approval";
import { getClientMeetings, googleStatus } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";
import type { Agency, Calendar, Client, ClientUser, Doc, Message, Step } from "@/lib/types";
import { approveCalendar, confirmBooked, sendMessage } from "./actions";
import { ClientTasks, type ClientTask } from "./ClientTasks";
import { MessageComposer } from "./MessageComposer";
import { ScrollToLatest } from "./ScrollToLatest";
import { MessageFiles, signAttachments } from "./MessageFiles";
import { FilePreview } from "./FilePreview";

/** Everything a portal page needs to know about who's looking. */
export type PortalCtx = {
  agency: Agency;
  client: Client;
  /** The signed-in client contact, or the contact being previewed. */
  userId: string | null;
  firstName: string;
  /** Team preview: same view, but nothing can be clicked or sent. */
  preview: boolean;
  /** "/portal" for clients, "/preview/<id>" for the team. */
  base: string;
  params: { doc?: string; done?: string };
};

export const SECTIONS = ["home", "tasks", "messages", "activity", "files", "strategy", "analytics", "meetings"] as const;
export type Section = (typeof SECTIONS)[number];

const DONE_MESSAGES: Record<string, string> = {
  questionnaire: "Thank you! Your answers are in. Your team has been notified.",
  branding: "Got your branding files. Your team will take a look.",
  content: "Got your content. Your team will take a look.",
};

const monthName = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function greeting(tz: string) {
  const h = +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

async function loadCore(ctx: PortalCtx) {
  const supabase = await createClient();
  const { agency, client } = ctx;
  const [steps, status, calendars, manager, people, tasks] = await Promise.all([
    supabase.from("onboarding_steps").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("client_step_status").select("step_id, completed_at").eq("client_id", client.id),
    supabase.from("content_calendars").select("*").eq("client_id", client.id).order("month", { ascending: false }),
    client.account_manager_id
      ? supabase.from("agency_members").select("display_name, email").eq("user_id", client.account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("client_users").select("*").eq("client_id", client.id).order("created_at"),
    supabase
      .from("tasks")
      .select("id, title, note, due_at, created_by, client_assignee_id")
      .eq("client_id", client.id)
      // Assigned to a contact, or the team is waiting on the client (approval reminders excluded: that's the approval card).
      .or("client_assignee_id.not.is.null,and(status.eq.waiting,source.neq.rella)")
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  const done = new Map((status.data ?? []).map((s) => [s.step_id, s.completed_at as string]));
  const allSteps = (steps.data ?? []) as Step[];
  const cals = (calendars.data ?? []) as Calendar[];
  const amName = manager.data?.display_name ?? "your team";
  const contacts = (people.data ?? []) as ClientUser[];
  const byId = new Map(contacts.map((p) => [p.user_id, p.display_name]));
  const teamTasks: ClientTask[] = (tasks.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    note: t.note,
    due: t.due_at ? new Date(t.due_at).toLocaleDateString("en-US", { timeZone: agency.timezone, weekday: "short", month: "short", day: "numeric" }) : null,
    overdue: !!t.due_at && new Date(t.due_at).getTime() < Date.now(),
    from: t.created_by === client.account_manager_id ? amName : agency.brand.shortName ?? agency.name,
    forName: !t.client_assignee_id
      ? client.name
      : t.client_assignee_id === ctx.userId && !ctx.preview ? "you" : byId.get(t.client_assignee_id) ?? client.name,
  }));
  return {
    supabase,
    steps: allSteps,
    done,
    next: allSteps.find((s) => !done.has(s.id)),
    pending: cals.find((c) => c.status === "pending"),
    past: cals.filter((c) => c.status !== "pending"),
    amName,
    amEmail: manager.data?.email as string | undefined,
    contacts,
    teamTasks,
  };
}

/** Open items for the Tasks badge in the menu. */
export async function openCount(ctx: PortalCtx) {
  const d = await loadCore(ctx);
  return d.teamTasks.length + (d.pending ? 1 : 0) + d.steps.filter((s) => !d.done.has(s.id)).length;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function stepHref(step: Step, contractUrl: string | null): string | null {
  if (step.kind === "contract") return contractUrl ?? step.action_url;
  if (step.kind === "questionnaire") return "/portal/questionnaire";
  if (step.kind === "upload_branding") return "/portal/upload/branding";
  if (step.kind === "upload_content") return "/portal/upload/content";
  return step.action_url;
}

function StepAction({ step, primary, preview, contractUrl }: { step: Step; primary?: boolean; preview: boolean; contractUrl: string | null }) {
  const cls = `btn ${primary ? "lg" : "sm line"}`;
  const href = stepHref(step, contractUrl);
  if (step.kind === "contract" && !href) return <span className="note">Check your email for your contract</span>;
  if (preview) return <button className={cls} disabled>{step.action_label}</button>;
  if (step.kind === "contract") return <a className={cls} href={href!} target="_blank" rel="noreferrer">{step.action_label}</a>;
  if (step.kind === "booking") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {href && <a className={cls} href={href} target="_blank" rel="noreferrer">{step.action_label}</a>}
        <form action={confirmBooked}><button className="linkbtn">I&apos;ve booked it</button></form>
      </div>
    );
  }
  return href ? <Link className={cls} href={href}>{step.action_label}</Link> : null;
}

function ApprovalCard({ cal, agency, preview }: { cal: Calendar; agency: Agency; preview: boolean }) {
  return (
    <section className="task-card approve" aria-label="Needs your approval">
      <div>
        <p className="eyebrow">Needs your approval</p>
        <h2>Your {monthName(cal.month).split(" ")[0]} content is ready</h2>
        <p>Look over your posts in Rella and approve them, or leave a note on anything you&apos;d like changed.</p>
        <p className="clock" style={{ marginTop: 10 }}>Please approve by {formatDue(new Date(cal.due_at), agency.timezone)}</p>
        <p className="note" style={{ marginTop: 4 }}>
          You have {agency.approval_window_hours} hours{agency.approval_skip_weekends ? ", not counting weekends" : ""}. If we don&apos;t hear
          from you by then, we&apos;ll post as planned.
        </p>
      </div>
      <div className="actions">
        <a className="btn warm lg" href={cal.rella_url} target="_blank" rel="noreferrer">Review in Rella</a>
        {preview ? (
          <button className="btn line" disabled>I&apos;ve approved it</button>
        ) : (
          <form action={approveCalendar}>
            <input type="hidden" name="id" value={cal.id} />
            <button className="btn line" style={{ width: "100%" }}>I&apos;ve approved it</button>
          </form>
        )}
      </div>
    </section>
  );
}

function Steps({ steps, done, next, preview, contractUrl }: { steps: Step[]; done: Map<string, string>; next?: Step; preview: boolean; contractUrl: string | null }) {
  return (
    <section className="card" aria-labelledby="h-steps">
      <div className="sec-head">
        <h2 id="h-steps">Getting started</h2>
        <span className="note">{done.size} of {steps.length} done</span>
      </div>
      <div className="progress" aria-hidden="true" style={{ marginBottom: 6 }}>
        <i style={{ width: `${steps.length ? (done.size / steps.length) * 100 : 0}%` }} />
      </div>
      <ul className="steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`step ${done.has(s.id) ? "done" : ""}`}>
            <span className="num">{done.has(s.id) ? "✓" : i + 1}</span>
            <div><h3>{s.title}</h3><p>{s.help}</p></div>
            <div className="act">{done.has(s.id) ? <span className="done-label">Done</span> : <StepAction step={s} primary={s.id === next?.id} preview={preview} contractUrl={contractUrl} />}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function HomeSection(ctx: PortalCtx) {
  const d = await loadCore(ctx);
  const { data: last } = await d.supabase
    .from("messages")
    .select("author_name, body, created_at")
    .eq("client_id", ctx.client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: latestDoc } = await d.supabase
    .from("documents")
    .select("title, kind, created_at")
    .eq("client_id", ctx.client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const busy = d.pending || d.next || d.teamTasks.length;

  return (
    <>
      <section className="hello">
        <p className="eyebrow">{ctx.client.name}</p>
        <h1>{greeting(ctx.agency.timezone)}, <em>{ctx.firstName}.</em></h1>
        <p>{busy ? "Here's what needs you today. Everything else, we've got." : "You're all caught up. We'll let you know when something needs you."}</p>
      </section>
      {ctx.params.done && DONE_MESSAGES[ctx.params.done] && <p className="flash">{DONE_MESSAGES[ctx.params.done]}</p>}
      {d.pending && <ApprovalCard cal={d.pending} agency={ctx.agency} preview={ctx.preview} />}
      {d.teamTasks.length > 0 && (
        <section className="task-card plain" aria-label="From your team">
          <div>
            <p className="eyebrow">From your team</p>
            <h2>You have {d.teamTasks.length} task{d.teamTasks.length > 1 ? "s" : ""} from {d.teamTasks[0].from}</h2>
            <p>{d.teamTasks.map((t) => t.title).join(" · ")}</p>
          </div>
          <Link className="btn lg" href={`${ctx.base}/tasks`}>See your tasks</Link>
        </section>
      )}
      {d.next && (
        <section className="task-card next" aria-label="Your next step">
          <div>
            <p className="eyebrow">Your next step to get started</p>
            <h2>{d.next.title}</h2>
            <p>{d.next.help}</p>
          </div>
          <StepAction step={d.next} primary preview={ctx.preview} contractUrl={ctx.client.dubsado_project_url} />
        </section>
      )}
      <div className="home-grid">
        <Link className="card tile" href={`${ctx.base}/tasks`}>
          <p className="eyebrow">Getting started</p>
          <b className="big">{d.done.size} of {d.steps.length}</b>
          <div className="progress"><i style={{ width: `${d.steps.length ? (d.done.size / d.steps.length) * 100 : 0}%` }} /></div>
          <span className="note">See your to-dos →</span>
        </Link>
        <Link className="card tile" href={`${ctx.base}/messages`}>
          <p className="eyebrow">Latest message</p>
          {last ? <p className="quote">&ldquo;{last.body.slice(0, 90)}{last.body.length > 90 ? "…" : ""}&rdquo;</p> : <p className="quote">No messages yet. Say hello!</p>}
          <span className="note">{last ? `${last.author_name} →` : "Open messages →"}</span>
        </Link>
        <Link className="card tile" href={`${ctx.base}/${latestDoc?.kind === "report" ? "analytics" : "strategy"}`}>
          <p className="eyebrow">Latest from your team</p>
          <p className="quote">{latestDoc ? latestDoc.title : "Your strategy will show up here once it's ready."}</p>
          <span className="note">{latestDoc ? "Read it →" : "Strategy →"}</span>
        </Link>
      </div>
    </>
  );
}

export async function TasksSection(ctx: PortalCtx) {
  const d = await loadCore(ctx);
  return (
    <>
      <PageHead title="Tasks" sub="Things we need from you. We'll email you when something new shows up here." />
      {ctx.params.done && DONE_MESSAGES[ctx.params.done] && <p className="flash">{DONE_MESSAGES[ctx.params.done]}</p>}
      <section className="card" aria-labelledby="h-tasks">
        <div className="sec-head"><h2 id="h-tasks">From your team</h2><span className="note">{d.teamTasks.length} to do</span></div>
        {d.teamTasks.length ? (
          <ClientTasks tasks={d.teamTasks} folder={`${ctx.agency.id}/${ctx.client.id}/tasks`} readOnly={ctx.preview} />
        ) : (
          <p className="note">Nothing from your team right now.</p>
        )}
      </section>
      {d.pending ? <ApprovalCard cal={d.pending} agency={ctx.agency} preview={ctx.preview} /> : null}
      <Steps steps={d.steps} done={d.done} next={d.next} preview={ctx.preview} contractUrl={ctx.client.dubsado_project_url} />
      {d.past.length > 0 && (
        <section className="card" aria-labelledby="h-hist">
          <div className="sec-head"><h2 id="h-hist">Past content calendars</h2></div>
          <ul className="list">
            {d.past.map((c) => (
              <li key={c.id}>
                <b>{monthName(c.month)}</b>
                <span className="r">{c.status === "approved" ? <span className="pill ok">Approved by you</span> : <span className="pill info">Approved automatically</span>}</span>
              </li>
            ))}
          </ul>
          {d.past.some((c) => c.status === "auto_approved") && (
            <p className="note" style={{ marginTop: 10 }}>&quot;Approved automatically&quot; means we didn&apos;t hear back in time, so your posts went out as planned.</p>
          )}
        </section>
      )}
    </>
  );
}

export async function MessagesSection(ctx: PortalCtx) {
  const supabase = await createClient();
  // The newest 300, shown oldest to newest so the latest sits at the bottom.
  const { data: newest } = await supabase.from("messages").select("*").eq("client_id", ctx.client.id).order("created_at", { ascending: false }).limit(300);
  const data = (newest ?? []).reverse();
  const fileUrls = await signAttachments(supabase, (data ?? []) as Message[]);
  const short = ctx.agency.brand.shortName ?? ctx.agency.name;
  return (
    <>
      <PageHead title="Messages" sub={`Your whole ${short} team sees these. We'll email you when we reply.`} />
      <section className="card">
        <ScrollToLatest className="thread tall" count={data.length}>
          {((data ?? []) as Message[]).map((m) => {
            const mine = ctx.preview ? m.author_kind === "client" : m.author_id === ctx.userId;
            return (
              <div key={m.id} className={`msg ${mine ? "me" : ""}`}>
                <span className="av">{initials(m.author_name)}</span>
                <div className="bubble">
                  <small>
                    {mine && !ctx.preview ? "You" : m.author_name} ·{" "}
                    {new Date(m.created_at).toLocaleString("en-US", { timeZone: ctx.agency.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </small>
                  {m.body}
                  <MessageFiles files={m.attachments} urls={fileUrls} />
                </div>
              </div>
            );
          })}
          {!data.length && <p className="note">Say hello! Your whole team will see it.</p>}
        </ScrollToLatest>
        {ctx.preview ? (
          <p className="note">Clients type their messages and attach files here.</p>
        ) : (
          <MessageComposer folder={`${ctx.agency.id}/${ctx.client.id}/messages`} placeholder={`Write to your ${short} team…`} send={sendMessage} />
        )}
      </section>
    </>
  );
}

export async function ActivitySection(ctx: PortalCtx) {
  const d = await loadCore(ctx);
  const [msgs, uploads, docs, finished] = await Promise.all([
    d.supabase.from("messages").select("author_name, author_kind, created_at").eq("client_id", ctx.client.id).order("created_at", { ascending: false }).limit(40),
    d.supabase.from("uploads").select("kind, created_at").eq("client_id", ctx.client.id).order("created_at", { ascending: false }).limit(200),
    d.supabase.from("documents").select("title, kind, created_at").eq("client_id", ctx.client.id),
    d.supabase.from("tasks").select("title, created_at, completed_at").eq("client_id", ctx.client.id).not("client_assignee_id", "is", null),
  ]);
  type Item = { at: string; text: string; who: "you" | "team" | "auto" };
  const items: Item[] = [];
  (msgs.data ?? []).forEach((m) => items.push({ at: m.created_at, who: m.author_kind === "client" ? "you" : "team", text: `${m.author_name} sent a message` }));
  d.steps.forEach((s) => d.done.has(s.id) && items.push({ at: d.done.get(s.id)!, who: "you", text: `Finished: ${s.title}` }));
  // Group uploads made the same day into one line.
  const upByDay = new Map<string, { kind: string; n: number; at: string }>();
  (uploads.data ?? []).forEach((u) => {
    const key = `${u.created_at.slice(0, 10)}-${u.kind}`;
    const cur = upByDay.get(key);
    upByDay.set(key, { kind: u.kind, n: (cur?.n ?? 0) + 1, at: cur?.at ?? u.created_at });
  });
  upByDay.forEach((u) => items.push({ at: u.at, who: "you", text: `${u.n} ${u.kind} file${u.n > 1 ? "s" : ""} uploaded` }));
  (docs.data ?? []).forEach((doc) => items.push({ at: doc.created_at, who: "team", text: `${doc.title} added to ${doc.kind === "report" ? "Analytics" : "Strategy"}` }));
  [d.pending, ...d.past].forEach((c) => {
    if (!c) return;
    const m = monthName(c.month).split(" ")[0];
    items.push({ at: c.sent_at, who: "team", text: `Your ${m} content calendar was sent for approval` });
    if (c.resolved_at) items.push({ at: c.resolved_at, who: c.status === "approved" ? "you" : "auto", text: c.status === "approved" ? `${m} content approved` : `${m} content approved automatically (no reply within the window)` });
  });
  (finished.data ?? []).forEach((t) => {
    items.push({ at: t.created_at, who: "team", text: `New task from your team: ${t.title}` });
    if (t.completed_at) items.push({ at: t.completed_at, who: "you", text: `Finished: ${t.title}` });
  });
  items.sort((a, b) => b.at.localeCompare(a.at));
  const fmt = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: ctx.agency.timezone, month: "short", day: "numeric", year: "numeric" });
  return (
    <>
      <PageHead title="Activity" sub="Everything that's happened on your account, newest first." />
      <section className="card">
        {items.length ? (
          <ol className="timeline">
            {items.slice(0, 80).map((it, i) => (
              <li key={i}><span className={`tdot ${it.who}`} aria-hidden="true" /><span>{it.text}</span><time>{fmt(it.at)}</time></li>
            ))}
          </ol>
        ) : (
          <p className="note">Nothing yet. Your activity will show up here as you get started.</p>
        )}
      </section>
    </>
  );
}

export async function FilesSection(ctx: PortalCtx) {
  const supabase = await createClient();
  const { data } = await supabase.from("uploads").select("id, kind, file_name, storage_path, created_at").eq("client_id", ctx.client.id).order("created_at", { ascending: false });
  const rows = data ?? [];
  const urls = rows.length
    ? (await supabase.storage.from("uploads").createSignedUrls(rows.map((r) => r.storage_path), 60 * 60)).data ?? []
    : [];
  const urlFor = new Map(urls.map((u) => [u.path, u.signedUrl]));
  const short = ctx.agency.brand.shortName ?? ctx.agency.name;
  return (
    <>
      <PageHead title="Files" sub={`Everything you've sent us. Your ${short} team can see all of it.`} />
      {(["branding", "content"] as const).map((kind) => {
        const list = rows.filter((r) => r.kind === kind);
        return (
          <section className="card" key={kind}>
            <div className="sec-head">
              <h2>{kind === "branding" ? "Branding" : "Content"}</h2>
              {ctx.preview ? <button className="btn sm" disabled>Upload {kind}</button> : <Link className="btn sm" href={`/portal/upload/${kind}`}>Upload {kind}</Link>}
            </div>
            {list.length ? (
              <ul className="files">
                {list.map((f) => (
                  <li key={f.id}>
                    {urlFor.get(f.storage_path) ? <FilePreview url={urlFor.get(f.storage_path)!} name={f.file_name} /> : f.file_name}
                    <span className="note">{new Date(f.created_at).toLocaleDateString("en-US", { timeZone: ctx.agency.timezone, month: "short", day: "numeric" })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">Nothing yet. Use the button above to send us your {kind} files.</p>
            )}
          </section>
        );
      })}
    </>
  );
}

async function DocViewer(ctx: PortalCtx, kind: "strategy" | "report", section: string, empty: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("*").eq("client_id", ctx.client.id).eq("kind", kind).order("created_at", { ascending: false });
  const docs = (data ?? []) as Doc[];
  const doc = docs.find((d) => d.id === ctx.params.doc) ?? docs[0];
  const url = doc ? (await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60 * 60)).data?.signedUrl : null;
  return (
    <div className="viewer">
      {doc && url ? (
        <>
          <div className="vbar">
            <div className="tabs" style={{ margin: 0 }}>
              {docs.map((d) => (
                <Link key={d.id} href={`${ctx.base}/${section}?doc=${d.id}`} aria-selected={d.id === doc.id}>{d.title}</Link>
              ))}
            </div>
            <FilePreview url={url} name={`${doc.title}.pdf`} type="application/pdf" label="Open full screen" className="btn line sm" />
          </div>
          <iframe src={`${url}#view=FitH`} title={doc.title} />
        </>
      ) : (
        <p className="empty">{empty}</p>
      )}
    </div>
  );
}

export async function StrategySection(ctx: PortalCtx) {
  return (
    <>
      <PageHead title="Strategy" sub="The plans we've made for you. Read them right here, nothing to download." />
      {await DocViewer(ctx, "strategy", "strategy", "Your strategy will show up here once it's ready.")}
    </>
  );
}

export async function AnalyticsSection(ctx: PortalCtx) {
  return (
    <>
      <PageHead title="Analytics" sub="Your monthly results report, added at the start of each month." />
      {await DocViewer(ctx, "report", "analytics", "Your monthly reports will show up here.")}
    </>
  );
}

export async function MeetingsSection(ctx: PortalCtx) {
  const d = await loadCore(ctx);
  const google = await googleStatus(ctx.agency.id);
  const calendars = [d.amEmail, google.email].filter(Boolean) as string[];
  const meetings = google.connected ? await getClientMeetings(ctx.agency.id, calendars, d.contacts.map((c) => c.email)) : [];
  const now = Date.now();
  const upcoming = meetings.filter((m) => new Date(m.end).getTime() >= now);
  const past = meetings.filter((m) => new Date(m.end).getTime() < now).reverse().slice(0, 10);
  const booking = d.steps.find((s) => s.kind === "booking")?.action_url;
  const tz = ctx.agency.timezone;
  const day = (iso: string) => {
    const dt = new Date(iso);
    return {
      wd: dt.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }),
      d: dt.toLocaleDateString("en-US", { timeZone: tz, day: "numeric" }),
      mo: dt.toLocaleDateString("en-US", { timeZone: tz, month: "short" }),
    };
  };
  const time = (m: (typeof meetings)[number]) =>
    m.allDay ? "All day" : `${new Date(m.start).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })} – ${new Date(m.end).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
  const row = (m: (typeof meetings)[number], future: boolean) => {
    const x = day(m.start);
    return (
      <li key={m.id} className="meet">
        <span className="date"><small>{x.wd}</small><b>{x.d}</b><small>{x.mo}</small></span>
        <span><b>{m.title}</b><br /><span className="note">{time(m)}</span></span>
        {future && m.meetLink && (
          <span className="r">{ctx.preview ? <button className="btn sm" disabled>Join Google Meet</button> : <a className="btn sm" href={m.meetLink} target="_blank" rel="noreferrer">Join Google Meet</a>}</span>
        )}
      </li>
    );
  };
  return (
    <>
      <PageHead title="Meetings" sub={`Your calls with ${ctx.agency.brand.shortName ?? ctx.agency.name} happen on Google Meet.`} />
      <section className="card">
        <div className="sec-head">
          <h2>Coming up</h2>
          {booking && (ctx.preview ? <button className="btn sm line" disabled>Book a call</button> : <a className="btn sm line" href={booking} target="_blank" rel="noreferrer">Book a call with {d.amName.split(" ")[0]}</a>)}
        </div>
        {upcoming.length ? <ul className="list">{upcoming.map((m) => row(m, true))}</ul> : <p className="note">No calls on the calendar right now.{booking ? " Use Book a call to pick a time." : ""}</p>}
      </section>
      {past.length > 0 && (
        <section className="card">
          <div className="sec-head"><h2>Past meetings</h2></div>
          <ul className="list">{past.map((m) => row(m, false))}</ul>
        </section>
      )}
    </>
  );
}
