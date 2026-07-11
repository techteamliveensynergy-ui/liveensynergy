"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { updatePassword, type AuthState } from "../actions";

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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Field
        label="New password"
        htmlFor="password"
        required
        hint="At least 8 characters."
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="••••••••"
          minLength={8}
          required
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" required>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder="••••••••"
          minLength={8}
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
