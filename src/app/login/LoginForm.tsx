"use client";

import { useActionState, useState } from "react";
import { sendReset, signIn, type FormState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [signInState, signInAction, signingIn] = useActionState<FormState, FormData>(signIn, {});
  const [resetState, resetAction, resetting] = useActionState<FormState, FormData>(sendReset, {});
  const [show, setShow] = useState(false);

  if (mode === "reset") {
    return (
      <form className="auth-box" action={resetAction}>
        {resetState.sent ? (
          <p>
            If that email has a portal, a link to reset your password is on its way. It can take a minute or two to
            arrive.
          </p>
        ) : (
          <>
            <p>Type your email and we&apos;ll send you a link to choose a new password.</p>
            <div className="field">
              <label htmlFor="reset-email">Email</label>
              <input className="input" id="reset-email" name="email" type="email" autoComplete="username" required />
            </div>
            {resetState.error && <p className="error">{resetState.error}</p>}
            <button className="btn lg" disabled={resetting}>
              {resetting ? "Sending…" : "Email me a reset link"}
            </button>
          </>
        )}
        <button type="button" className="linkbtn" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form className="auth-box" action={signInAction}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button type="button" className="btn line sm" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {signInState.error && <p className="error">{signInState.error}</p>}
      <button className="btn lg" disabled={signingIn}>
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
      <p className="note">
        <button type="button" className="linkbtn" onClick={() => setMode("reset")}>
          Forgot your password?
        </button>{" "}
        First time here? Use the link in your invitation email.
      </p>
    </form>
  );
}
