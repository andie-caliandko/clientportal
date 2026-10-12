import "server-only";
import crypto from "node:crypto";

/** Posts a client's portal message into their Slack channel. No-op until Slack is connected. */
export async function postToSlack(channel: string | null, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !channel) return null;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Slack post failed", data.error);
  return data.ok ? (data.ts as string) : null;
}

/** Confirms a request really came from Slack (https://api.slack.com/authentication/verifying-requests-from-slack). */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Display name for a Slack user, for showing team replies in the portal. */
export async function slackUserName(userId: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return "Your team";
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const p = data.user?.profile;
  return (p?.display_name || p?.real_name || "Your team") as string;
}

/**
 * A channel's name and whether the portal app is in it. Null if Slack can't say
 * (the app needs the channels:read and groups:read permissions for this).
 */
export async function slackChannelInfo(channelId: string): Promise<{ name: string; isMember: boolean } | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channelId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 600 },
    });
    const data = await res.json();
    return data.ok ? { name: data.channel.name as string, isMember: !!data.channel.is_member } : null;
  } catch {
    return null;
  }
}

let botUser: string | null | undefined;
/** The portal app's own Slack user, so we can ignore messages and files we posted ourselves. */
export async function slackBotUserId() {
  if (botUser !== undefined) return botUser;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return (botUser = null);
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return (botUser = data.ok ? (data.user_id as string) : null);
}

/**
 * Shares a file from portal storage into a Slack channel (Slack's current
 * upload flow: get an upload URL, send the bytes, then complete the upload).
 * Needs the files:write scope.
 */
export async function uploadFileToSlack(channel: string | null, name: string, sourceUrl: string, comment?: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !channel) return false;
  const source = await fetch(sourceUrl);
  if (!source.ok) return false;
  const bytes = new Uint8Array(await source.arrayBuffer());
  const start = await fetch("https://slack.com/api/files.getUploadURLExternal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ filename: name, length: String(bytes.byteLength) }),
  }).then((r) => r.json());
  if (!start.ok) {
    console.error("Slack upload URL failed", start.error);
    return false;
  }
  const put = await fetch(start.upload_url, { method: "POST", body: bytes });
  if (!put.ok) return false;
  const done = await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ files: [{ id: start.file_id, title: name }], channel_id: channel, ...(comment ? { initial_comment: comment } : {}) }),
  }).then((r) => r.json());
  if (!done.ok) console.error("Slack upload failed", done.error);
  return !!done.ok;
}

/** Downloads a file someone shared in Slack. Needs the files:read scope. */
export async function downloadSlackFile(url: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return { data: await res.arrayBuffer(), type: res.headers.get("content-type") ?? "application/octet-stream" };
}

/** Full details for a shared file when Slack's event only includes its id. Needs files:read. */
export async function slackFileInfo(fileId: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  const data = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (!data.ok) {
    console.error("Slack files.info failed", data.error);
    return null;
  }
  return data.file as { name?: string; title?: string; mimetype?: string; size?: number; url_private_download?: string; url_private?: string };
}
