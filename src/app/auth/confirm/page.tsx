"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

// Invitation and password-reset emails land here. Supabase's default emails put
// the sign-in tokens after "#" in the link, which only the browser can read.
export default function ConfirmPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/";
    const hash = new URLSearchParams(url.hash.slice(1));
    const supabase = createClient();

    (async () => {
      let error: unknown = null;
      if (hash.get("access_token") && hash.get("refresh_token")) {
        ({ error } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        }));
      } else if (url.searchParams.get("code")) {
        // Password resets requested from the sign-in page use a one-time code.
        ({ error } = await supabase.auth.exchangeCodeForSession(url.searchParams.get("code")!));
      } else if (url.searchParams.get("token_hash") && url.searchParams.get("type")) {
        ({ error } = await supabase.auth.verifyOtp({
          token_hash: url.searchParams.get("token_hash")!,
          type: url.searchParams.get("type") as EmailOtpType,
        }));
      } else {
        error = hash.get("error_description") ?? "missing token";
      }
      if (error) setFailed(true);
      else window.location.replace(next);
    })();
  }, []);

  return (
    <main className="auth">
      <div className="auth-card">
        {failed ? (
          <div className="auth-box">
            <p><b>That link has expired or was already used.</b></p>
            <p className="note">Links from invite and reset emails work once, for a limited time. Ask your team to resend the invite, or reset your password from the sign-in page.</p>
            <a className="btn" href="/login">Go to sign in</a>
          </div>
        ) : (
          <p className="note">Signing you in…</p>
        )}
      </div>
    </main>
  );
}
