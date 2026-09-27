// Accept whatever people paste (a full link or a bare ID) and keep the part we need.

/** Slack channel ID from a channel link (…/archives/C0123 or …/client/T01/C0123) or a bare ID. */
export function slackChannelId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromLink = text.match(/\/(?:archives|client\/[A-Z0-9]+)\/([CG][A-Z0-9]{6,})/i);
  if (fromLink) return fromLink[1].toUpperCase();
  const bare = text.match(/^[CG][A-Z0-9]{6,}$/i);
  return bare ? text.toUpperCase() : null;
}

/** Google Drive folder ID from a folder link (…/folders/<id>) or a bare ID. */
export function driveFolderId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromLink = text.match(/\/folders\/([\w-]{10,})/) ?? text.match(/[?&]id=([\w-]{10,})/);
  if (fromLink) return fromLink[1];
  return /^[\w-]{10,}$/.test(text) ? text : null;
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export function isUrl(input: string) {
  return /^https?:\/\/\S+\.\S+/.test(input.trim());
}

/** Public address of a client's logo in storage. */
export const clientLogoUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}` : null;

/**
 * A version of a shared link that can be shown inside the page (Google Docs,
 * Sheets, Slides and Drive files, Canva, Figma, Loom, YouTube). Null when the
 * site doesn't allow embedding; those just get an Open button.
 */
export function embedUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  let m: RegExpMatchArray | null;
  if (host === "docs.google.com" && (m = path.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/))) {
    return m[1] === "forms"
      ? `https://docs.google.com/forms/d/${m[2]}/viewform?embedded=true`
      : `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  }
  if (host === "drive.google.com" && (m = path.match(/^\/file\/d\/([\w-]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`;
  if (host === "canva.com" && (m = path.match(/^\/design\/([\w-]+)\/([\w-]+)?/))) return `https://www.canva.com/design/${m[1]}/${m[2] && m[2] !== "edit" ? `${m[2]}/` : ""}view?embed`;
  if (host === "figma.com" && /^\/(file|design|proto|board)\//.test(path)) return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(u.toString())}`;
  if (host === "loom.com" && (m = path.match(/^\/share\/([\w-]+)/))) return `https://www.loom.com/embed/${m[1]}`;
  if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
  if (host === "youtu.be" && path.length > 1) return `https://www.youtube.com/embed${path}`;
  return null;
}
