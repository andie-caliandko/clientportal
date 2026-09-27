import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "@/lib/types";
import { FilePreview } from "./FilePreview";

/** Files on a message: images show a small preview; everything opens over the page. */
export function MessageFiles({ files, urls }: { files: Attachment[]; urls: Map<string, string> }) {
  if (!files?.length) return null;
  return (
    <div className="files-in-msg">
      {files.map((f) => {
        const url = urls.get(f.path);
        return url ? <FilePreview key={f.path} url={url} name={f.name} type={f.type} thumbnail /> : <span key={f.path}>{f.name}</span>;
      })}
    </div>
  );
}

/** Signed links for every attachment in a list of messages. */
export async function signAttachments(supabase: SupabaseClient, messages: { attachments?: Attachment[] | null }[]) {
  const paths = messages.flatMap((m) => (m.attachments ?? []).map((a) => a.path));
  if (!paths.length) return new Map<string, string>();
  const { data } = await supabase.storage.from("uploads").createSignedUrls(paths, 60 * 60);
  return new Map((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl!]));
}
