import { Logo } from "@/lib/brand";
import { getPublicAgency, getViewer } from "@/lib/session";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function SetPasswordPage() {
  const viewer = await getViewer();
  const agency = viewer?.agency ?? (await getPublicAgency());
  const name = viewer?.kind === "client" ? viewer.clientUser.display_name.split(" ")[0] : null;
  return (
    <main className="auth">
      <div className="auth-card">
        {agency && <Logo brand={agency.brand} name={agency.name} height={88} />}
        <h1>{name ? `Welcome, ${name}!` : "Choose a password"}</h1>
        <SetPasswordForm />
      </div>
    </main>
  );
}
