import { PortalShell } from "../Shell";
import { clientPortal } from "../context";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell ctx={await clientPortal()}>{children}</PortalShell>;
}
