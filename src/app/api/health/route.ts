import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Setup check: which settings are present and whether the database answers.
// Reports yes/no only, never the values.
export const dynamic = "force-dynamic";

export async function GET() {
  const env = (k: string) => !!process.env[k]?.trim();
  const slug = process.env.DEFAULT_AGENCY_SLUG?.trim() ?? "";
  let database = "not checked";
  let agencyFound = false;
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")) {
    const { data, error } = await createAdminClient().from("agencies").select("slug").eq("slug", slug).maybeSingle();
    database = error ? `error: ${error.message}` : "ok";
    agencyFound = !!data;
  }
  return NextResponse.json({
    settings: {
      NEXT_PUBLIC_SUPABASE_URL: env("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: env("SUPABASE_SERVICE_ROLE_KEY"),
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      DEFAULT_AGENCY_SLUG: slug || null,
      CRON_SECRET: env("CRON_SECRET"),
      ZAPIER_WEBHOOK_SECRET: env("ZAPIER_WEBHOOK_SECRET"),
      SLACK_BOT_TOKEN: env("SLACK_BOT_TOKEN"),
      SLACK_SIGNING_SECRET: env("SLACK_SIGNING_SECRET"),
      RESEND_API_KEY: env("RESEND_API_KEY"),
      GOOGLE_CLIENT_ID: env("GOOGLE_CLIENT_ID"),
    },
    database,
    agencyFound,
  });
}
