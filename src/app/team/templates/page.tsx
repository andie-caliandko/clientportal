import Link from "next/link";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { embedUrl } from "@/lib/links";
import { FilePreview } from "@/app/portal/FilePreview";
import { ConfirmButton } from "../TeamForms";
import { deleteTemplate } from "../actions";
import { SopFolderForm, TemplateForm } from "./TemplateForm";

type Template = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  created_by: string | null;
  created_at: string;
  visible_to: string[] | null;
};

/** "Admins only", "Admins and account managers", or null when it's for everyone. */
const audienceLabel = (roles: string[] | null) => {
  const r = new Set(roles ?? ["admin", "account_manager", "creator"]);
  if (r.has("account_manager") && r.has("creator")) return null;
  if (r.has("account_manager")) return "Admins and account managers";
  if (r.has("creator")) return "Admins and creators";
  return "Admins only";
};

/** Google Docs, Sheets and Slides can be copied straight into your own Drive. */
const copyUrl = (url: string) => {
  const m = url.match(/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
  return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/copy` : null;
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const section = tab === "sops" ? "sops" : "templates";
  const { agency, member } = await requireTeam();
  const isAdmin = member.role === "admin";
  const supabase = await createClient();
  const [{ data }, { data: members }] = await Promise.all([
    supabase.from("agency_templates").select("*").eq("agency_id", agency.id).order("created_at", { ascending: false }),
    supabase.from("agency_members").select("user_id, display_name").eq("agency_id", agency.id),
  ]);
  // Templates and SOPs share one list; each tab shows its own.
  const templates = ((data ?? []) as (Template & { section?: string | null })[]).filter((t) => (t.section ?? "templates") === section);
  const names = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));
  const paths = templates.map((t) => t.file_path).filter(Boolean) as string[];
  const { data: signed } = paths.length
    ? await supabase.storage.from("templates").createSignedUrls(paths, 60 * 60)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const fileUrl = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const short = agency.brand.shortName ?? agency.name;

  const head = (
    <>
        <div className="top">
          <div>
            <p className="eyebrow">{short} · For the whole team</p>
            <h1 style={{ marginTop: 6 }}>{section === "sops" ? "SOPs" : "Agency templates"}</h1>
            <p className="note" style={{ maxWidth: "62ch" }}>
              {section === "sops"
                ? "How we do things. Everything lives in our Google Drive SOPs folder."
                : "The docs, decks and files we start from. Make a copy before you edit, so the template stays clean."}
            </p>
          </div>
          <nav className="view-switch" aria-label="Templates or SOPs">
            <Link href="/team/templates" aria-current={section === "templates" ? "page" : undefined} scroll={false}>Templates</Link>
            <Link href="/team/templates?tab=sops" aria-current={section === "sops" ? "page" : undefined} scroll={false}>SOPs</Link>
          </nav>
        </div>
    </>
  );

  // SOPs: the one Google Drive folder that holds all of them, shown big.
  if (section === "sops") {
    const folder = agency.sop_folder_url ?? null;
    const embed = folder ? embedUrl(folder) : null;
    return (
      <section style={{ display: "grid", gap: 20 }}>
        {head}
        {isAdmin && <SopFolderForm current={folder} />}
        {embed ? (
          <div className="panel" style={{ gap: 10 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <h2>All SOPs</h2>
              <a className="btn sm line" href={folder!} target="_blank" rel="noreferrer">Open in Google Drive</a>
            </div>
            <div className="sop-folder"><iframe src={embed} title="SOPs folder" loading="lazy" /></div>
            <p className="note">Click any file to open it in Google Drive. If you see a sign-in box, sign into your {short} Google account in this browser.</p>
          </div>
        ) : (
          <div className="panel"><p className="note">{isAdmin ? "Paste the link to your Google Drive SOPs folder above and everything in it shows here." : "Your admins haven't added the SOPs folder yet."}</p></div>
        )}
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 20 }}>
      {head}

      {isAdmin && <TemplateForm agencyId={agency.id} agencyName={short} />}

      {!templates.length && (
        <div className="panel"><p className="note">{isAdmin ? "No templates yet. Add the first one above." : "No templates yet. Your admins will add them here."}</p></div>
      )}

      <div className="templates">
        {templates.map((t) => {
          const embed = t.url ? embedUrl(t.url) : null;
          const copy = t.url ? copyUrl(t.url) : null;
          const file = t.file_path ? fileUrl.get(t.file_path) : null;
          return (
            <article key={t.id} className="panel template">
              <div>
                <h2>{t.title}</h2>
                {isAdmin && audienceLabel(t.visible_to) && <span className="pill info" style={{ marginTop: 6 }}>{audienceLabel(t.visible_to)}</span>}
                {t.description && <p className="note">{t.description}</p>}
              </div>
              {embed && (
                <div className={`template-embed ${embed.includes("embeddedfolderview") ? "folder" : ""}`}>
                  <iframe src={embed} title={t.title} loading="lazy" allow="fullscreen" allowFullScreen />
                </div>
              )}
              <div className="row" style={{ alignItems: "center" }}>
                {copy && <a className="btn sm" href={copy} target="_blank" rel="noreferrer">Make a copy</a>}
                {t.url && <a className={`btn sm ${copy ? "line" : ""}`} href={t.url} target="_blank" rel="noreferrer">Open</a>}
                {file && <FilePreview url={file} name={t.file_name ?? "Template file"} label={t.file_name ?? "Open file"} />}
              </div>
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span className="task-by">
                  Added by {t.created_by ? names.get(t.created_by) ?? "a former teammate" : short} ·{" "}
                  {new Date(t.created_at).toLocaleDateString("en-US", { timeZone: agency.timezone, month: "short", day: "numeric", year: "numeric" })}
                </span>
                {isAdmin && (
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton label="Delete" confirmLabel={`Delete "${t.title}"?`} />
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
