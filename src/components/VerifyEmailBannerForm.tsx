"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resendVerification, type AuthState } from "@/app/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-dark text-sm" disabled={pending}>
      {pending ? "Sending…" : "Send it again"}
    </button>
  );
}

export function VerifyEmailBannerForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(resendVerification, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Submit />
      {state.message && <span className="text-sm font-medium">{state.message}</span>}
      {state.error && <span className="text-sm font-medium text-[var(--color-accent)]">{state.error}</span>}
    </form>
  );
}
