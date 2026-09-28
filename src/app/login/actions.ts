"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { notifyUser } from "@/lib/notifications";

export type FormState = { error?: string; sent?: boolean };

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "That email and password don't match. Check for typos, or reset your password below." };
  redirect("/");
}

export async function sendReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Type your email first." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`,
  });
  // Same answer whether or not the email exists, so nobody can probe for accounts.
  return { sent: true };
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That's the password you already have. Choose a new one." };
    return { error: `We couldn't save that password: ${error.message}` };
  }
  await markJoined();
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Called once someone sets their password. The first time, it tells the team:
 * a client joining tells their account manager and the admins; a teammate
 * joining tells the admins.
 */
export async function markJoined() {
  const v = await getViewer();
  if (!v) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: admins } = await admin.from("agency_members").select("user_id").eq("agency_id", v.agency.id).eq("role", "admin");
  const adminIds = (admins ?? []).map((a) => a.user_id);

  if (v.kind === "client") {
    const { data: first } = await admin.from("client_users").update({ joined_at: now })
      .eq("user_id", v.userId).eq("client_id", v.client.id).is("joined_at", null).select("display_name").maybeSingle();
    if (!first) return;
    const to = [...new Set([v.client.account_manager_id, ...adminIds].filter(Boolean))] as string[];
    for (const id of to) {
      await notifyUser(v.agency.id, v.client.id, id, {
        kind: "task", title: `${first.display_name} joined ${v.client.name}'s portal`, body: null, link: `/team/clients/${v.client.id}`,
      });
    }
  } else {
    const { data: first } = await admin.from("agency_members").update({ joined_at: now })
      .eq("user_id", v.userId).eq("agency_id", v.agency.id).is("joined_at", null).select("display_name").maybeSingle();
    if (!first) return;
    for (const id of adminIds.filter((a) => a !== v.userId)) {
      await notifyUser(v.agency.id, null, id, { kind: "task", title: `${first.display_name} joined the team`, body: null, link: "/team/team" });
    }
  }
}
