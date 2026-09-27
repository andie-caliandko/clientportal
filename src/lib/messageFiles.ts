import "server-only";
import { after } from "next/server";
import { syncUploadsToDrive } from "./drive";
import { uploadFileToSlack } from "./slack";
import { createAdminClient } from "./supabase/server";
import type { Attachment } from "./types";

/** Reads attachments posted with a message form, keeping only files in this client's messages folder. */
export function readAttachments(form: FormData, agencyId: string, clientId: string): Attachment[] {
  try {
    const list = JSON.parse(String(form.get("attachments") ?? "[]")) as Attachment[];
    const prefix = `${agencyId}/${clientId}/messages/`;
    return list.filter((a) => typeof a.path === "string" && a.path.startsWith(prefix) && typeof a.name === "string").slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * After a message with files is saved: list the files as uploads (so they show
 * on the client page and copy to Drive) and share them in the client's Slack channel.
 */
export function afterMessageFiles(opts: {
  agencyId: string;
  clientId: string;
  userId: string | null;
  attachments: Attachment[];
  slackChannel: string | null;
  slackComment?: string;
}) {
  if (!opts.attachments.length) return;
  after(async () => {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("uploads")
      .insert(opts.attachments.map((a) => ({
        agency_id: opts.agencyId, client_id: opts.clientId, kind: "message", file_name: a.name, storage_path: a.path, created_by: opts.userId,
      })))
      .select("id");
    if (opts.slackChannel) {
      for (const [i, a] of opts.attachments.entries()) {
        const { data } = await admin.storage.from("uploads").createSignedUrl(a.path, 60 * 10);
        if (data?.signedUrl) await uploadFileToSlack(opts.slackChannel, a.name, data.signedUrl, i === 0 ? opts.slackComment : undefined);
      }
    }
    if (rows?.length) await syncUploadsToDrive({ uploadIds: rows.map((r) => r.id) });
  });
}
