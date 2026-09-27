import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { exchangeCode } from "@/lib/google";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";

// Google sends people back here after they approve access.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const purpose = state?.startsWith("member.") ? "member" : "agency";
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`${purpose === "member" ? "/team/calendar" : "/team/settings"}?google=${status}`, request.url));
    res.cookies.delete("google_oauth_state");
    return res;
  };
  const v = await getViewer();
  if (!v || v.kind !== "team" || (purpose === "agency" && v.member.role !== "admin")) return done("denied");
  if (!state || state !== request.cookies.get("google_oauth_state")?.value) return done("expired");
  const code = searchParams.get("code");
  if (!code) return done("cancelled");

  try {
    const { refreshToken, email } = await exchangeCode(code);
    if (!refreshToken) return done("failed");
    const admin = createAdminClient();
    const now = new Date().toISOString();
    if (purpose === "agency") {
      await admin
        .from("agency_integrations")
        .upsert({ agency_id: v.agency.id, google_refresh_token: refreshToken, google_email: email, updated_at: now });
    }
    // Either way, this is also the person's own calendar connection.
    await admin
      .from("member_google")
      .upsert({ user_id: v.userId, agency_id: v.agency.id, refresh_token: refreshToken, google_email: email, connected_at: now });
    revalidateTag(`meetings-${v.agency.id}`);
    return done("connected");
  } catch {
    return done("failed");
  }
}
