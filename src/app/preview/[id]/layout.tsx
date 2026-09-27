import { PortalShell } from "@/app/portal/Shell";
import { previewPortal } from "@/app/portal/context";

export default async function PreviewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalShell ctx={await previewPortal(id)}>{children}</PortalShell>;
}
