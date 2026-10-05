import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireClient, requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";
import type { PortalCtx } from "./sections";

export type PortalBase = Omit<PortalCtx, "params">;

/** The signed-in client's portal. Cached so the layout and page share it. */
export const clientPortal = cache(async (): Promise<PortalBase> => {
  const { agency, client, clientUser, userId } = await requireClient();
  return { agency, client, userId, firstName: clientUser.display_name.trim(), preview: false, base: "/portal" };
});

/** "View their portal": the team sees a client's portal exactly as the client does. */
export const previewPortal = cache(async (id: string): Promise<PortalBase> => {
  const { agency } = await requireTeam();
  const supabase = await createClient();
  const [{ data: client }, { data: owner }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("client_users")
      .select("user_id, display_name")
      .eq("client_id", id)
      .order("role", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!client) notFound();
  return {
    agency, client: client as Client, userId: owner?.user_id ?? null,
    firstName: owner?.display_name.trim() ?? "there",
    preview: true, base: `/preview/${id}`,
  };
});
