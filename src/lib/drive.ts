import "server-only";
import { accessToken, integration } from "./google";
import { createAdminClient } from "./supabase/server";

// Files clients upload are stored in the portal first, then copied into the
// client's Google Drive folder: branding and content uploads into their own
// folders (every client folder gets both). Anything else, like task files and
// message attachments, stays in the portal; the team files those themselves.

const SUBFOLDER: Record<string, string> = { branding: "Branding", content: "Content" };
const STANDARD = Object.values(SUBFOLDER);
const API = "https://www.googleapis.com/drive/v3";

const folderQuery = (parentId: string, name: string) => encodeURIComponent(
  `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
);

/** Folders with this name in the parent, oldest first. */
async function foldersNamed(token: string, parentId: string, name: string) {
  const found = await fetch(`${API}/files?q=${folderQuery(parentId, name)}&fields=files(id)&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return ((found.files ?? []) as { id: string }[]).map((f) => f.id);
}

/**
 * The folder with this name in the parent, made if it isn't there. Two runs at the same moment can
 * both make one, so after making it we look again and keep only the oldest (ours goes to the trash).
 */
async function findOrCreateFolder(token: string, parentId: string, name: string) {
  const existing = await foldersNamed(token, parentId, name);
  if (existing[0]) return existing[0];
  const created = await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  }).then((r) => r.json());
  if (!created.id) throw new Error(`Couldn't create Drive folder: ${JSON.stringify(created.error ?? created)}`);
  const all = await foldersNamed(token, parentId, name);
  const keep = all[0] ?? created.id;
  if (keep !== created.id) {
    await fetch(`${API}/files/${created.id}?supportsAllDrives=true`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
  }
  return keep as string;
}

/** Streams one file from portal storage into Drive. Returns the Drive file id. */
async function uploadOne(token: string, folderId: string, name: string, sourceUrl: string, description?: string | null) {
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
    // The client's caption shows in Drive's file details.
    body: JSON.stringify({ name, parents: [folderId], ...(description ? { description } : {}) }),
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
    .select("id, kind, file_name, storage_path, note, client_id, client:clients!inner(agency_id, drive_folder_id, archived_at)")
    .is("drive_file_id", null)
    .in("kind", Object.keys(SUBFOLDER))
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
      const sub = SUBFOLDER[row.kind];
      const key = `${base}/${sub}`;
      if (!folders.has(key)) folders.set(key, await findOrCreateFolder(agency.token, base, sub));
      const { data: signed } = await admin.storage.from("uploads").createSignedUrl(row.storage_path, 60 * 30);
      if (!signed?.signedUrl) continue;
      const fileId = await uploadOne(agency.token, folders.get(key)!, row.file_name, signed.signedUrl, row.note);
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

// ---------------------------------------------------------------------------
// Folders the platform makes and files it keeps there:
//   Clients/<Client>/<Client> onboarding questionnaire.pdf   (saved when they submit it)
//   Clients/<Client>/Branding, Content                (client uploads)
//   Clients/<Client>/Content Shoots/<date> Content Shoot/   (sent shoot plan PDF, plus the shoot's files)
//   Clients/<Client>/Content Shoots/<date> Content Shoot/Model Waivers/
//   Clients/<Client>/Reports/Strategy, Analytics       (PDFs added to the portal)
// ---------------------------------------------------------------------------

export const SHOOTS_FOLDER = "Content Shoots";
export const REPORTS_FOLDER = "Reports";
const REPORT_FOLDER: Record<string, string> = { strategy: "Strategy", report: "Analytics" };

/** A folder link for the portal and the team pages. */
export const driveFolderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

async function driveFetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Drive ${res.status}: ${JSON.stringify(body?.error ?? body)}`);
  return body as T;
}

/** Saves a PDF (or other bytes) into a folder, or replaces the contents of `existingId` so links keep working. */
async function saveBytes(token: string, folderId: string, name: string, bytes: Uint8Array, type: string, existingId?: string | null) {
  if (existingId) {
    try {
      await driveFetch(token, `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&supportsAllDrives=true`, {
        method: "PATCH", headers: { "Content-Type": type }, body: Buffer.from(bytes),
      });
      await driveFetch(token, `${API}/files/${existingId}?supportsAllDrives=true`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      return existingId;
    } catch {
      // Deleted in Drive: make a new one below.
    }
  }
  const boundary = `b${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await driveFetch<{ id: string }>(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return file.id;
}

/**
 * New clients only: make "<Client name>" inside the agency's Clients folder, with every folder the
 * platform uses, and save it as their Drive folder. A folder that's already there with that name is
 * used rather than making a second one. Returns the folder id, or null if Drive isn't set up.
 */
export async function createClientDriveFolder(clientId: string) {
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name, agency_id, drive_folder_id, agencies(drive_clients_folder_id)").eq("id", clientId).maybeSingle();
  const parent = (client?.agencies as unknown as { drive_clients_folder_id: string | null } | null)?.drive_clients_folder_id;
  if (!client || client.drive_folder_id || !parent) return client?.drive_folder_id ?? null;
  const agency = await agencyDrive(client.agency_id);
  if (!agency) return null;
  const folder = await findOrCreateFolder(agency.token, parent, client.name);
  const [branding, content] = [await findOrCreateFolder(agency.token, folder, "Branding"), await findOrCreateFolder(agency.token, folder, "Content")];
  await findOrCreateFolder(agency.token, folder, SHOOTS_FOLDER);
  const reports = await findOrCreateFolder(agency.token, folder, REPORTS_FOLDER);
  for (const name of Object.values(REPORT_FOLDER)) await findOrCreateFolder(agency.token, reports, name);
  await admin.from("clients").update({ drive_folder_id: folder, drive_branding_id: branding, drive_content_id: content }).eq("id", clientId);
  return folder;
}

const shootFolderName = (date: string, end?: string | null) => `${date}${end && end > date ? ` to ${end}` : ""} Content Shoot`;

/**
 * The shoot's own folder in Content Shoots (made the first time, renamed if the date moves).
 * Null when the client has no Drive folder or Google isn't connected.
 */
export function ensureShootFolder(shootId: string) {
  // Several things ask for the folder at once (saving, sending the plan, gallery uploads three at a
  // time): share one run per shoot instead of each making its own.
  let run = shootFolderRuns.get(shootId);
  if (!run) {
    run = makeShootFolder(shootId).finally(() => shootFolderRuns.delete(shootId));
    shootFolderRuns.set(shootId, run);
  }
  return run;
}

const shootFolderRuns = new Map<string, Promise<{ token: string; folderId: string } | null>>();

async function makeShootFolder(shootId: string): Promise<{ token: string; folderId: string } | null> {
  const admin = createAdminClient();
  const { data: shoot } = await admin.from("content_shoots")
    .select("id, shoot_date, end_date, status, drive_folder_id, clients(agency_id, drive_folder_id)").eq("id", shootId).maybeSingle();
  const client = shoot?.clients as unknown as { agency_id: string; drive_folder_id: string | null } | null;
  if (!shoot || !client?.drive_folder_id) return null;
  const agency = await agencyDrive(client.agency_id);
  if (!agency) return null;
  const name = shootFolderName(shoot.shoot_date, shoot.end_date);
  if (shoot.drive_folder_id) {
    try {
      const f = await driveFetch<{ name: string; trashed: boolean }>(agency.token, `${API}/files/${shoot.drive_folder_id}?fields=name,trashed&supportsAllDrives=true`);
      if (!f.trashed) {
        if (f.name !== name && shoot.status === "scheduled") {
          await driveFetch(agency.token, `${API}/files/${shoot.drive_folder_id}?supportsAllDrives=true`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
          });
        }
        return { token: agency.token, folderId: shoot.drive_folder_id as string };
      }
    } catch {
      // Gone from Drive: make it again.
    }
  }
  if (shoot.status !== "scheduled") return null;
  const parent = await findOrCreateFolder(agency.token, client.drive_folder_id, SHOOTS_FOLDER);
  const folderId = await findOrCreateFolder(agency.token, parent, name);
  // Only saved if nothing else saved one first (a run elsewhere at the same moment); otherwise use theirs.
  const { data: saved } = await admin.from("content_shoots").update({ drive_folder_id: folderId })
    .eq("id", shootId).or(`drive_folder_id.is.null,drive_folder_id.eq.${shoot.drive_folder_id ?? "none"}`).select("id");
  if (!saved?.length) {
    const { data: winner } = await admin.from("content_shoots").select("drive_folder_id").eq("id", shootId).maybeSingle();
    if (winner?.drive_folder_id) return { token: agency.token, folderId: winner.drive_folder_id as string };
  }
  return { token: agency.token, folderId };
}

/** Save the shoot plan PDF the client was just sent into the shoot's folder (replacing the last one sent). */
export async function savePlanPdfToDrive(shootId: string, pdf: Uint8Array, fileName: string) {
  const folder = await ensureShootFolder(shootId);
  if (!folder) return null;
  const admin = createAdminClient();
  const { data: share } = await admin.from("shoot_plan_shares").select("drive_file_id").eq("shoot_id", shootId).maybeSingle();
  const id = await saveBytes(folder.token, folder.folderId, fileName, pdf, "application/pdf", share?.drive_file_id);
  await admin.from("shoot_plan_shares").update({ drive_file_id: id }).eq("shoot_id", shootId);
  return id;
}

/** Copy a signed model waiver into the shoot's Model Waivers folder. */
export async function saveWaiverToDrive(waiverId: string) {
  const admin = createAdminClient();
  const { data: w } = await admin.from("shoot_waivers").select("id, shoot_id, file_name, file_path, drive_file_id").eq("id", waiverId).maybeSingle();
  if (!w || w.drive_file_id) return null;
  const folder = await ensureShootFolder(w.shoot_id);
  if (!folder) return null;
  const waivers = await findOrCreateFolder(folder.token, folder.folderId, "Model Waivers");
  const { data: signed } = await admin.storage.from("waivers").createSignedUrl(w.file_path, 60 * 30);
  if (!signed?.signedUrl) return null;
  const id = await uploadOne(folder.token, waivers, w.file_name, signed.signedUrl);
  await admin.from("shoot_waivers").update({ drive_file_id: id }).eq("id", waiverId);
  return id;
}

/** Move a removed waiver's Drive copy to the trash (it can still be restored from Drive). */
export async function trashDriveFile(agencyId: string, fileId: string) {
  const agency = await agencyDrive(agencyId);
  if (!agency) return;
  await driveFetch(agency.token, `${API}/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  });
}

/** Save the client's onboarding questionnaire answers as a PDF in their main Drive folder (replaced if they send it again). */
export async function saveQuestionnaireToDrive(clientId: string) {
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name, agency_id, drive_folder_id, drive_questionnaire_id").eq("id", clientId).maybeSingle();
  if (!client?.drive_folder_id) return null;
  const agency = await agencyDrive(client.agency_id);
  if (!agency) return null;
  const { questionnairePdf } = await import("./questionnairePdf");
  const pdf = await questionnairePdf(clientId);
  if (!pdf) return null;
  const id = await saveBytes(agency.token, client.drive_folder_id, `${client.name.replace(/[\\/:*?"<>|]+/g, "-")} onboarding questionnaire.pdf`, pdf, "application/pdf", client.drive_questionnaire_id);
  await admin.from("clients").update({ drive_questionnaire_id: id }).eq("id", clientId);
  return id;
}

/** Copy strategy and analytics PDFs added to the portal into the client's Reports folder. */
export async function syncDocumentsToDrive(filter: { documentIds?: string[]; limit?: number } = {}) {
  const admin = createAdminClient();
  let q = admin.from("documents")
    .select("id, kind, title, storage_path, client_id, clients!inner(agency_id, drive_folder_id, archived_at)")
    .eq("drive_status", "pending").not("clients.drive_folder_id", "is", null).is("clients.archived_at", null)
    .order("created_at").limit(filter.limit ?? 25);
  if (filter.documentIds?.length) q = q.in("id", filter.documentIds);
  const { data: rows } = await q;
  const agencies = new Map<string, Agency | null>();
  let synced = 0;
  for (const row of rows ?? []) {
    const client = row.clients as unknown as { agency_id: string; drive_folder_id: string };
    try {
      if (!agencies.has(client.agency_id)) agencies.set(client.agency_id, await agencyDrive(client.agency_id));
      const agency = agencies.get(client.agency_id);
      if (!agency) continue;
      const reports = await findOrCreateFolder(agency.token, client.drive_folder_id, REPORTS_FOLDER);
      const folder = await findOrCreateFolder(agency.token, reports, REPORT_FOLDER[row.kind] ?? "Strategy");
      const { data: signed } = await admin.storage.from("documents").createSignedUrl(row.storage_path, 60 * 30);
      if (!signed?.signedUrl) continue;
      const name = `${row.title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Report"}.pdf`;
      const fileId = await uploadOne(agency.token, folder, name, signed.signedUrl);
      await admin.from("documents").update({ drive_status: "done", drive_file_id: fileId }).eq("id", row.id);
      synced++;
    } catch (err) {
      console.error(`Drive copy failed for document ${row.id}:`, err);
    }
  }
  return synced;
}

/** Copy gallery photos and videos into the shoot's Drive folder, in a Gallery folder. */
export async function syncGalleryToDrive(filter: { shootId?: string; itemIds?: string[]; limit?: number } = {}) {
  const admin = createAdminClient();
  // Copies that started over half an hour ago and never finished get another go.
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  let q = admin.from("shoot_gallery_items").select("id, shoot_id, file_name, file_path")
    .or(`drive_status.eq.pending,and(drive_status.eq.copying,drive_claimed_at.lt.${stale})`).order("created_at").limit(filter.limit ?? 20);
  if (filter.shootId) q = q.eq("shoot_id", filter.shootId);
  if (filter.itemIds?.length) q = q.in("id", filter.itemIds);
  const { data: rows } = await q;
  const folders = new Map<string, { token: string; folderId: string } | null>();
  let synced = 0;
  for (const row of rows ?? []) {
    // Claim it, so a second run at the same time leaves it alone.
    const { data: claimed } = await admin.from("shoot_gallery_items").update({ drive_status: "copying", drive_claimed_at: new Date().toISOString() })
      .eq("id", row.id).or(`drive_status.eq.pending,and(drive_status.eq.copying,drive_claimed_at.lt.${stale})`).select("id");
    if (!claimed?.length) continue;
    try {
      if (!folders.has(row.shoot_id)) {
        const shoot = await ensureShootFolder(row.shoot_id);
        folders.set(row.shoot_id, shoot ? { token: shoot.token, folderId: await findOrCreateFolder(shoot.token, shoot.folderId, "Gallery") } : null);
      }
      const folder = folders.get(row.shoot_id);
      // No Drive folder for this client: nothing to copy to, and don't keep trying.
      if (!folder) { await admin.from("shoot_gallery_items").update({ drive_status: "skipped" }).eq("id", row.id); continue; }
      const { data: signed } = await admin.storage.from("galleries").createSignedUrl(row.file_path, 60 * 30);
      if (!signed?.signedUrl) throw new Error("No link to the file");
      const fileId = await uploadOne(folder.token, folder.folderId, row.file_name, signed.signedUrl);
      await admin.from("shoot_gallery_items").update({ drive_status: "done", drive_file_id: fileId }).eq("id", row.id);
      synced++;
    } catch (err) {
      await admin.from("shoot_gallery_items").update({ drive_status: "pending" }).eq("id", row.id);
      console.error(`Drive copy failed for gallery item ${row.id}:`, err);
    }
  }
  return synced;
}
