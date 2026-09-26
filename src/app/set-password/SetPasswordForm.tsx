"use client";

import { useActionState, useState } from "react";
import { setPassword, type FormState } from "../login/actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  const [value, setValue] = useState("");
  const ok = value.length >= 8;
  return (
    <form className="auth-box" action={action}>
      <p>Create a password for your portal. You&apos;ll use it with your email each time you sign in.</p>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>
      <p className="note" style={ok ? { color: "var(--ok)" } : undefined}>
        {ok ? "Looks good." : "Use at least 8 characters."}
      </p>
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn lg" disabled={pending}>
        {pending ? "Saving…" : "Save password and open my portal"}
      </button>
      <p className="note">Tip: let your phone or browser save it for you.</p>
    </form>
  );
}
