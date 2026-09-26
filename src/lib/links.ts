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
