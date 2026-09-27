"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  addClientContact,
  addToClient,
  addTask,
  createClientAccount,
  deleteClient,
  editCalendar,
  saveNewClientTasks,
  setClientLogo,
  setContractLink,
  updateTeammate,
  inviteTeammate,
  sendCalendar,
  registerDocument,
  updateClientInfo,
  updateTask,
} from "./actions";

type Opt = { id?: string; user_id?: string; name?: string; display_name?: string; role?: string };
const ROLE_NAMES: Record<string, string> = { admin: "Admin", account_manager: "Account manager", creator: "Creator" };

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
                {contacts.length > 1 && <option value="client:all">Everyone at {clientName} (client)</option>}
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
  const [am, setAm] = useState("");
  const others = members.filter((m) => m.user_id !== am && m.role !== "admin");
  const f = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field"><label htmlFor={id}>{label}</label><input className="input" id={id} name={id} {...props} /></div>
  );
  return (
    <form action={action} className="panel" style={{ maxWidth: 760, gap: 18 }}>
      <h2>Business</h2>
      <div className="row">{f("name", "Business name", { required: true })}{f("website", "Website", { placeholder: "bloomfloralstudio.com" })}</div>
      <div className="row">
        <div className="field"><label htmlFor="account_manager">Account manager</label>
          <select className="sel" id="account_manager" name="account_manager" required value={am} onChange={(e) => setAm(e.target.value)}>
            <option value="" disabled>Choose one</option>
            {members.filter((m) => m.role !== "creator").map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name} · {ROLE_NAMES[m.role ?? ""]}</option>
            ))}
          </select>
          <span className="note">The client sees this person in their portal.</span></div>
        {f("start_date", "Start date", { type: "date" })}
      </div>

      <fieldset className="checks">
        <legend>Anyone else from the team on this account?</legend>
        {others.map((m) => (
          <label key={m.user_id}><input type="checkbox" name="team" value={m.user_id} /> {m.display_name} · {ROLE_NAMES[m.role ?? ""]}</label>
        ))}
        {!others.length && <p className="note">No one else to add yet. Admins can already see every account.</p>}
      </fieldset>

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
      <Connect id="dubsado" label="Contract (Dubsado)" hint="The contract link shows as the client's Open contract button. When they sign, Zapier sends their email to the portal and the step checks off." later={!!later.dubsado} setLater={set("dubsado")}>
        <div className="row">
          <input className="input" name="dubsado_email" type="email" aria-label="Client's email in Dubsado" placeholder="Client's email in Dubsado (defaults to the main contact)" style={{ flex: 1, minWidth: 220 }} />
          <input className="input" name="dubsado_project" aria-label="Contract link" placeholder="Contract link" style={{ flex: 1, minWidth: 220 }} />
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
      <div className="row">{f("dubsado_email", "Client's email in Dubsado", client.dubsado_email, { type: "email" })}{f("dubsado_project", "Contract link", client.dubsado_project_url)}</div>
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
                  {contacts.length > 1 && <option value="client:all">Everyone at {clientName} (client)</option>}
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

export function TeammateRow({ member, isMe }: {
  member: { user_id: string; display_name: string; title: string | null; role: string; email: string };
  isMe: boolean;
}) {
  const [state, action, pending] = useActionState(updateTeammate, {});
  const id = member.user_id;
  return (
    <form action={action} className="teammate">
      <input type="hidden" name="user" value={id} />
      <div className="field"><label htmlFor={`tm-n-${id}`}>Name{isMe ? " (you)" : ""}</label><input className="input" id={`tm-n-${id}`} name="name" defaultValue={member.display_name} required /></div>
      <div className="field"><label htmlFor={`tm-t-${id}`}>Job title</label><input className="input" id={`tm-t-${id}`} name="title" defaultValue={member.title ?? ""} placeholder="Director of Ops" /></div>
      <div className="field"><label htmlFor={`tm-r-${id}`}>Role</label>
        <select className="sel" id={`tm-r-${id}`} name="role" defaultValue={member.role}>
          <option value="admin">Admin</option><option value="account_manager">Account manager</option><option value="creator">Creator</option>
        </select></div>
      <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state.error && <p className="error" style={{ gridColumn: "1 / -1" }}>{state.error}</p>}
      {state.ok && <p className="flash" style={{ gridColumn: "1 / -1" }}>{state.ok}</p>}
    </form>
  );
}

export function NewClientTasksEditor({ tasks }: { tasks: { title: string; days?: number; assignee?: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(tasks.map((t, i) => ({ key: i, ...t })));
  const [state, action, pending] = useActionState(saveNewClientTasks, {});
  if (!editing) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {state.ok && <p className="flash">{state.ok}</p>}
        <ul className="list">
          {tasks.map((t, i) => (
            <li key={i}>{t.title}<span className="r note">Day {t.days ?? 0}</span></li>
          ))}
        </ul>
        <div><button type="button" className="btn sm line" onClick={() => setEditing(true)}>Edit list</button></div>
      </div>
    );
  }
  return (
    <form action={async (f) => { action(f); setEditing(false); }} style={{ display: "grid", gap: 10 }}>
      {rows.map((r, i) => (
        <div className="task-row" key={r.key}>
          <div className="field"><label htmlFor={`nct-d-${r.key}`}>Day</label><input className="input" id={`nct-d-${r.key}`} name="days" type="number" min={0} defaultValue={r.days ?? 0} /></div>
          <div className="field"><label htmlFor={`nct-t-${r.key}`}>Task</label><input className="input" id={`nct-t-${r.key}`} name="title" defaultValue={r.title} /></div>
          <div className="field"><label htmlFor={`nct-a-${r.key}`}>Goes to</label>
            <select className="sel" id={`nct-a-${r.key}`} name="assignee" defaultValue={r.assignee ?? "account_manager"}>
              <option value="account_manager">Account manager</option><option value="me">Admin who adds the client</option>
            </select></div>
          <button type="button" className="btn sm line" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm line" onClick={() => setRows([...rows, { key: Date.now(), title: "", days: 0, assignee: "account_manager" }])}>Add a task</button>
        <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save list"}</button>
        <button type="button" className="btn sm line" onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
    </form>
  );
}

/** Copies text to the clipboard and says so. */
export function CopyButton({ text, label, done = "Copied" }: { text: string; label: string; done?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn sm line" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }}>
      {copied ? done : label}
    </button>
  );
}

export function ContractLinkForm({ clientId, url }: { clientId: string; url: string | null }) {
  const [state, action, pending] = useActionState(setContractLink, {});
  return (
    <form action={action} className="row">
      <input type="hidden" name="client" value={clientId} />
      <div className="field">
        <label htmlFor="contract-link">Contract link</label>
        <input className="input" id="contract-link" name="contract" defaultValue={url ?? ""} placeholder="Paste the contract link from Dubsado" />
      </div>
      <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state.error && <p className="error" style={{ flexBasis: "100%" }}>{state.error}</p>}
      {state.ok && <p className="flash" style={{ flexBasis: "100%" }}>{state.ok}</p>}
      {!state.ok && !state.error && <p className="note" style={{ flexBasis: "100%" }}>Shows as the client&apos;s Open contract button on their first step.</p>}
    </form>
  );
}

export function ClientLogoForm({ agencyId, clientId, logoUrl }: { agencyId: string; clientId: string; logoUrl: string | null }) {
  const [url, setUrl] = useState(logoUrl);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="logo-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="Client logo" /> : <span className="note">No logo yet</span>}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label className="btn sm line" htmlFor={`logo-${clientId}`}>{pending ? "Uploading…" : url ? "Replace logo" : "Upload logo"}</label>
        <input id={`logo-${clientId}`} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) return setMsg({ error: "Use an image under 5 MB." });
          startTransition(async () => {
            const path = `${agencyId}/${clientId}/logo-${Date.now()}.${file.name.split(".").pop()?.toLowerCase() ?? "png"}`;
            const { error } = await createClient().storage.from("logos").upload(path, file, { contentType: file.type });
            if (error) return setMsg({ error: "The logo didn't upload. Try again." });
            const res = await setClientLogo({ clientId, path });
            setMsg(res);
            if (res.ok) setUrl(URL.createObjectURL(file));
          });
        }} />
        {url && (
          <button type="button" className="linkbtn note" onClick={() => startTransition(async () => {
            const res = await setClientLogo({ clientId, path: null });
            setMsg(res);
            if (res.ok) setUrl(null);
          })}>Remove</button>
        )}
      </div>
      {msg.error && <p className="error">{msg.error}</p>}
      {msg.ok && <p className="flash">{msg.ok}</p>}
      <p className="note">PNG, JPG, SVG or WebP. It shows at the top right of their portal.</p>
    </div>
  );
}

/** "+ Add teammate" on a client's page: pick someone on the team, or invite someone new. */
export function AddTeammate({ clientId, clientName, existing }: {
  clientId: string;
  clientName: string;
  existing: { user_id: string; display_name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(existing.length ? "existing" : "new");
  const [state, action, pending] = useActionState(inviteTeammate, {});
  const [adding, startAdding] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {state.ok && <p className="flash">{state.ok} They&apos;re on {clientName}&apos;s team.</p>}
        <div><button type="button" className="btn sm" onClick={() => setOpen(true)}>＋ Add teammate</button></div>
      </div>
    );
  }
  return (
    <div className="panel" style={{ gap: 12, background: "var(--bg)" }}>
      <div className="tabs" role="tablist" style={{ margin: 0 }}>
        {existing.length > 0 && <button type="button" role="tab" aria-selected={mode === "existing"} onClick={() => setMode("existing")}>Someone on the team</button>}
        <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => setMode("new")}>Invite someone new</button>
      </div>
      {mode === "existing" ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startAdding(async () => {
              await addToClient(data);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <input type="hidden" name="client" value={clientId} />
          <div className="field">
            <label htmlFor={`at-${clientId}`}>Teammate</label>
            <select className="sel" id={`at-${clientId}`} name="user">
              {existing.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name} · {ROLE_NAMES[m.role] ?? m.role}</option>)}
            </select>
          </div>
          <button className="btn sm" disabled={adding}>{adding ? "Adding…" : "Add to this account"}</button>
        </form>
      ) : (
        <form action={action} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="clients" value={clientId} />
          <div className="row">
            <div className="field"><label htmlFor={`ic-name-${clientId}`}>Name</label><input className="input" id={`ic-name-${clientId}`} name="name" required /></div>
            <div className="field"><label htmlFor={`ic-email-${clientId}`}>Email</label><input className="input" id={`ic-email-${clientId}`} name="email" type="email" required /></div>
            <div className="field"><label htmlFor={`ic-role-${clientId}`}>Role</label>
              <select className="sel" id={`ic-role-${clientId}`} name="role" defaultValue="account_manager">
                <option value="account_manager">Account manager</option>
                <option value="creator">Creator</option>
              </select></div>
          </div>
          {state.error && <p className="error">{state.error}</p>}
          {state.ok && <p className="flash">{state.ok} They&apos;re on {clientName}&apos;s team.</p>}
          <div><button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button></div>
        </form>
      )}
      <div><button type="button" className="linkbtn note" onClick={() => setOpen(false)}>Close</button></div>
    </div>
  );
}

export function AddClientContact({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addClientContact, {});
  if (!open) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {state.ok && <p className="flash">{state.ok}</p>}
        <div><button type="button" className="btn sm line" onClick={() => setOpen(true)}>Add a person to their portal</button></div>
      </div>
    );
  }
  return (
    <form action={async (f) => { action(f); }} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="client" value={clientId} />
      <div className="row">
        <div className="field"><label htmlFor={`cc-name-${clientId}`}>Name</label><input className="input" id={`cc-name-${clientId}`} name="name" required /></div>
        <div className="field"><label htmlFor={`cc-email-${clientId}`}>Email</label><input className="input" id={`cc-email-${clientId}`} name="email" type="email" required /></div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="flash">{state.ok}</p>}
      <div className="row">
        <button className="btn sm" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
        <button type="button" className="btn sm line" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
