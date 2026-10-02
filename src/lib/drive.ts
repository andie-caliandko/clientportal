import "server-only";
import { accessToken, integration } from "./google";
import { createAdminClient } from "./supabase/server";

// Files clients upload are stored in the portal first, then copied into the
// client's Google Drive folder. Branding and content uploads go in their own
// folders (every client folder gets both); anything else, like task files and
// message attachments, goes straight into the client's folder.

const SUBFOLDER: Record<string, string> = { branding: "Branding", content: "Content" };
const STANDARD = Object.values(SUBFOLDER);
const API = "https://www.googleapis.com/drive/v3";

async function findOrCreateFolder(token: string, parentId: string, name: string) {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const found = await fetch(`${API}/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (found.files?.[0]?.id) return found.files[0].id as string;
  const created = await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  }).then((r) => r.json());
  if (!created.id) throw new Error(`Couldn't create Drive folder: ${JSON.stringify(created.error ?? created)}`);
  return created.id as string;
}

/** Streams one file from portal storage into Drive. Returns the Drive file id. */
async function uploadOne(token: string, folderId: string, name: string, sourceUrl: string) {
  const source = await fetch(sourceUrl);
  if (!source.ok || !source.body) throw new Error(`Couldn't read ${name} from storage`);
  const type = source.headers.get("content-type") ?? "application/octet-stream";
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
      ...(source.headers.get("content-length") ? { "X-Upload-Content-Length": source.headers.get("content-length")! } : {}),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const session = start.headers.get("location");
  if (!session) throw new Error(`Drive refused the upload: ${await start.text()}`);
  const done = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: source.body,
    // Node needs this to stream a request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const file = await done.json();
  if (!file.id) throw new Error(`Drive upload failed: ${JSON.stringify(file.error ?? file)}`);
  return file.id as string;
}

type Agency = { token: string };

async function agencyDrive(agencyId: string): Promise<Agency | null> {
  const i = await integration(agencyId);
  return i?.google_refresh_token ? { token: await accessToken(i.google_refresh_token) } : null;
}

/**
 * The client's Drive folder (the link saved on their page), with its Branding
 * and Content folders. Null when they don't have one.
 */
async function clientFolder(agency: Agency, client: { id?: string; drive_folder_id: string | null }) {
  const folder = client.drive_folder_id;
  if (!folder) return null;
  const ids: Record<string, string> = {};
  for (const name of STANDARD) ids[name] = await findOrCreateFolder(agency.token, folder, name);
  // Remember the Branding and Content folders so the portal can link straight to them.
  if (client.id) await createAdminClient().from("clients").update({ drive_branding_id: ids.Branding, drive_content_id: ids.Content }).eq("id", client.id);
  return folder;
}

/** Sets up Drive folders for one client, or every active client of an agency. Safe to repeat. */
export async function ensureClientFolders(opts: { clientId?: string; agencyId?: string }) {
  const admin = createAdminClient();
  let q = admin.from("clients").select("id, agency_id, drive_folder_id").is("archived_at", null).not("drive_folder_id", "is", null);
  if (opts.clientId) q = q.eq("id", opts.clientId);
  if (opts.agencyId) q = q.eq("agency_id", opts.agencyId);
  const { data: clients } = await q;
  const agencies = new Map<string, Agency | null>();
  for (const c of clients ?? []) {
    try {
      if (!agencies.has(c.agency_id)) agencies.set(c.agency_id, await agencyDrive(c.agency_id));
      const agency = agencies.get(c.agency_id);
      if (agency) await clientFolder(agency, c);
    } catch (err) {
      console.error(`Setting up Drive folders failed for client ${c.id}:`, err);
    }
  }
}

/**
 * Copies any not-yet-synced uploads into each client's Drive folder. Safe to
 * call repeatedly; skips clients without a Drive folder link and agencies
 * without Google connected.
 */
export async function syncUploadsToDrive(filter: { uploadIds?: string[]; limit?: number; agencyId?: string; clientId?: string } = {}) {
  const admin = createAdminClient();
  let q = admin
    .from("uploads")
    .select("id, kind, file_name, storage_path, client_id, client:clients!inner(agency_id, drive_folder_id, archived_at)")
    .is("drive_file_id", null)
    .not("client.drive_folder_id", "is", null)
    .is("client.archived_at", null)
    .order("created_at")
    .limit(filter.limit ?? 25);
  if (filter.uploadIds?.length) q = q.in("id", filter.uploadIds);
  if (filter.agencyId) q = q.eq("client.agency_id", filter.agencyId);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  const { data: rows } = await q;

  const agencies = new Map<string, Agency | null>();
  const clientFolders = new Map<string, string | null>();
  const folders = new Map<string, string>();
  let synced = 0;
  for (const row of rows ?? []) {
    const client = row.client as unknown as { agency_id: string; drive_folder_id: string | null };
    try {
      if (!agencies.has(client.agency_id)) agencies.set(client.agency_id, await agencyDrive(client.agency_id));
      const agency = agencies.get(client.agency_id);
      if (!agency) continue;
      if (!clientFolders.has(row.client_id)) clientFolders.set(row.client_id, await clientFolder(agency, { id: row.client_id, ...client }));
      const base = clientFolders.get(row.client_id);
      if (!base) continue;
      // Branding and content in their folders; everything else loose in the client's folder.
      const sub = SUBFOLDER[row.kind];
      const key = `${base}/${sub ?? ""}`;
      if (!folders.has(key)) folders.set(key, sub ? await findOrCreateFolder(agency.token, base, sub) : base);
      const { data: signed } = await admin.storage.from("uploads").createSignedUrl(row.storage_path, 60 * 30);
      if (!signed?.signedUrl) continue;
      const fileId = await uploadOne(agency.token, folders.get(key)!, row.file_name, signed.signedUrl);
      await admin.from("uploads").update({ drive_file_id: fileId }).eq("id", row.id);
      synced++;
    } catch (err) {
      console.error(`Drive sync failed for upload ${row.id}:`, err);
    }
  }
  return synced;
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/**
 * Everything waiting for Drive, for one client or a whole agency: folders set
 * up, then files copied in batches until done (or time runs short).
 */
export async function catchUpDrive(opts: { agencyId?: string; clientId?: string }) {
  await ensureClientFolders(opts);
  const started = Date.now();
  let total = 0;
  while (Date.now() - started < 240_000) {
    const n = await syncUploadsToDrive({ ...opts, limit: 25 });
    total += n;
    if (n < 25) break;
  }
  return total;
}

/**
 * Give the people on a client's portal access to their Drive folder (as
 * editors, so they can add files), or take that access away again.
 */
export async function setClientDriveAccess(clientId: string, on: boolean) {
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("agency_id, drive_folder_id").eq("id", clientId).maybeSingle();
  if (!client?.drive_folder_id) return { error: "Add their Google Drive folder link under Client info first." };
  const agency = await agencyDrive(client.agency_id);
  if (!agency) return { error: "Connect Google in Settings first." };
  const { data: people } = await admin.from("client_users").select("email").eq("client_id", clientId);
  const emails = (people ?? []).map((p) => p.email.toLowerCase());
  const folder = client.drive_folder_id;
  const auth = { Authorization: `Bearer ${agency.token}` };
  if (on) {
    for (const email of emails) {
      await fetch(`${API}/files/${folder}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
      });
    }
  } else {
    const list = await fetch(`${API}/files/${folder}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role)`, { headers: auth }).then((r) => r.json());
    for (const p of (list.permissions ?? []) as { id: string; emailAddress?: string; role: string }[]) {
      if (p.role !== "owner" && p.emailAddress && emails.includes(p.emailAddress.toLowerCase())) {
        await fetch(`${API}/files/${folder}/permissions/${p.id}?supportsAllDrives=true`, { method: "DELETE", headers: auth });
      }
    }
  }
  await admin.from("clients").update({ drive_shared: on }).eq("id", clientId);
  return { ok: on ? "Shared. They can open their folder from their portal." : "No longer shared." };
}
