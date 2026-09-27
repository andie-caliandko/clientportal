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
 * Copies any not-yet-synced uploads into Drive. Safe to call repeatedly; skips
 * clients without a Drive folder and agencies without Google connected.
 */
export async function syncUploadsToDrive(filter: { uploadIds?: string[]; limit?: number } = {}) {
  const admin = createAdminClient();
  let q = admin
    .from("uploads")
    .select("id, kind, file_name, storage_path, client:clients!inner(agency_id, drive_folder_id, archived_at)")
    .is("drive_file_id", null)
    .not("client.drive_folder_id", "is", null)
    .is("client.archived_at", null)
    .order("created_at")
    .limit(filter.limit ?? 25);
  if (filter.uploadIds?.length) q = q.in("id", filter.uploadIds);
  const { data: rows } = await q;

  const tokens = new Map<string, string | null>();
  const folders = new Map<string, string>();
  let synced = 0;
  for (const row of rows ?? []) {
    const client = row.client as unknown as { agency_id: string; drive_folder_id: string };
    try {
      if (!tokens.has(client.agency_id)) {
        const i = await integration(client.agency_id);
        tokens.set(client.agency_id, i?.google_refresh_token ? await accessToken(i.google_refresh_token) : null);
      }
      const token = tokens.get(client.agency_id);
      if (!token) continue;
      const key = `${client.drive_folder_id}/${row.kind}`;
      if (!folders.has(key)) folders.set(key, await findOrCreateFolder(token, client.drive_folder_id, SUBFOLDER[row.kind] ?? "Uploads"));
      const { data: signed } = await admin.storage.from("uploads").createSignedUrl(row.storage_path, 60 * 30);
      if (!signed?.signedUrl) continue;
      const fileId = await uploadOne(token, folders.get(key)!, row.file_name, signed.signedUrl);
      await admin.from("uploads").update({ drive_file_id: fileId }).eq("id", row.id);
      synced++;
    } catch (err) {
      console.error(`Drive sync failed for upload ${row.id}:`, err);
    }
  }
  return synced;
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
