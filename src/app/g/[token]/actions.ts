"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSharedShoot, recordView, VIEWER_COOKIE } from "@/lib/galleryViewers";

/** Someone opening a shared gallery gives their email first; the team sees who's looked. */
export async function enterGallery(token: string, _prev: { error?: string } | null, form: FormData): Promise<{ error?: string } | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid email address." };
  const shoot = await findSharedShoot<{ id: string; client_id: string }>(token, "id, client_id");
  if (!shoot) return { error: "This gallery isn't available anymore." };
  await recordView(shoot, email, true);
  // Remembered on this device for this link only, so they aren't asked every visit.
  (await cookies()).set(VIEWER_COOKIE, email, { path: `/g/${token}`, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  redirect(`/g/${token}`);
}
