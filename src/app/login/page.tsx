import { redirect } from "next/navigation";
import { Logo } from "@/lib/brand";
import { getPublicAgency, getSignedInWithoutAccess, getViewer, publicClientName } from "@/lib/session";
import { signOut } from "./actions";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  if (await getViewer()) redirect("/");
  // Signed in but nothing to open: their portal was closed (client archived).
  if (await getSignedInWithoutAccess()) {
    const a = await getPublicAgency();
    return (
      <main className="auth">
        <div className="auth-card">
          {a && <Logo brand={a.brand} name={a.name} height={88} />}
          <div className="auth-box">
            <p><b>This portal is closed.</b></p>
            <p className="note">Your time working with {a?.name ?? "us"} has wrapped up, so this portal is no longer active. If you think this is a mistake, or you&apos;d like a copy of anything, reach out to your {a?.brand.shortName ?? a?.name ?? ""} team by email.</p>
            <form action={signOut}><button className="btn line">Sign out</button></form>
          </div>
        </div>
      </main>
    );
  }
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
