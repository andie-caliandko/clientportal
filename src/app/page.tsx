import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?closed=1");
  redirect(viewer.kind === "team" ? "/team" : "/portal");
}
