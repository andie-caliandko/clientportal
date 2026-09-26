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
