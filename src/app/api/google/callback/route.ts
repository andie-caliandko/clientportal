import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/google";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";

// Google sends the admin back here after they approve access.
export async function GET(request: NextRequest) {
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/team/settings?google=${status}`, request.url));
    res.cookies.delete("google_oauth_state");
    return res;
  };
  const v = await getViewer();
  if (!v || v.kind !== "team" || v.member.role !== "admin") return done("denied");

  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  if (!state || state !== request.cookies.get("google_oauth_state")?.value) return done("expired");
  const code = searchParams.get("code");
  if (!code) return done("cancelled");

  try {
    const { refreshToken, email } = await exchangeCode(code);
    if (!refreshToken) return done("failed");
    await createAdminClient()
      .from("agency_integrations")
      .upsert({ agency_id: v.agency.id, google_refresh_token: refreshToken, google_email: email, updated_at: new Date().toISOString() });
    return done("connected");
  } catch {
    return done("failed");
  }
}
