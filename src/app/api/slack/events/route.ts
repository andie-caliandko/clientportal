import { after, NextResponse, type NextRequest } from "next/server";
import { syncUploadsToDrive } from "@/lib/drive";
import { emailClient } from "@/lib/notify";
import { notifyClient } from "@/lib/notifications";
import { downloadSlackFile, slackBotUserId, slackUserName, verifySlackSignature } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";

type SlackFile = { name?: string; title?: string; mimetype?: string; size?: number; url_private_download?: string };
type SlackEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  files?: SlackFile[];
};

const MAX_FILE = 50 * 1024 * 1024;

// Slack Events API: when a teammate posts (or shares a file) in a client's
// channel, it shows up in that client's portal and the client is told.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const payload = JSON.parse(raw);
  if (payload.type === "url_verification") return NextResponse.json({ challenge: payload.challenge });

  const event: SlackEvent | undefined = payload.event;
  // Plain messages and file shares only; skip edits, joins, and anything from bots.
  if (!event || event.type !== "message" || (event.subtype && event.subtype !== "file_share") || event.bot_id) {
    return NextResponse.json({ ok: true });
  }
  if (!event.channel || !event.ts || (!event.text && !event.files?.length)) return NextResponse.json({ ok: true });

  // Answer Slack right away (it retries after 3 seconds), then do the work.
  after(() => handle(event));
  return NextResponse.json({ ok: true });
}

async function handle(event: SlackEvent) {
  // Ignore what the portal itself posted into the channel.
  if (event.user && event.user === (await slackBotUserId())) return;

  const admin = createAdminClient();
  // One channel should belong to one client; if it's shared, use the newest active one.
  const { data: client } = await admin
    .from("clients")
    .select("id, agency_id")
    .eq("slack_channel_id", event.channel!)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!client) return;

  // Slack retries deliveries; skip messages we've already saved.
  const { data: seen } = await admin.from("messages").select("id").eq("slack_ts", event.ts!).maybeSingle();
  if (seen) return;

  const attachments: Attachment[] = [];
  for (const f of (event.files ?? []).slice(0, 10)) {
    if (!f.url_private_download || (f.size ?? 0) > MAX_FILE) continue;
    const file = await downloadSlackFile(f.url_private_download);
    if (!file) continue;
    const name = f.name ?? f.title ?? "file";
    const path = `${client.agency_id}/${client.id}/messages/${Date.now()}-${name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await admin.storage.from("uploads").upload(path, file.data, { contentType: f.mimetype ?? file.type });
    if (!error) attachments.push({ name, path, size: f.size, type: f.mimetype });
  }
  if (!event.text && !attachments.length) return;

  const name = event.user ? await slackUserName(event.user) : "Your team";
  const { data: inserted } = await admin
    .from("messages")
    .upsert(
      {
        agency_id: client.agency_id,
        client_id: client.id,
        author_name: name,
        author_kind: "team",
        body: event.text ?? "",
        attachments,
        source: "slack",
        slack_ts: event.ts,
      },
      { onConflict: "slack_ts", ignoreDuplicates: true },
    )
    .select("id");
  if (!inserted?.length) return;

  if (attachments.length) {
    const { data: rows } = await admin
      .from("uploads")
      .insert(attachments.map((a) => ({ agency_id: client.agency_id, client_id: client.id, kind: "message", file_name: a.name, storage_path: a.path })))
      .select("id");
    if (rows?.length) await syncUploadsToDrive({ uploadIds: rows.map((r) => r.id) });
  }

  const summary = event.text || `${name.split(" ")[0]} sent ${attachments.map((a) => a.name).join(", ")}`;
  await emailClient(client.id, `New message from ${name}`, summary);
  await notifyClient(client.id, { kind: "message", title: `New message from ${name.split(" ")[0]}`, body: summary.slice(0, 160), link: "/portal/messages" });
}
