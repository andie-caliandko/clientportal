import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, googleConfigured } from "@/lib/google";
import { getViewer } from "@/lib/session";

// "Connect Google" in Agency settings (admins, ?for=agency) or "Connect my
// Google Calendar" on Calendar (any teammate, ?for=me).
export async function GET(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get("for") === "me" ? "member" : "agency";
  const back = new URL(purpose === "member" ? "/team/calendar" : "/team/settings", request.url);
  const v = await getViewer();
  if (!v || v.kind !== "team" || (purpose === "agency" && v.member.role !== "admin")) return NextResponse.redirect(back);
  if (!googleConfigured()) {
    back.searchParams.set("google", "not-configured");
    return NextResponse.redirect(back);
  }

  const state = `${purpose}.${crypto.randomBytes(24).toString("hex")}`;
  const res = NextResponse.redirect(googleAuthUrl(state, purpose));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
