import { Avatar } from "@/app/Avatar";
import Link from "next/link";
import { Logo } from "@/lib/brand";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { googleConfigured, googleStatus, isPersonalCalendar, listCalendars } from "@/lib/google";
import { disconnectGoogle, setDeadlinesCalendar } from "../actions";
import { ConfirmButton, DriveSettings, NewClientTasksEditor } from "../TeamForms";
import { ROLE_LABEL } from "@/lib/types";

const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Google is connected. Now choose your due-dates calendar below.",
  "not-configured": "Google isn't set up on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the README).",
  expired: "That sign-in took too long or was opened in another tab. Try Connect Google again.",
  cancelled: "Google sign-in was cancelled. Nothing was changed.",
  failed: "Google didn't finish connecting. Try again, and make sure you allow calendar access.",
  denied: "Only admins can connect Google.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google: googleMsg } = await searchParams;
  const { agency, member } = await requireTeam();
  if (member.role !== "admin") redirect("/team");
  const supabase = await createClient();
  const [{ data: members }, { data: steps }, { count: questionCount }, { data: activeClients }, { data: onClients }] = await Promise.all([
    supabase.from("agency_members").select("user_id, display_name, title, role, email, avatar_path").eq("agency_id", agency.id).order("display_name"),
    supabase.from("onboarding_steps").select("title, kind").eq("agency_id", agency.id).order("position"),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("agency_id", agency.id),
    supabase.from("clients").select("id, account_manager_id").eq("agency_id", agency.id).is("archived_at", null),
    supabase.from("client_team").select("client_id, user_id"),
  ]);
  const colors = Object.entries(agency.brand.colors ?? {});
  const google = await googleStatus(agency.id);
  // Uploads waiting to be copied (for clients with a Drive folder), and clients still missing a folder link.
  const [{ count: driveWaiting }, { count: noFolder }] = google.connected
    ? await Promise.all([
        createAdminClient().from("uploads").select("id, clients!inner(agency_id, archived_at, drive_folder_id)", { count: "exact", head: true })
          .is("drive_file_id", null).eq("clients.agency_id", agency.id).is("clients.archived_at", null).not("clients.drive_folder_id", "is", null),
        createAdminClient().from("clients").select("id", { count: "exact", head: true }).eq("agency_id", agency.id).is("archived_at", null).is("drive_folder_id", null),
      ])
    : [{ count: 0 }, { count: 0 }];
  const calendars = google.connected ? await listCalendars(agency.id) : [];

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Your agency&apos;s setup</p>
          <h1 style={{ marginTop: 6 }}>Settings</h1>
        </div>
      </div>
      <p className="note" style={{ maxWidth: "62ch" }}>
        Everything that makes the platform yours. Every agency on the platform has its own version of this page.
      </p>
      {googleMsg && GOOGLE_MESSAGES[googleMsg] && (
        <p className={googleMsg === "connected" ? "flash" : "readonly"}>{GOOGLE_MESSAGES[googleMsg]}</p>
      )}
      <div className="cgrid">
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Google</h2>
          <p className="note" style={{ maxWidth: "64ch" }}>
            Connect the agency&apos;s Google account and choose the calendar that holds your monthly due dates. Those
            dates show above Tasks every week, and client uploads are filed in Google Drive. This also connects your own
            calendar for the Calendar page. Each teammate connects their own calendar on the Calendar page.
          </p>
          {!googleConfigured() && <p className="readonly">Waiting on server setup: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>}
          {google.connected ? (
            <>
              <p><span className="dot" /> Connected as <b>{google.email ?? "your Google account"}</b></p>
              <form action={setDeadlinesCalendar} className="row">
                <div className="field">
                  <label htmlFor="due-cal">Due-dates calendar</label>
                  <select className="sel" id="due-cal" name="calendar" defaultValue={google.calendarId ? `${google.calendarId}|${google.calendarName}` : ""}>
                    <option value="">Choose a calendar</option>
                    {calendars.map((c) => <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>)}
                  </select>
                </div>
                <button className="btn sm">Save</button>
              </form>
              {google.calendarId && isPersonalCalendar(google.calendarId) ? (
                <p className="readonly">A person&apos;s own calendar ({google.calendarName}) was chosen for due dates, so nothing is showing. Choose C&amp;K Due Dates above and click Save.</p>
              ) : google.calendarName && <p className="note">Showing due dates from <b>{google.calendarName}</b>. Changes in Google show up here within 15 minutes.</p>}
              <h3 style={{ marginTop: 8 }}>Google Drive</h3>
              <DriveSettings waiting={driveWaiting ?? 0} withoutFolder={noFolder ?? 0} />
              <form action={disconnectGoogle}><ConfirmButton label="Disconnect Google" confirmLabel="Disconnect?" /></form>
            </>
          ) : (
            googleConfigured() && <div><a className="btn sm" href="/api/google/connect?for=agency">Connect Google</a></div>
          )}
        </div>
        <div className="panel" style={{ alignSelf: "stretch" }}>
          <h2>Brand</h2>
          <div><Logo brand={agency.brand} name={agency.name} height={44} /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {colors.map(([k, v]) => (
              <span key={k} title={`${k} ${v}`} style={{ width: 34, height: 34, borderRadius: 8, background: v, border: "1px solid var(--line)" }} />
            ))}
          </div>
          <dl className="kv">
            <dt>Headings</dt><dd>{agency.brand.fonts?.heading}</dd>
            <dt>Labels</dt><dd>{agency.brand.fonts?.label}</dd>
            <dt>Body</dt><dd>{agency.brand.fonts?.body}</dd>
            <dt>Portal address</dt><dd>{agency.portal_domain ?? "Not set"}</dd>
            <dt>Time zone</dt><dd>{agency.timezone}</dd>
          </dl>
        </div>
        <div className="panel" style={{ alignSelf: "stretch" }}>
          <h2>Team &amp; roles</h2>
          <p className="note">{members?.length ?? 0} teammates. Three roles: Admin, Account manager and Creator.</p>
          <ul className="people">
            {(members ?? []).map((m) => {
              const active = new Set((activeClients ?? []).map((c) => c.id));
              const mine = new Set([
                ...(activeClients ?? []).filter((c) => c.account_manager_id === m.user_id).map((c) => c.id),
                ...(onClients ?? []).filter((t) => t.user_id === m.user_id && active.has(t.client_id)).map((t) => t.client_id),
              ]);
              return (
                <li key={m.user_id}>
                  <Avatar name={m.display_name} path={m.avatar_path} />
                  <span>
                    <b>{m.display_name}</b>
                    <span className="note">
                      {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL]}{m.title ? ` · ${m.title}` : ""}
                      {" · "}{m.role === "admin" ? "All clients" : `${mine.size} client${mine.size === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div><Link className="btn sm line" href="/team/team">Manage team</Link></div>
        </div>
        {/* Left column stacks Onboarding and Content approvals beside the longer New-client tasks list. */}
        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <div className="panel">
            <h2>Onboarding</h2>
            <ul className="list">
              {(steps ?? []).map((s) => <li key={s.title}>{s.title}</li>)}
            </ul>
            <p className="note">{questionCount ?? 0} questionnaire questions. Every new client gets this checklist and questionnaire automatically.</p>
          </div>
          <div className="panel">
            <h2>Content approvals</h2>
            <dl className="kv">
              <dt>Window</dt><dd>{agency.approval_window_hours} hours</dd>
              <dt>Weekends</dt><dd>{agency.approval_skip_weekends ? "Not counted" : "Counted"}</dd>
              <dt>No reply</dt><dd>Approved automatically and flagged</dd>
            </dl>
          </div>
        </div>
        <div className="panel">
          <h2>New-client tasks</h2>
          <p className="note">Created for the team whenever an admin adds a client. Days count from the day the client is added.</p>
          <NewClientTasksEditor tasks={agency.new_client_tasks ?? []} />
        </div>
      </div>
      <p className="note">Editing these from this page is coming next. For now they&apos;re changed in the database.</p>
    </section>
  );
}
