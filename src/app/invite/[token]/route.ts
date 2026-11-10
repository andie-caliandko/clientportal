import { NextResponse } from "next/server";
import { inviteProblem } from "@/lib/invites";
import { signInLink } from "@/lib/invites.server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * A portal invite link (good for a week). Each time it's opened it makes a fresh one-time
 * sign-in link and sends them on to create their password, so email scanners that open
 * links first don't use it up.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const site = new URL(req.url).origin;
  const to = (path: string) => NextResponse.redirect(new URL(path, site));
  if (!/^[\w-]{20,80}$/.test(token)) return to("/login?invite=invalid");
  const { data: row } = await createAdminClient()
    .from("client_users")
    .select("email, joined_at, invite_expires_at")
    .eq("invite_token", token)
    .maybeSingle();
  const problem = inviteProblem(row);
  if (problem) return to(`/login?invite=${problem}`);
  const link = await signInLink(row!.email);
  return link ? NextResponse.redirect(link) : to("/login?invite=invalid");
}
