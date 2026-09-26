import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  redirect(viewer.kind === "team" ? "/team" : "/portal");
}
