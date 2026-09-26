import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { googleAuthUrl, googleConfigured } from "@/lib/google";
import { getViewer } from "@/lib/session";

// Admin clicks "Connect Google" in Agency settings.
export async function GET(request: Request) {
  const v = await getViewer();
  const back = new URL("/team/settings", request.url);
  if (!v || v.kind !== "team" || v.member.role !== "admin") return NextResponse.redirect(back);
  if (!googleConfigured()) return NextResponse.redirect(new URL("/team/settings?google=not-configured", request.url));

  const state = crypto.randomBytes(24).toString("hex");
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
