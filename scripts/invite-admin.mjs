// One-time setup: invite the first admin for an agency.
// Usage: node --env-file=.env.local scripts/invite-admin.mjs <email> "<name>" "<title>" [agency-slug]
import { createClient } from "@supabase/supabase-js";

const [email, name, title = null, slug = process.env.DEFAULT_AGENCY_SLUG] = process.argv.slice(2);
if (!email || !name) {
  console.error('Usage: node --env-file=.env.local scripts/invite-admin.mjs <email> "<name>" "<title>" [agency-slug]');
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: agency, error: agencyErr } = await admin.from("agencies").select("id, name").eq("slug", slug).single();
if (agencyErr) throw new Error(`No agency with slug ${slug}`);

const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/set-password`,
  data: { display_name: name },
});
if (error) throw error;

const { error: memberErr } = await admin.from("agency_members").upsert({
  agency_id: agency.id,
  user_id: data.user.id,
  role: "admin",
  display_name: name,
  title,
  email: email.toLowerCase(),
});
if (memberErr) throw memberErr;
console.log(`Invited ${email} as an admin of ${agency.name}.`);
