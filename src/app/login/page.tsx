import { redirect } from "next/navigation";
import { Logo } from "@/lib/brand";
import { getPublicAgency, getSignedInWithoutAccess, getViewer, publicClientName } from "@/lib/session";
import { signOut } from "./actions";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ client?: string; invite?: string }> }) {
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
  const sp = await searchParams;
  const slug = sp.client;
  const short = agency?.brand.shortName ?? agency?.name ?? "your team";
  // Where an invite link that can't be used sends them.
  const inviteNote = sp.invite === "expired" ? `This invite link has expired. Invites work for a week. Email your ${short} team and they'll send you a new one.`
    : sp.invite === "joined" ? "You've already created your password. Sign in below, or use Forgot password if you need a new one."
    : sp.invite === "invalid" ? `That invite link isn't valid. Use the newest invite email, or ask your ${short} team to send a new one.`
    : null;
  const clientName = slug && agency ? await publicClientName(agency.slug, slug) : null;
  return (
    <main className="auth">
      <div className="auth-card">
        {agency && <Logo brand={agency.brand} name={agency.name} height={88} />}
        <div>
          {clientName && <p className="eyebrow">{clientName}</p>}
          <h1 style={{ marginTop: clientName ? 8 : 0 }}>Welcome to your portal</h1>
        </div>
        {inviteNote && <p className={sp.invite === "joined" ? "note" : "readonly"} role="status">{inviteNote}</p>}
        <LoginForm />
      </div>
    </main>
  );
}
