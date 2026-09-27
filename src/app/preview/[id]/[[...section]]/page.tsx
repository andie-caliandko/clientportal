import { notFound } from "next/navigation";
import { previewPortal } from "@/app/portal/context";
import { renderSection } from "@/app/portal/render";
import { SECTIONS, type Section } from "@/app/portal/sections";

// "View their portal": the team sees a client's portal exactly as the client does.
export default async function PreviewPortal({ params, searchParams }: {
  params: Promise<{ id: string; section?: string[] }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id, section = [] } = await params;
  const name = (section[0] ?? "home") as Section;
  if (section.length > 1 || !SECTIONS.includes(name)) notFound();
  const ctx = { ...(await previewPortal(id)), params: await searchParams };
  return renderSection(name, ctx);
}
