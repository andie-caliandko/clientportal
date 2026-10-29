"use client";

import { useActionState } from "react";
import { enterGallery } from "./actions";

/** Asks for an email before the gallery opens. */
export function EmailGate({ token }: { token: string }) {
  const [state, action, pending] = useActionState(enterGallery.bind(null, token), null);
  return (
    <form action={action} className="auth-box">
      <div className="field">
        <label htmlFor="gallery-email">Your email</label>
        <input id="gallery-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Opening…" : "View gallery"}</button>
    </form>
  );
}
