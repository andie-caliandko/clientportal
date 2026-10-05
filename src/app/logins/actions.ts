"use server";

import { revalidatePath } from "next/cache";
import { notifyClient, notifyUser } from "@/lib/notifications";
import { sendEmail } from "@/lib/notify";
import { getViewer } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, vaultReady } from "@/lib/vault";

type Result = { error?: string; ok?: string };

/** Who's changing a client's logins: the client themselves, or someone on the team who can edit that client. */
async function editorFor(clientId: string) {
  const v = await getViewer();
  if (!v) return null;
  if (v.kind === "client") return v.client.id === clientId ? v : null;
  if (v.member.role === "creator") return null;
  const { data: ok } = await (await createClient()).rpc("can_edit_client", { c: clientId });
  return ok ? v : null;
}

const refresh = (clientId: string) => {
  revalidatePath("/portal", "layout");
  revalidatePath(`/team/clients/${clientId}`);
};

/** Add or update a login. A blank password on an existing login keeps the saved one. */
export async function saveLogin(_: Result, form: FormData): Promise<Result> {
  if (!vaultReady()) return { error: "Logins aren't set up on the server yet." };
  const clientId = String(form.get("client") ?? "");
  const v = await editorFor(clientId);
  if (!v) return { error: "You can't change logins for this account." };
  const id = String(form.get("id") ?? "");
  const service = String(form.get("service") ?? "").trim().slice(0, 80);
  const username = String(form.get("username") ?? "").trim().slice(0, 200) || null;
  const password = String(form.get("password") ?? "");
  const url = String(form.get("url") ?? "").trim().slice(0, 300) || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  if (!service) return { error: "Say what it's for, like Instagram." };
  if (!id && !password) return { error: "Add the password." };
  const admin = createAdminClient();
  const fields = { service, username, url, note, updated_by: v.userId, updated_at: new Date().toISOString(), ...(password ? { secret_enc: encryptSecret(password) } : {}) };
  if (id) {
    const { error } = await admin.from("client_logins").update(fields).eq("id", id).eq("client_id", clientId);
    if (error) return { error: "That login couldn't be saved." };
  } else {
    const { error } = await admin.from("client_logins").insert({ ...fields, agency_id: v.agency.id, client_id: clientId, created_by: v.userId });
    if (error) return { error: "That login couldn't be saved." };
  }
  // A client's first login checks off their onboarding step.
  if (v.kind === "client" && !id) {
    const { data: step } = await admin.from("onboarding_steps").select("id").eq("agency_id", v.agency.id).eq("kind", "logins").maybeSingle();
    if (step) await admin.from("client_step_status").upsert({ client_id: clientId, step_id: step.id, completed_by: v.userId }, { ignoreDuplicates: true });
  }
  // Let the account manager know a client shared something (never the password itself).
  if (v.kind === "client" && v.client.account_manager_id) {
    await notifyUser(v.agency.id, clientId, v.client.account_manager_id, { kind: "task", title: `${v.client.name} ${id ? "updated" : "shared"} a login: ${service}`, body: null, link: `/team/clients/${clientId}#logins` });
  }
  refresh(clientId);
  return { ok: id ? "Saved." : "Login added." };
}

export async function deleteLogin(clientId: string, id: string): Promise<Result> {
  const v = await editorFor(clientId);
  if (!v) return { error: "You can't change logins for this account." };
  await createAdminClient().from("client_logins").delete().eq("id", id).eq("client_id", clientId);
  refresh(clientId);
  return { ok: "Removed." };
}

/**
 * Show a password to the team. Only admins and the client's account manager can,
 * and each reveal is recorded with who and when.
 */
export async function revealLogin(id: string): Promise<{ error?: string; password?: string }> {
  const v = await getViewer();
  if (!v || v.kind !== "team") return { error: "Only your team can reveal passwords." };
  const admin = createAdminClient();
  const { data: login } = await admin.from("client_logins").select("id, client_id, secret_enc, client:clients!inner(agency_id, account_manager_id)").eq("id", id).maybeSingle();
  const client = login?.client as unknown as { agency_id: string; account_manager_id: string | null } | undefined;
  if (!login || !client || client.agency_id !== v.agency.id) return { error: "That login wasn't found." };
  if (v.member.role !== "admin" && client.account_manager_id !== v.userId) return { error: "Only admins and this client's account manager can reveal passwords." };
  if (!login.secret_enc) return { error: "No password was saved." };
  try {
    const password = decryptSecret(login.secret_enc);
    await admin.from("client_login_reveals").insert({ login_id: login.id, client_id: login.client_id, user_id: v.userId });
    revalidatePath(`/team/clients/${login.client_id}`);
    return { password };
  } catch {
    return { error: "That password couldn't be read." };
  }
}

/** Team: ask a client to share logins. Sends an email and a portal notification pointing to Logins. */
export async function requestLogins(_: Result, form: FormData): Promise<Result> {
  const clientId = String(form.get("client") ?? "");
  const v = await editorFor(clientId);
  if (!v || v.kind !== "team") return { error: "You can't send requests for this account." };
  const other = String(form.get("other") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const services = [...form.getAll("services").map(String), ...other].map((s) => s.slice(0, 80)).slice(0, 20);
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const admin = createAdminClient();
  const [{ data: client }, { data: people }] = await Promise.all([
    admin.from("clients").select("name").eq("id", clientId).maybeSingle(),
    admin.from("client_users").select("email, display_name").eq("client_id", clientId),
  ]);
  if (!client) return { error: "That client wasn't found." };
  if (!people?.length) return { error: "No one has joined their portal yet. Invite them first." };
  const who = v.member.display_name.split(" ")[0];
  const what = services.length ? services.join(", ") : "the accounts we'll be managing";
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/portal/logins`;
  await notifyClient(clientId, { kind: "task", title: `${who} asked for your logins`, body: `Please add: ${what}`, link: "/portal/logins" });
  await sendEmail(
    people.map((p) => p.email),
    `Please share your logins with ${v.agency.brand.shortName ?? v.agency.name}`,
    [
      `Hi ${people.map((p) => p.display_name.trim()).join(" and ")},`,
      `${who} asked you to share the logins for ${what}.`,
      note,
      `Please add them in your portal, where passwords are encrypted and only your account team can see them:\n${link}`,
      "For your security, please don't reply to this email with a password.",
    ].filter(Boolean).join("\n\n"),
  );
  return { ok: `Login request sent to ${people.map((p) => p.display_name.split(" ")[0]).join(" and ")}.` };
}
