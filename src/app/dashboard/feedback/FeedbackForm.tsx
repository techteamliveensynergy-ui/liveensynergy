"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FileDrop } from "@/components/ui/FileDrop";
import { ErrorBanner } from "@/components/onboarding/parts";
import { ATTACHMENT_HINT } from "@/lib/upload-limits";
import { submitFeedback, type FeedbackState } from "./actions";

const KINDS = [
  { value: "bug", label: "Something's broken" },
  { value: "text_change", label: "Wording / text change" },
  { value: "improvement", label: "Improvement to something existing" },
  { value: "idea", label: "New idea" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Sending…" : "Send to the team"}
    </button>
  );
}

export function FeedbackForm() {
  const [state, formAction] = useActionState<FeedbackState, FormData>(
    submitFeedback,
    {},
  );
  const [pageUrl, setPageUrl] = useState("");

  // Captures where the reporter came from so the team doesn't have to ask.
  useEffect(() => {
    setPageUrl(document.referrer || window.location.href);
  }, []);

  if (state.message) {
    return (
      <div className="card p-6">
        <p className="rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          {state.message}
        </p>
        <a href="/dashboard/feedback" className="btn btn-ghost mt-4">
          Report something else
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <ErrorBanner error={state.error} />
      <input type="hidden" name="page_url" value={pageUrl} />

      <Field label="What kind of report is this?" htmlFor="kind" required>
        <select id="kind" name="kind" className="select" defaultValue="bug">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title" htmlFor="subject" required>
        <input
          id="subject"
          name="subject"
          className="input"
          required
          placeholder="Sponsor offers count looks wrong on the artist dashboard"
        />
      </Field>

      <Field
        label="Details"
        htmlFor="body"
        required
        hint="What you did, what you expected, and what happened instead."
      >
        <textarea
          id="body"
          name="body"
          className="textarea"
          rows={6}
          required
        />
      </Field>

      <Field label="Screenshot (optional)" htmlFor="screenshot">
        <FileDrop
          name="screenshot"
          accept="image/*,application/pdf"
          hint={ATTACHMENT_HINT}
          label="Drag a screenshot here, or click to browse"
        />
      </Field>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
