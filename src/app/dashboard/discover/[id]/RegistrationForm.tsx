"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/onboarding/parts";
import { confirmRegistration, type RegistrationState } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Registering…" : "Confirm registration"}
    </button>
  );
}

/**
 * Confirmation step. Details are prefilled from the audience profile — the
 * point is to check them, not retype them — and the terms tick is required, so
 * registering is now a deliberate act.
 */
export function RegistrationForm({
  eventId,
  eventName,
  defaultName,
  defaultDateOfBirth,
  defaultPhone,
}: {
  eventId: string;
  eventName: string;
  defaultName: string;
  defaultDateOfBirth: string;
  defaultPhone: string;
}) {
  const [state, formAction] = useActionState<RegistrationState, FormData>(
    confirmRegistration,
    {},
  );

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="sponsored_event_id" value={eventId} />
      <ErrorBanner error={state.error} />

      <div>
        <h2 className="text-lg font-semibold">Confirm your details</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Taken from your profile. Correct anything that&apos;s out of date —
          we&apos;ll save the changes.
        </p>
      </div>

      <Field label="Full name" htmlFor="full_name" required>
        <input
          id="full_name"
          name="full_name"
          className="input"
          required
          defaultValue={defaultName}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date of birth"
          htmlFor="date_of_birth"
          required
          hint="Some sponsors set an age requirement for their rewards."
        >
          <input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            className="input"
            required
            defaultValue={defaultDateOfBirth}
          />
        </Field>
        <Field label="Contact phone" htmlFor="phone" required>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="input"
            required
            defaultValue={defaultPhone}
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="accept_terms"
          value="yes"
          required
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--color-brand-dark)] underline"
          >
            terms &amp; conditions
          </Link>{" "}
          for {eventName}, and understand I need to buy my own ticket and prove
          I attended before any reward is released.
        </span>
      </label>

      <Submit />
    </form>
  );
}
