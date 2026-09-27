import { notFound } from "next/navigation";
import { requireClient } from "@/lib/session";
import { PortalShell } from "../Shell";
import { renderSection } from "../render";
import { SECTIONS, type Section } from "../sections";

export default async function PortalPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ doc?: string; done?: string }>;
}) {
  const { section = [] } = await params;
  const name = (section[0] ?? "home") as Section;
  if (section.length > 1 || !SECTIONS.includes(name)) notFound();
  const { agency, client, clientUser, userId } = await requireClient();
  const ctx = {
    agency, client, userId, firstName: clientUser.display_name.split(" ")[0],
    preview: false, base: "/portal", params: await searchParams,
  };
  return <PortalShell ctx={ctx} section={name}>{await renderSection(name, ctx)}</PortalShell>;
}
