import { redirect } from "next/navigation";
import { Logo } from "@/lib/brand";
import { getPublicAgency, getViewer } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getViewer()) redirect("/");
  const agency = await getPublicAgency();
  return (
    <main className="auth">
      <div className="auth-card">
        {agency && <Logo brand={agency.brand} name={agency.name} height={88} />}
        <h1>Welcome to your portal</h1>
        <LoginForm />
      </div>
    </main>
  );
}
