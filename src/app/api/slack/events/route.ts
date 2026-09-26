import { NextResponse, type NextRequest } from "next/server";
import { emailClient } from "@/lib/notify";
import { slackUserName, verifySlackSignature } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/server";

type SlackEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

// Slack Events API: when a teammate posts in a client's channel, the message
// shows up in that client's portal and the client gets an email.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const payload = JSON.parse(raw);
  if (payload.type === "url_verification") return NextResponse.json({ challenge: payload.challenge });

  const event: SlackEvent | undefined = payload.event;
  // Skip our own posts (client messages we mirrored), edits, joins and other system messages.
  if (!event || event.type !== "message" || event.subtype || event.bot_id || !event.text || !event.channel || !event.ts) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, agency_id")
    .eq("slack_channel_id", event.channel)
    .maybeSingle();
  if (!client) return NextResponse.json({ ok: true });

  const name = event.user ? await slackUserName(event.user) : "Your team";
  const { data: inserted } = await admin
    .from("messages")
    .upsert(
      {
        agency_id: client.agency_id,
        client_id: client.id,
        author_name: name,
        author_kind: "team",
        body: event.text,
        source: "slack",
        slack_ts: event.ts,
      },
      { onConflict: "slack_ts", ignoreDuplicates: true },
    )
    .select("id");

  // Slack retries deliveries; only email the first time we see a message.
  if (inserted?.length) await emailClient(client.id, `New message from ${name}`, event.text);
  return NextResponse.json({ ok: true });
}
