import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "@/lib/types";

/** Files on a message: images show a preview, everything else a download link. */
export function MessageFiles({ files, urls }: { files: Attachment[]; urls: Map<string, string> }) {
  if (!files?.length) return null;
  return (
    <div className="files-in-msg">
      {files.map((f) => {
        const url = urls.get(f.path);
        if (!url) return <span key={f.path}>{f.name}</span>;
        return f.type?.startsWith("image/") ? (
          <a key={f.path} href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={f.name} />
          </a>
        ) : (
          <a key={f.path} href={url} target="_blank" rel="noreferrer">Attachment: {f.name}</a>
        );
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
