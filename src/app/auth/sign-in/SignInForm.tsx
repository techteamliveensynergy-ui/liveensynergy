"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { signIn, type AuthState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Field label="Email" htmlFor="email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="input"
          placeholder="you@example.com"
          required
        />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input"
          placeholder="••••••••"
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
