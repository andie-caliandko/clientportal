import { requireClient } from "@/lib/session";
import { PortalView } from "./PortalView";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ doc?: string; tab?: string; done?: string }> }) {
  const { agency, client, clientUser, userId } = await requireClient();
  return (
    <PortalView agency={agency} client={client} userId={userId} firstName={clientUser.display_name.split(" ")[0]}
      params={await searchParams} basePath="/portal" />
  );
}
