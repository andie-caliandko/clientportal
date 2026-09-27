import "server-only";
import { accessToken, integration } from "./google";
import { createAdminClient } from "./supabase/server";

// Files clients upload are stored in the portal first, then copied into the
// client's Google Drive folder (Branding, Content or Task files subfolder).

const SUBFOLDER: Record<string, string> = { branding: "Branding", content: "Content", task: "Task files", message: "Messages" };
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

/**
 * Copies any not-yet-synced uploads into Drive. Safe to call repeatedly.
 * Clients without a Drive folder get one made inside the agency's main client
 * folder (when one is chosen in Agency settings); agencies without Google
 * connected are skipped.
 */
export async function syncUploadsToDrive(filter: { uploadIds?: string[]; limit?: number; agencyId?: string } = {}) {
  const admin = createAdminClient();
  let q = admin
    .from("uploads")
    .select("id, kind, file_name, storage_path, client_id, client:clients!inner(name, agency_id, drive_folder_id, archived_at)")
    .is("drive_file_id", null)
    .is("client.archived_at", null)
    .order("created_at")
    .limit(filter.limit ?? 25);
  if (filter.uploadIds?.length) q = q.in("id", filter.uploadIds);
  if (filter.agencyId) q = q.eq("client.agency_id", filter.agencyId);
  const { data: rows } = await q;

  const agencies = new Map<string, { token: string; root: string | null } | null>();
  const clientFolders = new Map<string, string | null>();
  const folders = new Map<string, string>();
  let synced = 0;
  for (const row of rows ?? []) {
    const client = row.client as unknown as { name: string; agency_id: string; drive_folder_id: string | null };
    try {
      if (!agencies.has(client.agency_id)) {
        const i = await integration(client.agency_id);
        agencies.set(client.agency_id, i?.google_refresh_token ? { token: await accessToken(i.google_refresh_token), root: i.drive_root_folder_id ?? null } : null);
      }
      const agency = agencies.get(client.agency_id);
      if (!agency) continue;
      // The client's own folder: the one set on their page, or a new one in the main folder.
      if (!clientFolders.has(row.client_id)) {
        let folder = client.drive_folder_id;
        if (!folder && agency.root) {
          folder = await findOrCreateFolder(agency.token, agency.root, client.name);
          await admin.from("clients").update({ drive_folder_id: folder }).eq("id", row.client_id);
        }
        clientFolders.set(row.client_id, folder);
      }
      const clientFolder = clientFolders.get(row.client_id);
      if (!clientFolder) continue;
      const key = `${clientFolder}/${row.kind}`;
      if (!folders.has(key)) folders.set(key, await findOrCreateFolder(agency.token, clientFolder, SUBFOLDER[row.kind] ?? "Uploads"));
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

/** Can the agency's Google connection reach this Drive folder? Returns its name. */
export async function driveFolderName(agencyId: string, folderId: string): Promise<string | null> {
  const i = await integration(agencyId);
  if (!i?.google_refresh_token) return null;
  const token = await accessToken(i.google_refresh_token);
  const res = await fetch(`${API}/files/${encodeURIComponent(folderId)}?fields=name,mimeType&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const f = (await res.json()) as { name: string; mimeType: string };
  return f.mimeType === "application/vnd.google-apps.folder" ? f.name : null;
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
