"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { updatePassword, type AuthState } from "../actions";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "@/lib/password";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Updating…" : "Update password"}
    </button>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    updatePassword,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      <Field
        label="New password"
        htmlFor="password"
        required
        hint={PASSWORD_HINT}
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" required>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
