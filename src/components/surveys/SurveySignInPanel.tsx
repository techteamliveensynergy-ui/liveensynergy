"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signIn, type AuthState } from "@/app/auth/actions";
import { emailSurveySignInLink, type SignInLinkState } from "@/app/survey/[templateId]/actions";

function PendingButton({ label, pending, className }: { label: string; pending: string; className: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={isPending}>
      {isPending ? pending : label}
    </button>
  );
}

/**
 * Sign in without leaving the survey (client note, 4 Nov: "let them register or
 * login first, then continue"). Posts to the ordinary signIn() action with the
 * survey as the destination, so the page reloads signed in — verified accounts
 * go on to the questions, unverified ones to "confirm your email".
 *
 * Also offers an emailed sign-in link, sent only when the respondent asks, for
 * someone without their password to hand.
 */
export function SurveySignInPanel({
  templateId,
  defaultEmail,
}: {
  templateId: string;
  defaultEmail: string;
}) {
  const [signInState, signInAction] = useActionState<AuthState, FormData>(signIn, {});
  const [linkState, linkAction] = useActionState<SignInLinkState, FormData>(emailSurveySignInLink, {});

  return (
    <div className="space-y-4" data-testid="survey-sign-in">
      <form action={signInAction} className="space-y-4">
        <input type="hidden" name="redirectTo" value={`/survey/${templateId}`} />
        {signInState.error && (
          <p role="alert" className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
            {signInState.error}
          </p>
        )}
        <Field label="Email" htmlFor="signin_email" required>
          <input
            id="signin_email"
            name="email"
            type="email"
            autoComplete="email"
            className="input"
            required
            defaultValue={defaultEmail}
          />
        </Field>
        <Field label="Password" htmlFor="signin_password" required>
          <PasswordInput id="signin_password" name="password" autoComplete="current-password" required />
        </Field>
        <div className="-mt-1 text-right">
          <Link
            href="/auth/forgot-password"
            target="_blank"
            className="text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PendingButton label="Sign in & continue" pending="Signing in…" className="btn btn-primary w-full" />
      </form>

      <form action={linkAction} className="space-y-2 rounded-xl bg-[var(--color-mist)] p-4">
        <input type="hidden" name="template_id" value={templateId} />
        <p className="text-sm font-medium text-[var(--color-ink)]">No password to hand?</p>
        <p className="text-xs text-[var(--color-ink-soft)]">
          We can email you a link that signs you in and brings you back to this survey.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-label="Email for the sign-in link"
            placeholder="you@example.com"
            className="input min-w-0 flex-1"
            defaultValue={defaultEmail}
          />
          <PendingButton label="Email me a link" pending="Sending…" className="btn btn-ghost" />
        </div>
        <div role="status" aria-live="polite" className="text-sm">
          {linkState.message && <p className="font-medium text-[var(--color-olive-deep)]">{linkState.message}</p>}
          {linkState.error && <p className="text-[var(--color-accent)]">{linkState.error}</p>}
        </div>
      </form>
    </div>
  );
}
