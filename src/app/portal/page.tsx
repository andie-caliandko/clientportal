import Link from "next/link";
import { Logo } from "@/lib/brand";
import { formatDue } from "@/lib/approval";
import { requireClient } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Calendar, ClientUser, Doc, Message, Step } from "@/lib/types";
import { signOut } from "../login/actions";
import { approveCalendar, confirmBooked } from "./actions";
import { Compose, PeopleCard } from "./PortalForms";
import { ClientTasks, type ClientTask } from "./ClientTasks";

const DONE_MESSAGES: Record<string, string> = {
  questionnaire: "Thank you! Your answers are in. Your team has been notified.",
  branding: "Got your branding files. Your team will take a look.",
  content: "Got your content. Your team will take a look.",
};

function greeting(tz: string) {
  const h = +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function stepHref(step: Step): string | null {
  if (step.kind === "questionnaire") return "/portal/questionnaire";
  if (step.kind === "upload_branding") return "/portal/upload/branding";
  if (step.kind === "upload_content") return "/portal/upload/content";
  return step.action_url;
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; tab?: string; done?: string }>;
}) {
  const { agency, client, clientUser, userId } = await requireClient();
  const params = await searchParams;
  const supabase = await createClient();

  const [steps, status, calendars, docs, messages, people, manager, clientTasks] = await Promise.all([
    supabase.from("onboarding_steps").select("*").eq("agency_id", agency.id).order("position"),
    supabase.from("client_step_status").select("step_id").eq("client_id", client.id),
    supabase.from("content_calendars").select("*").eq("client_id", client.id).order("month", { ascending: false }),
    supabase.from("documents").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    supabase.from("messages").select("*").eq("client_id", client.id).order("created_at").limit(200),
    supabase.from("client_users").select("*").eq("client_id", client.id).order("created_at"),
    client.account_manager_id
      ? supabase.from("agency_members").select("display_name").eq("user_id", client.account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tasks")
      .select("id, title, note, due_at, created_by, client_assignee_id")
      .eq("client_id", client.id)
      .not("client_assignee_id", "is", null)
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false }),
  ]);

  const done = new Set((status.data ?? []).map((s) => s.step_id));
  const allSteps = (steps.data ?? []) as Step[];
  const next = allSteps.find((s) => !done.has(s.id));
  const cals = (calendars.data ?? []) as Calendar[];
  const pending = cals.find((c) => c.status === "pending");
  const past = cals.filter((c) => c.status !== "pending");
  const amName = manager.data?.display_name ?? "your team";
  const firstName = clientUser.display_name.split(" ")[0];

  // Team names the client may see: only their account manager is listed by name.
  const peopleById = new Map(((people.data ?? []) as ClientUser[]).map((p) => [p.user_id, p.display_name]));
  const teamTasks: ClientTask[] = (clientTasks.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    note: t.note,
    due: t.due_at ? new Date(t.due_at).toLocaleDateString("en-US", { timeZone: agency.timezone, weekday: "short", month: "short", day: "numeric" }) : null,
    overdue: !!t.due_at && new Date(t.due_at).getTime() < Date.now(),
    from: t.created_by === client.account_manager_id ? amName : agency.name,
    forName: t.client_assignee_id === userId ? "you" : peopleById.get(t.client_assignee_id) ?? "your team",
  }));

  const tab = params.tab === "report" ? "report" : "strategy";
  const tabDocs = ((docs.data ?? []) as Doc[]).filter((d) => d.kind === tab);
  const doc = tabDocs.find((d) => d.id === params.doc) ?? tabDocs[0];
  const docUrl = doc
    ? (await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60 * 60)).data?.signedUrl
    : null;

  const monthName = (m: string) =>
    new Date(`${m}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="portal">
      <header className="p-head">
        <Logo brand={agency.brand} name={agency.name} height={54} />
        <form action={signOut} className="who">
          Signed in as {firstName} <button className="linkbtn">Sign out</button>
        </form>
      </header>

      <section className="hello">
        <p className="eyebrow">{client.name}</p>
        <h1>
          {greeting(agency.timezone)}, <em>{firstName}.</em>
        </h1>
        <p>{pending || next || teamTasks.length ? "Here's what needs you today. Everything else, we've got." : "You're all caught up. We'll let you know when something needs you."}</p>
      </section>

      {params.done && DONE_MESSAGES[params.done] && <p className="flash">{DONE_MESSAGES[params.done]}</p>}

      {pending && (
        <section className="task-card approve" aria-label="Needs your approval">
          <div>
            <p className="eyebrow">Needs your approval</p>
            <h2>Your {monthName(pending.month).split(" ")[0]} content is ready</h2>
            <p>Look over your posts in Rella and approve them, or leave a note on anything you&apos;d like changed.</p>
            <p className="clock" style={{ marginTop: 10 }}>
              Please approve by {formatDue(new Date(pending.due_at), agency.timezone)}
            </p>
            <p className="note" style={{ marginTop: 4 }}>
              You have {agency.approval_window_hours} hours{agency.approval_skip_weekends ? ", not counting weekends" : ""}.
              If we don&apos;t hear from you by then, we&apos;ll post as planned.
            </p>
          </div>
          <div className="actions">
            <a className="btn warm lg" href={pending.rella_url} target="_blank" rel="noreferrer">
              Review in Rella
            </a>
            <form action={approveCalendar}>
              <input type="hidden" name="id" value={pending.id} />
              <button className="btn line" style={{ width: "100%" }}>I&apos;ve approved it</button>
            </form>
          </div>
        </section>
      )}

      {teamTasks.length > 0 && (
        <section className="card" aria-labelledby="h-tasks">
          <div className="sec-head">
            <h2 id="h-tasks">From your team</h2>
            <span className="note">{teamTasks.length} to do</span>
          </div>
          <ClientTasks tasks={teamTasks} folder={`${agency.id}/${client.id}/tasks`} />
        </section>
      )}

      {next && (
        <section className="task-card next" aria-label="Your next step">
          <div>
            <p className="eyebrow">Your next step to get started</p>
            <h2>{next.title}</h2>
            <p>{next.help}</p>
          </div>
          <StepAction step={next} primary />
        </section>
      )}

      <section className="card" aria-labelledby="h-steps">
        <div className="sec-head">
          <h2 id="h-steps">Getting started</h2>
          <span className="note">
            {done.size} of {allSteps.length} done
          </span>
        </div>
        <div className="progress" aria-hidden="true" style={{ marginBottom: 6 }}>
          <i style={{ width: `${allSteps.length ? (done.size / allSteps.length) * 100 : 0}%` }} />
        </div>
        <ul className="steps">
          {allSteps.map((s, i) => (
            <li key={s.id} className={`step ${done.has(s.id) ? "done" : ""}`}>
              <span className="num">{done.has(s.id) ? "✓" : i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.help}</p>
              </div>
              <div className="act">
                {done.has(s.id) ? <span className="done-label">Done</span> : <StepAction step={s} primary={s.id === next?.id} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="h-docs">
        <div className="sec-head">
          <h2 id="h-docs">Your strategy &amp; reports</h2>
        </div>
        <div className="tabs" role="tablist">
          <Link href="/portal?tab=strategy#h-docs" role="tab" aria-selected={tab === "strategy"}>Strategy</Link>
          <Link href="/portal?tab=report#h-docs" role="tab" aria-selected={tab === "report"}>Monthly reports</Link>
        </div>
        <div className="viewer">
          {doc && docUrl ? (
            <>
              <div className="vbar">
                <div className="tabs" style={{ margin: 0 }}>
                  {tabDocs.map((d) => (
                    <Link key={d.id} href={`/portal?tab=${tab}&doc=${d.id}#h-docs`} aria-selected={d.id === doc.id}>
                      {d.title}
                    </Link>
                  ))}
                </div>
                <a className="btn line sm" href={docUrl} target="_blank" rel="noreferrer">Open full screen</a>
              </div>
              <iframe src={`${docUrl}#view=FitH`} title={doc.title} />
            </>
          ) : (
            <p className="empty">
              {tab === "strategy" ? "Your strategy will show up here once it's ready." : "Your monthly reports will show up here."}
            </p>
          )}
        </div>
      </section>

      <div className="two">
        <section className="card" aria-labelledby="h-msg">
          <div className="sec-head">
            <h2 id="h-msg">Messages</h2>
          </div>
          <div className="thread" aria-live="polite">
            {((messages.data ?? []) as Message[]).map((m) => {
              const mine = m.author_id === userId;
              return (
                <div key={m.id} className={`msg ${mine ? "me" : ""}`}>
                  <span className="av">{initials(m.author_name)}</span>
                  <div className="bubble">
                    <small>
                      {mine ? "You" : m.author_name} ·{" "}
                      {new Date(m.created_at).toLocaleString("en-US", {
                        timeZone: agency.timezone,
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                    {m.body}
                  </div>
                </div>
              );
            })}
            {!messages.data?.length && <p className="note">Say hello! Your whole team will see it.</p>}
          </div>
          <Compose agencyName={agency.name} />
          <p className="hint">
            <span className="dot" />
            Your whole team sees this. We&apos;ll email you when we reply.
          </p>
        </section>

        <div className="stack">
          <section className="card" style={{ display: "grid", gap: 18 }} aria-label="Your account manager">
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span className="av" style={{ width: 58, height: 58, fontFamily: "var(--serif)", fontSize: "1.5rem", fontWeight: 400, background: "var(--hi)", color: "var(--primary)" }}>
                {amName[0]?.toUpperCase()}
              </span>
              <div>
                <b>{amName}</b>
                <p className="note">Your account manager</p>
              </div>
            </div>
            <p className="note">Questions about your content, your calendar or anything else? Send a message any time.</p>
          </section>
          <PeopleCard people={(people.data ?? []) as ClientUser[]} canAdd={(people.data?.length ?? 0) < 2} />
        </div>
      </div>

      {past.length > 0 && (
        <section className="card" aria-labelledby="h-hist">
          <div className="sec-head">
            <h2 id="h-hist">Past content calendars</h2>
          </div>
          <ul className="list">
            {past.map((c) => (
              <li key={c.id}>
                <b>{monthName(c.month)}</b>
                <span className="r">
                  {c.status === "approved" ? (
                    <span className="pill ok">Approved by you</span>
                  ) : (
                    <span className="pill info">Approved automatically</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {past.some((c) => c.status === "auto_approved") && (
            <p className="note" style={{ marginTop: 10 }}>
              &quot;Approved automatically&quot; means we didn&apos;t hear back in time, so your posts went out as planned.
            </p>
          )}
        </section>
      )}

      <footer className="foot">
        <Logo brand={agency.brand} name={agency.name} variant="mark" height={34} />
        <p>Your private portal from {agency.name}</p>
      </footer>
    </main>
  );
}

function StepAction({ step, primary }: { step: Step; primary?: boolean }) {
  const cls = `btn ${primary ? "lg" : "sm line"}`;
  const href = stepHref(step);
  if (step.kind === "contract") {
    return href ? (
      <a className={cls} href={href} target="_blank" rel="noreferrer">{step.action_label}</a>
    ) : (
      <span className="note">Check your email for the contract</span>
    );
  }
  if (step.kind === "booking") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {href && <a className={cls} href={href} target="_blank" rel="noreferrer">{step.action_label}</a>}
        <form action={confirmBooked}>
          <button className="linkbtn">I&apos;ve booked it</button>
        </form>
      </div>
    );
  }
  return href ? <Link className={cls} href={href}>{step.action_label}</Link> : null;
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
