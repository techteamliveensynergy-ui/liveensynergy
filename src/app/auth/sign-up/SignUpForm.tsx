"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ROLES, SIGNUP_ROLE_OPTIONS, ROLE_LABELS, type Role } from "@/lib/constants";
import { termsForRole } from "@/lib/terms";
import { signUp, type AuthState } from "../actions";

function isRole(value: string | undefined): value is Role {
  return !!value && (ROLES as readonly string[]).includes(value);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

export function SignUpForm({ initialRole }: { initialRole?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signUp, {});
  const preset = isRole(initialRole) ? initialRole : "";
  const [role, setRole] = useState<Role | "">(preset);
  const [step, setStep] = useState<1 | 2>(preset ? 2 : 1);
  const terms = termsForRole(role);

  if (state.message) {
    return (
      <p className="rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
        {state.message}
      </p>
    );
  }

  // Step 1 — choose your role. This is the first thing every new user does.
  if (step === 1) {
    return (
      <div className="space-y-5">
        <div>
          <p className="field-label">
            First, tell us who you are
            <span className="text-[var(--color-accent)]"> *</span>
          </p>
          <div className="grid gap-2">
            {SIGNUP_ROLE_OPTIONS.map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-[var(--color-brand)] bg-[var(--color-gold)]/40 ring-2 ring-[var(--color-brand)]/30"
                      : "border-black/10 hover:border-[var(--color-brand)]/50"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-ink-soft)]">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!role}
          onClick={() => setStep(2)}
        >
          Continue
        </button>
      </div>
    );
  }

  // Step 2 — account details.
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="role" value={role} />

      <div className="flex items-center justify-between rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm">
        <span>
          Joining as{" "}
          <span className="font-semibold text-[var(--color-brand-dark)]">
            {role && ROLE_LABELS[role]}
          </span>
        </span>
        <button
          type="button"
          className="font-semibold text-[var(--color-brand)] hover:underline"
          onClick={() => setStep(1)}
        >
          Change
        </button>
      </div>

      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      <Field label="Full name" htmlFor="fullName" required>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          className="input"
          placeholder="Sakshi Gulati"
          required
        />
      </Field>

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

      <Field
        label="Password"
        htmlFor="password"
        required
        hint="At least 8 characters."
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      {/* Each party agrees to different things, so the summary is specific to
          the role they picked in step 1 (3 Aug standup). */}
      {terms && (
        <div className="rounded-xl border border-black/10 bg-[var(--color-mist)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Terms for {terms.party}
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-[var(--color-ink-soft)]">
            {terms.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <label className="mt-4 flex items-start gap-2.5 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="terms_accepted"
              required
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              I&apos;ve read and agree to the{" "}
              <Link
                href={`/terms#${terms.key}`}
                target="_blank"
                className="font-semibold text-[var(--color-brand-dark)] underline"
              >
                Terms &amp; Conditions for {terms.party}
              </Link>{" "}
              and the{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="font-semibold text-[var(--color-brand-dark)] underline"
              >
                Privacy Policy
              </Link>
              .<span className="text-[var(--color-accent)]"> *</span>
            </span>
          </label>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
