"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { submitContactMessage, type ContactState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Sending…" : "Send message →"}
    </button>
  );
}

export function ContactForm({
  reference = null,
  defaultSubject = null,
  defaultName = null,
  defaultEmail = null,
}: {
  /** SPE-/CMP-/EVT- number the enquiry was opened from, if any. */
  reference?: string | null;
  defaultSubject?: string | null;
  defaultName?: string | null;
  defaultEmail?: string | null;
} = {}) {
  const [state, formAction] = useActionState<ContactState, FormData>(
    submitContactMessage,
    {},
  );

  if (state.message) {
    return (
      <div className="card mt-8 p-8 text-center">
        <p className="font-semibold text-[var(--color-olive-deep)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card mt-8 grid gap-4 p-6">
      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      {/* Carried through from wherever the form was opened, so the team can
          see which sponsorship this is about (10 Aug standup). Shown rather
          than hidden — you should be able to see what you're quoting. */}
      {reference && (
        <div className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm">
          <span className="text-[var(--color-ink-soft)]">About</span>{" "}
          <span className="font-semibold text-[var(--color-ink)]">
            {reference}
          </span>
          <input type="hidden" name="reference" value={reference} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" required>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="Jane Doe"
            defaultValue={defaultName ?? ""}
            required
          />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            placeholder="you@studio.com"
            defaultValue={defaultEmail ?? ""}
            required
          />
        </Field>
      </div>
      <Field label="Subject" htmlFor="subject">
        <input
          id="subject"
          name="subject"
          className="input"
          placeholder="Sponsorship enquiry"
          defaultValue={defaultSubject ?? ""}
        />
      </Field>
      <Field label="Message" htmlFor="message" required>
        <textarea
          id="message"
          name="message"
          className="textarea"
          placeholder="Tell us a little about what you're planning…"
          required
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
