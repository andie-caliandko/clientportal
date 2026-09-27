import { redirect } from "next/navigation";
import { Logo } from "@/lib/brand";
import { getPublicAgency, getViewer, publicClientName } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  if (await getViewer()) redirect("/");
  const agency = await getPublicAgency();
  const slug = (await searchParams).client;
  const clientName = slug && agency ? await publicClientName(agency.slug, slug) : null;
  return (
    <main className="auth">
      <div className="auth-card">
        {agency && <Logo brand={agency.brand} name={agency.name} height={88} />}
        <div>
          {clientName && <p className="eyebrow">{clientName}</p>}
          <h1 style={{ marginTop: clientName ? 8 : 0 }}>Welcome to your portal</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
