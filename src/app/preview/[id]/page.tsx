import { notFound } from "next/navigation";
import { PortalView } from "@/app/portal/PortalView";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

// "View their portal": the team sees the client's portal exactly as the client does.
export default async function PreviewPortal({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; tab?: string }>;
}) {
  const { id } = await params;
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
  return (
    <PortalView agency={agency} client={client as Client} userId={owner?.user_id ?? null}
      firstName={owner?.display_name.split(" ")[0] ?? "there"} params={await searchParams}
      basePath={`/preview/${id}`} preview />
  );
}
