import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "./supabase/server";
import type { Agency, Client, ClientUser, Member } from "./types";

export type Viewer =
  | { kind: "team"; userId: string; agency: Agency; member: Member }
  | { kind: "client"; userId: string; agency: Agency; client: Client; clientUser: ClientUser };

/** Who is signed in, and which agency and client they belong to. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("agency_members")
    .select("*, agency:agencies(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (member) {
    const { agency, ...rest } = member;
    return { kind: "team", userId: user.id, agency, member: rest as Member };
  }

  const { data: cu } = await supabase
    .from("client_users")
    .select("*, client:clients(*, agency:agencies(*))")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (cu) {
    const { client, ...rest } = cu;
    const { agency, ...clientRest } = client;
    return { kind: "client", userId: user.id, agency, client: clientRest as Client, clientUser: rest as ClientUser };
  }
  return null;
});

export async function requireTeam() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.kind !== "team") redirect("/portal");
  return v;
}

/** Admins and account managers can make changes; creators are view only. */
export async function requireEditor() {
  const v = await requireTeam();
  if (v.member.role === "creator") throw new Error("Creators have view-only access.");
  return v;
}

export async function requireAdmin() {
  const v = await requireTeam();
  if (v.member.role !== "admin") throw new Error("Only admins can do that.");
  return v;
}

export async function requireClient() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.kind !== "client") redirect("/team");
  return v;
}

/**
 * Agency branding for pages shown before sign-in, picked by web address
 * (an agency's own portal domain) with a default for everything else.
 */
export const getPublicAgency = cache(async (): Promise<Pick<Agency, "name" | "brand" | "slug"> | null> => {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const admin = createAdminClient();
  const { data: byDomain } = await admin
    .from("agencies")
    .select("name, brand, slug")
    .eq("portal_domain", host)
    .maybeSingle();
  if (byDomain) return byDomain;
  const { data } = await admin
    .from("agencies")
    .select("name, brand, slug")
    .eq("slug", process.env.DEFAULT_AGENCY_SLUG ?? "")
    .maybeSingle();
  return data;
});

/** A client's name for their personal sign-in link (/login?client=<slug>). */
export async function publicClientName(agencySlug: string, clientSlug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(clientSlug)) return null;
  const { data } = await createAdminClient()
    .from("clients")
    .select("name, agency:agencies!inner(slug)")
    .eq("slug", clientSlug)
    .eq("agency.slug", agencySlug)
    .maybeSingle();
  return data?.name ?? null;
}
