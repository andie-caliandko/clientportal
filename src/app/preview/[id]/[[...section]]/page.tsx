import { notFound } from "next/navigation";
import { PortalShell } from "@/app/portal/Shell";
import { renderSection } from "@/app/portal/render";
import { SECTIONS, type Section } from "@/app/portal/sections";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

// "View their portal": the team sees a client's portal exactly as the client does.
export default async function PreviewPortal({ params, searchParams }: {
  params: Promise<{ id: string; section?: string[] }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id, section = [] } = await params;
  const name = (section[0] ?? "home") as Section;
  if (section.length > 1 || !SECTIONS.includes(name)) notFound();
  const { agency } = await requireTeam();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const { data: owner } = await supabase
    .from("client_users")
    .select("user_id, display_name")
    .eq("client_id", id)
    .order("role", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctx = {
    agency, client: client as Client, userId: owner?.user_id ?? null,
    firstName: owner?.display_name.split(" ")[0] ?? "there",
    preview: true, base: `/preview/${id}`, params: await searchParams,
  };
  return <PortalShell ctx={ctx} section={name}>{await renderSection(name, ctx)}</PortalShell>;
}
