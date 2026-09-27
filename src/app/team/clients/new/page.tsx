import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewClientForm } from "../../TeamForms";

export default async function NewClientPage() {
  const { agency, member } = await requireTeam();
  if (member.role !== "admin") redirect("/team/clients");
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("agency_members")
    .select("user_id, display_name, role")
    .eq("agency_id", agency.id)
    .order("display_name");
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <Link href="/team/clients" className="note">← All clients</Link>
      <h1 style={{ fontSize: "2.5rem" }}>Add a client</h1>
      <NewClientForm members={members ?? []} />
    </section>
  );
}
