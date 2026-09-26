"use client";

import { useActionState, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  addTask,
  createClientAccount,
  deleteClient,
  editCalendar,
  inviteTeammate,
  sendCalendar,
  registerDocument,
  updateClientInfo,
  updateTask,
} from "./actions";

type Opt = { id?: string; user_id?: string; name?: string; display_name?: string };

export type TaskPeople = {
  me: string;
  /** Teammates who can be assigned tasks (admins and account managers). */
  team: { user_id: string; display_name: string; role: string }[];
  /** client id -> teammates on that client */
  onClient: Record<string, string[]>;
  /** client id -> client contacts */
  contacts: Record<string, { user_id: string; display_name: string }[]>;
};

export function NewTask({ clients, people, clientId, startOpen = false }: {
  clients: Opt[];
  people: TaskPeople;
  clientId?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [client, setClient] = useState(clientId ?? "");
  const [assignee, setAssignee] = useState(`team:${people.me}`);
  const [state, action, pending] = useActionState(addTask, {});
  if (!open) return <div><button className="btn sm" onClick={() => setOpen(true)}>New task</button></div>;

  const team = people.team.filter((m) => !client || m.role === "admin" || people.onClient[client]?.includes(m.user_id));
  const contacts = client ? people.contacts[client] ?? [] : [];
  const clientName = clients.find((c) => c.id === client)?.name;
  const forClient = assignee.startsWith("client:");

  return (
    <form action={action} className="panel">
      <h2>New task</h2>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor="t-title">Task</label><input className="input" id="t-title" name="title" placeholder="Send us your holiday hours" required /></div>
        {clientId ? (
          <input type="hidden" name="client" value={clientId} />
        ) : (
          <div className="field"><label htmlFor="t-client">Client</label>
            <select className="sel" id="t-client" name="client" value={client}
              onChange={(e) => { setClient(e.target.value); setAssignee(`team:${people.me}`); }}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        )}
      </div>
      <div className="row">
        <div className="field"><label htmlFor="t-who">Assign to</label>
          <select className="sel" id="t-who" name="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {contacts.length > 0 && (
              <optgroup label={clientName}>
                {contacts.map((c) => <option key={c.user_id} value={`client:${c.user_id}`}>{c.display_name} (client)</option>)}
              </optgroup>
            )}
            <optgroup label="Team">
              {team.map((m) => <option key={m.user_id} value={`team:${m.user_id}`}>{m.display_name}{m.user_id === people.me ? " (me)" : ""}</option>)}
            </optgroup>
          </select></div>
        <div className="field"><label htmlFor="t-due">Due</label><input className="input" id="t-due" name="due" type="date" /></div>
      </div>
      <div className="field"><label htmlFor="t-note">Note (optional)</label><textarea className="input" id="t-note" name="note" style={{ minHeight: 70 }} placeholder="Anything they need to know" /></div>
      <p className="note">
        {forClient
          ? "They'll see this in their portal and get an email. If it's late, reminders go out 2 days, 5 days and 1 week after the due date."
          : "Only your team sees this task."}
      </p>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div className="row"><button className="btn sm" disabled={pending}>{pending ? "Adding…" : "Add task"}</button><button type="button" className="btn sm line" onClick={() => setOpen(false)}>Close</button></div>
    </form>
  );
}

export function SendCalendarForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(sendCalendar, {});
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  const defaultMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        <div className="field"><label htmlFor="cal-month">Which month is this calendar for?</label><input className="input" id="cal-month" name="month" type="month" defaultValue={defaultMonth} required /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor="cal-url">Rella link</label><input className="input" id="cal-url" name="url" placeholder="https://…" required /></div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn warm" disabled={pending}>{pending ? "Sending…" : "Send for approval"}</button></div>
    </form>
  );
}

// Uploads go straight from the browser to storage, so large PDFs don't hit
// the hosting provider's request size limit.
export function UploadDocForm({ agencyId, clientId }: { agencyId: string; clientId: string }) {
  const [result, setResult] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      style={{ display: "grid", gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const file = data.get("file");
        const kind = String(data.get("kind"));
        const title = String(data.get("title") ?? "");
        if (!(file instanceof File) || file.type !== "application/pdf") return setResult({ error: "Choose a PDF file." });
        startTransition(async () => {
          const path = `${agencyId}/${clientId}/${kind}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
          const { error } = await createClient().storage.from("documents").upload(path, file, { contentType: "application/pdf" });
          if (error) return setResult({ error: "The PDF didn't upload. Try again." });
          const res = await registerDocument({ clientId, kind, title, path });
          setResult(res);
          if (res.ok) form.reset();
        });
      }}
    >
      <div className="row">
        <div className="field"><label htmlFor="doc-kind">Type</label>
          <select className="sel" id="doc-kind" name="kind"><option value="strategy">Strategy</option><option value="report">Monthly report</option></select></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor="doc-title">Title clients will see</label><input className="input" id="doc-title" name="title" placeholder="Q4 2026 Social Strategy" required /></div>
      </div>
      <div className="field"><label htmlFor="doc-file">PDF</label><input id="doc-file" name="file" type="file" accept="application/pdf" required /></div>
      {result.error && <p className="error">{result.error}</p>}
      {result.ok && <p className="flash">{result.ok}</p>}
      <div><button className="btn sm" disabled={pending}>{pending ? "Uploading…" : "Add to portal"}</button></div>
    </form>
  );
}

function Connect({ id, label, hint, later, setLater, children }: {
  id: string;
  label: string;
  hint: string;
  later: boolean;
  setLater: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="connect">
      <div className="connect-head">
        <b>{label}</b>
        <label className="later"><input type="checkbox" name={`${id}_later`} checked={later} onChange={(e) => setLater(e.target.checked)} /> Set up later</label>
      </div>
      {later ? <p className="note">A task will be created for the account manager to finish this.</p> : <>{children}<p className="note">{hint}</p></>}
    </div>
  );
}

export function NewClientForm({ members }: { members: Opt[] }) {
  const [state, action, pending] = useActionState(createClientAccount, {});
  const [later, setLater] = useState<Record<string, boolean>>({});
  const set = (k: string) => (v: boolean) => setLater({ ...later, [k]: v });
  const f = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field"><label htmlFor={id}>{label}</label><input className="input" id={id} name={id} {...props} /></div>
  );
  return (
    <form action={action} className="panel" style={{ maxWidth: 760, gap: 18 }}>
      <h2>Business</h2>
      <div className="row">{f("name", "Business name", { required: true })}{f("website", "Website", { placeholder: "bloomfloralstudio.com" })}</div>
      <div className="row">
        <div className="field"><label htmlFor="account_manager">Account manager</label>
          <select className="sel" id="account_manager" name="account_manager" required defaultValue="">
            <option value="" disabled>Choose one</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select></div>
        {f("start_date", "Start date", { type: "date" })}
      </div>

      <h2>Main contact</h2>
      <p className="note">They get an email invite to create their portal password. They can add one more person themselves.</p>
      <div className="row">{f("contact_name", "Name", { required: true })}{f("contact_email", "Email", { type: "email", required: true })}</div>

      <h2>Connections</h2>
      <p className="note">These power the automations. If one isn&apos;t ready yet, tick Set up later and the account manager gets a task for it.</p>
      <Connect id="drive" label="Google Drive folder" hint="Open their folder in Drive and copy the link from the address bar." later={!!later.drive} setLater={set("drive")}>
        <input className="input" name="drive_folder" aria-label="Google Drive folder link" placeholder="https://drive.google.com/drive/folders/…" />
      </Connect>
      <Connect id="slack" label="Slack channel" hint="In Slack, right-click the client's channel, choose Copy link, and paste it here. Invite the portal app to the channel too." later={!!later.slack} setLater={set("slack")}>
        <input className="input" name="slack_channel" aria-label="Slack channel link" placeholder="https://yourworkspace.slack.com/archives/C0…" />
      </Connect>
      <Connect id="rella" label="Rella space" hint="The link to this client's space in Rella." later={!!later.rella} setLater={set("rella")}>
        <input className="input" name="rella" aria-label="Rella space link" placeholder="https://…" />
      </Connect>
      <Connect id="dubsado" label="Dubsado" hint="When a contract is signed in Dubsado, Zapier sends this email to the portal and their contract step checks off." later={!!later.dubsado} setLater={set("dubsado")}>
        <div className="row">
          <input className="input" name="dubsado_email" type="email" aria-label="Client's email in Dubsado" placeholder="Client's email in Dubsado (defaults to the main contact)" style={{ flex: 1, minWidth: 220 }} />
          <input className="input" name="dubsado_project" aria-label="Dubsado project link" placeholder="Dubsado project link (optional)" style={{ flex: 1, minWidth: 220 }} />
        </div>
      </Connect>

      <p className="note">
        Every new client automatically gets your onboarding checklist and questionnaire in their portal, plus your new-client
        tasks for the team (see Agency settings).
      </p>
      {state.error && <p className="error">{state.error}</p>}
      <div><button className="btn" disabled={pending}>{pending ? "Creating…" : "Create client and send invite"}</button></div>
    </form>
  );
}

/** A select that saves as soon as it changes. */
export function AutoSubmitSelect({ name, defaultValue, options, label }: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select className="sel" name={name} defaultValue={defaultValue} aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** First click asks, second click does it. */
export function ConfirmButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <button className="btn sm warm">{confirmLabel}</button>
  ) : (
    <button type="button" className="btn sm line" onClick={() => setArmed(true)}>{label}</button>
  );
}

export function InviteTeammateForm({ clients }: { clients: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("account_manager");
  const [state, action, pending] = useActionState(inviteTeammate, {});
  if (!open) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {state.ok && <p className="flash">{state.ok}</p>}
        <div><button className="btn sm" onClick={() => setOpen(true)}>Invite teammate</button></div>
      </div>
    );
  }
  return (
    <form action={action} className="panel">
      <h2>Invite a teammate</h2>
      <div className="row">
        <div className="field"><label htmlFor="inv-name">Name</label><input className="input" id="inv-name" name="name" required /></div>
        <div className="field"><label htmlFor="inv-email">Email</label><input className="input" id="inv-email" name="email" type="email" required /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="inv-title">Job title (optional)</label><input className="input" id="inv-title" name="title" placeholder="Content creator" /></div>
        <div className="field"><label htmlFor="inv-role">Role</label>
          <select className="sel" id="inv-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="account_manager">Account manager</option>
            <option value="creator">Creator</option>
            <option value="admin">Admin</option>
          </select></div>
      </div>
      {role === "admin" ? (
        <p className="note">Admins automatically get every client.</p>
      ) : (
        <fieldset className="checks">
          <legend>Which client portals?</legend>
          {clients.map((c) => (
            <label key={c.id}><input type="checkbox" name="clients" value={c.id} /> {c.name}</label>
          ))}
          {!clients.length && <p className="note">No clients yet. You can add them to clients later.</p>}
        </fieldset>
      )}
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
        <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}

export function ClientInfoForm({ client }: {
  client: {
    id: string; name: string; slack_channel_id: string | null; drive_folder_id: string | null; rella_space_url: string | null;
    dubsado_email: string | null; dubsado_project_url: string | null; website: string | null; start_date: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateClientInfo, {});
  const f = (id: string, label: string, value: string | null, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field"><label htmlFor={`ci-${id}`}>{label}</label><input className="input" id={`ci-${id}`} name={id} defaultValue={value ?? ""} {...props} /></div>
  );
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="client" value={client.id} />
      {f("name", "Business name", client.name, { required: true })}
      <div className="row">{f("website", "Website", client.website)}{f("start_date", "Start date", client.start_date, { type: "date" })}</div>
      {f("drive_folder", "Google Drive folder link", client.drive_folder_id ? `https://drive.google.com/drive/folders/${client.drive_folder_id}` : "")}
      {f("slack_channel", "Slack channel link or ID", client.slack_channel_id)}
      {f("rella", "Rella space link", client.rella_space_url)}
      <div className="row">{f("dubsado_email", "Client's email in Dubsado", client.dubsado_email, { type: "email" })}{f("dubsado_project", "Dubsado project link", client.dubsado_project_url)}</div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div><button className="btn sm" disabled={pending}>Save changes</button></div>
    </form>
  );
}

export function DeleteClientForm({ clientId, name }: { clientId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteClient, {});
  if (!open) return <div><button className="btn sm line" onClick={() => setOpen(true)}>Delete client</button></div>;
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="client" value={clientId} />
      <p className="error">This permanently deletes {name}&apos;s portal, files, messages and history. It can&apos;t be undone.</p>
      <div className="field"><label htmlFor="del-confirm">Type {name} to confirm</label><input className="input" id="del-confirm" name="confirm" autoComplete="off" /></div>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn sm warm" disabled={pending}>Delete permanently</button>
        <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function EditTaskForm({ task, clients, people, readOnly }: {
  task: { id: string; title: string; status: string; note: string; client: string; assignee: string; due: string };
  clients: Opt[];
  people: TaskPeople;
  readOnly: boolean;
}) {
  const [client, setClient] = useState(task.client);
  const [assignee, setAssignee] = useState(task.assignee);
  const [state, action, pending] = useActionState(updateTask, {});
  const team = people.team.filter((m) => !client || m.role === "admin" || people.onClient[client]?.includes(m.user_id));
  const contacts = client ? people.contacts[client] ?? [] : [];
  const clientName = clients.find((c) => c.id === client)?.name;

  return (
    <form action={action} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="id" value={task.id} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14 }}>
        <div className="field"><label htmlFor="e-title">Task</label><input className="input" id="e-title" name="title" defaultValue={task.title} required /></div>
        <div className="row">
          <div className="field"><label htmlFor="e-status">Status</label>
            <select className="sel" id="e-status" name="status" defaultValue={task.status}>
              <option value="todo">To do</option>
              <option value="doing">In progress</option>
              <option value="waiting">Waiting on client</option>
              <option value="done">Done</option>
            </select></div>
          <div className="field"><label htmlFor="e-due">Due</label><input className="input" id="e-due" name="due" type="date" defaultValue={task.due} /></div>
        </div>
        <div className="row">
          <div className="field"><label htmlFor="e-client">Client</label>
            <select className="sel" id="e-client" name="client" value={client}
              onChange={(e) => { setClient(e.target.value); if (assignee.startsWith("client:")) setAssignee(`team:${people.me}`); }}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="e-who">Assigned to</label>
            <select className="sel" id="e-who" name="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {contacts.length > 0 && (
                <optgroup label={clientName}>
                  {contacts.map((c) => <option key={c.user_id} value={`client:${c.user_id}`}>{c.display_name} (client)</option>)}
                </optgroup>
              )}
              <optgroup label="Team">
                {team.map((m) => <option key={m.user_id} value={`team:${m.user_id}`}>{m.display_name}{m.user_id === people.me ? " (me)" : ""}</option>)}
              </optgroup>
            </select></div>
        </div>
        <div className="field"><label htmlFor="e-note">Note</label>
          <textarea className="input" id="e-note" name="note" defaultValue={task.note} style={{ minHeight: 110 }}
            placeholder="Details, links, anything the assignee needs" /></div>
      </fieldset>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      {!readOnly && <div><button className="btn" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>}
    </form>
  );
}

/** Fix a sent calendar's month or link. The approval deadline doesn't change. */
export function EditCalendar({ id, month, url }: { id: string; month: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(editCalendar, {});
  if (!open) return <button type="button" className="linkbtn note" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <form action={action} className="panel" style={{ flexBasis: "100%", gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      <div className="row">
        <div className="field"><label htmlFor={`ec-m-${id}`}>Month</label><input className="input" id={`ec-m-${id}`} name="month" type="month" defaultValue={month} required /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor={`ec-u-${id}`}>Rella link</label><input className="input" id={`ec-u-${id}`} name="url" defaultValue={url} required /></div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div className="row"><button className="btn sm" disabled={pending}>Save</button><button type="button" className="btn sm line" onClick={() => setOpen(false)}>Close</button></div>
    </form>
  );
}
