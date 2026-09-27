import { notFound } from "next/navigation";
import { clientPortal } from "../../context";
import { renderSection } from "../../render";
import { SECTIONS, type Section } from "../../sections";

export default async function PortalPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ doc?: string; done?: string }>;
}) {
  const { section = [] } = await params;
  const name = (section[0] ?? "home") as Section;
  if (section.length > 1 || !SECTIONS.includes(name)) notFound();
  const ctx = { ...(await clientPortal()), params: await searchParams };
  return renderSection(name, ctx);
}
