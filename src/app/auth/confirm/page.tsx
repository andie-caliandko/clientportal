"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { markJoined } from "../../login/actions";

// Invitation and password-reset links land here. We sign the person in from
// the link, then (for invites and resets) let them choose a password on this
// same page, so nothing depends on a second page load.
export default function ConfirmPage() {
  const [stage, setStage] = useState<"checking" | "password" | "failed">("checking");
  const [next, setNext] = useState("/");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const target = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/";
    const hash = new URLSearchParams(url.hash.slice(1));
    const supabase = createClient();

    (async () => {
      let failed: unknown = null;
      if (hash.get("access_token") && hash.get("refresh_token")) {
        ({ error: failed } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        }));
      } else if (url.searchParams.get("code")) {
        // Password resets requested from the sign-in page use a one-time code.
        ({ error: failed } = await supabase.auth.exchangeCodeForSession(url.searchParams.get("code")!));
      } else if (url.searchParams.get("token_hash") && url.searchParams.get("type")) {
        ({ error: failed } = await supabase.auth.verifyOtp({
          token_hash: url.searchParams.get("token_hash")!,
          type: url.searchParams.get("type") as EmailOtpType,
        }));
      } else {
        failed = hash.get("error_description") ?? "missing token";
      }
      if (failed) return setStage("failed");
      // Clean the one-time token out of the address bar.
      window.history.replaceState(null, "", "/auth/confirm");
      if (target === "/set-password") {
        setNext("/");
        setStage("password");
      } else {
        window.location.replace(target);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setSaving(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (err) {
      const code = (err as { code?: string }).code;
      if (code === "same_password") return setError("That's the password you already have. Choose a new one.");
      if (code === "weak_password") return setError(`That password is too easy to guess. ${err.message}`);
      if (/session/i.test(err.message)) return setError("Your sign-in link wore off before saving. Ask for a new link and try again.");
      return setError(`We couldn't save that password: ${err.message}`);
    }
    // First time here? Tells the team they joined.
    await markJoined().catch(() => {});
    window.location.replace(next);
  }

  return (
    <main className="auth">
      <div className="auth-card">
        {stage === "checking" && <p className="note">Signing you in…</p>}
        {stage === "failed" && (
          <div className="auth-box">
            <p><b>That link has expired or was already used.</b></p>
            <p className="note">
              Links from invite and reset emails work once, for a limited time. Ask your team to resend the invite, or
              reset your password from the sign-in page.
            </p>
            <a className="btn" href="/login">Go to sign in</a>
          </div>
        )}
        {stage === "password" && (
          <form className="auth-box" onSubmit={save}>
            <h1 style={{ fontSize: "2rem" }}>Choose a password</h1>
            <p>You&apos;ll use it with your email each time you sign in.</p>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input className="input" id="new-password" type="password" autoComplete="new-password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }} autoFocus required />
            </div>
            <p className={error ? "error" : "note"} style={!error && password.length >= 8 ? { color: "var(--ok)" } : undefined}>
              {error ?? (password.length >= 8 ? "Looks good." : "Use at least 8 characters.")}
            </p>
            <button className="btn lg" disabled={saving}>{saving ? "Saving…" : "Save password and open my portal"}</button>
            <p className="note">Tip: let your phone or browser save it for you.</p>
          </form>
        )}
      </div>
    </main>
  );
}
