import Link from "next/link";
import { Logo } from "@/lib/brand";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured, googleStatus, listCalendars } from "@/lib/google";
import { disconnectGoogle, setDeadlinesCalendar } from "../actions";
import { ConfirmButton, NewClientTasksEditor } from "../TeamForms";

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
  const [{ data: members }, { data: steps }, { count: questionCount }] = await Promise.all([
    supabase.from("agency_members").select("display_name, title, role, email").eq("agency_id", agency.id),
    supabase.from("onboarding_steps").select("title, kind").eq("agency_id", agency.id).order("position"),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("agency_id", agency.id),
  ]);
  const colors = Object.entries(agency.brand.colors ?? {});
  const google = await googleStatus(agency.id);
  const calendars = google.connected ? await listCalendars(agency.id) : [];

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Your agency&apos;s setup</p>
          <h1 style={{ marginTop: 6 }}>Agency settings</h1>
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
          <h2>Google Calendar</h2>
          <p className="note" style={{ maxWidth: "64ch" }}>
            Connect Google and choose the calendar that holds your monthly due dates, like content calendars to internal
            review and to clients. Those dates then show above Tasks every week. The portal only reads the calendar and
            never changes it.
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
              {google.calendarName && <p className="note">Showing due dates from <b>{google.calendarName}</b>. Changes in Google show up here within 15 minutes.</p>}
              <form action={disconnectGoogle}><ConfirmButton label="Disconnect Google" confirmLabel="Disconnect?" /></form>
            </>
          ) : (
            googleConfigured() && <div><a className="btn sm" href="/api/google/connect">Connect Google</a></div>
          )}
        </div>
        <div className="panel">
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
        <div className="panel">
          <h2>Team &amp; roles</h2>
          <p className="note">{members?.length ?? 0} teammates. Three roles: Admin, Account manager and Creator.</p>
          <div><Link className="btn sm line" href="/team/team">Manage team</Link></div>
        </div>
        <div className="panel">
          <h2>Onboarding</h2>
          <ul className="list">
            {(steps ?? []).map((s) => <li key={s.title}>{s.title}</li>)}
          </ul>
          <p className="note">{questionCount ?? 0} questionnaire questions. Every new client gets this checklist and questionnaire automatically.</p>
        </div>
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>New-client tasks</h2>
          <p className="note">Created for the team whenever an admin adds a client. Days count from the day the client is added.</p>
          <NewClientTasksEditor tasks={agency.new_client_tasks ?? []} />
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
      <p className="note">Editing these from this page is coming next. For now they&apos;re changed in the database.</p>
    </section>
  );
}
