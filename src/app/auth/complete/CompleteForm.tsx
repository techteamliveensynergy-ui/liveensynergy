"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SIGNUP_ROLE_OPTIONS, type Role } from "@/lib/constants";
import { termsForRole } from "@/lib/terms";
import { completeGoogleSignup, type CompleteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

export function CompleteForm({
  next,
  initialRole,
  lockRole,
}: {
  next: string;
  initialRole: string | null;
  /** A survey sign-in is always an audience account: no role question. */
  lockRole: boolean;
}) {
  const [state, formAction] = useActionState<CompleteState, FormData>(completeGoogleSignup, {});
  const [role, setRole] = useState<Role | "">((initialRole as Role | null) ?? "");
  const terms = termsForRole(role);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="role" value={role} />

      {state.error && (
        <p role="alert" className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      {!lockRole && (
        <div>
          <p className="field-label">
            Who are you?<span className="text-[var(--color-accent)]"> *</span>
          </p>
          <div className="grid gap-2">
            {SIGNUP_ROLE_OPTIONS.map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  aria-pressed={active}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-[var(--color-brand)] bg-[var(--color-gold)]/40 ring-2 ring-[var(--color-brand)]/30"
                      : "border-black/10 hover:border-[var(--color-brand)]/50"
                  }`}
                >
                  <span className="block text-sm font-semibold">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-ink-soft)]">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {role === "audience" && (
        <Field
          label="Mobile number"
          htmlFor="phone"
          required
          hint="One account per person — your number is how we keep rewards fair."
        >
          <PhoneInput required />
        </Field>
      )}

      {terms && (
        <div className="rounded-xl border border-black/10 bg-[var(--color-mist)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Terms for {terms.party}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-[var(--color-ink-soft)]">
            {terms.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <label className="mt-4 flex items-start gap-2.5 text-sm text-[var(--color-ink)]">
            <input type="checkbox" name="terms_accepted" required className="mt-0.5 h-4 w-4 shrink-0" />
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
              <Link href="/privacy" target="_blank" className="font-semibold text-[var(--color-brand-dark)] underline">
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
