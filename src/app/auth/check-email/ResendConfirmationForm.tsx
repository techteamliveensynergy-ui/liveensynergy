"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resendConfirmation, type AuthState } from "../actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost w-full" disabled={pending}>
      {pending ? "Sending…" : label}
    </button>
  );
}

/** "Send the confirmation email again" — used on the check-email screen and
 *  on sign-in when the address isn't confirmed yet. */
export function ResendConfirmationForm({
  email,
  label = "Resend confirmation email",
}: {
  email: string;
  label?: string;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(resendConfirmation, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      {state.message && (
        <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]" role="status">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]" role="alert">
          {state.error}
        </p>
      )}
      <Submit label={label} />
    </form>
  );
}
