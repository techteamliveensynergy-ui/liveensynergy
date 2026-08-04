"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { FileDrop } from "@/components/ui/FileDrop";
import { ErrorBanner } from "@/components/onboarding/parts";
import { ATTACHMENT_HINT, MAX_ATTACHMENT_BYTES } from "@/lib/upload-limits";
import {
  submitFeedback,
  type FeedbackState,
} from "@/app/dashboard/feedback/actions";

/**
 * The beta-tester feedback tab that rides along on every page (3 Aug standup).
 *
 * Collapsed it's a small tab pinned to the edge of the screen; opening it
 * expands the same report form as /dashboard/feedback, pre-filled with the
 * page you were on. Each submission is logged to `feedback_reports` and, when
 * a token is configured, mirrored to a GitHub issue.
 */

const KINDS = [
  { value: "bug", label: "Something's broken" },
  { value: "text_change", label: "Wording / text change" },
  { value: "improvement", label: "Improvement to something existing" },
  { value: "idea", label: "New idea" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Sending…" : "Send to the team"}
    </button>
  );
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FeedbackState, FormData>(
    submitFeedback,
    {},
  );
  const pathname = usePathname();
  const [pageUrl, setPageUrl] = useState("");
  const tabRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // Captures where the reporter was, so the team doesn't have to ask.
  useEffect(() => {
    setPageUrl(window.location.href);
  }, [pathname]);

  // Close on Escape, the way any other dismissible overlay behaves, and move
  // focus into the panel on open / back to the tab on close — otherwise a
  // keyboard user opens the form and is still tabbing through the page behind.
  useEffect(() => {
    if (!open) return;
    const tab = tabRef.current;
    firstFieldRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      tab?.focus();
    };
  }, [open]);

  if (!open) {
    return (
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 print:hidden"
        aria-haspopup="dialog"
      >
        <span aria-hidden>🐞</span> Feedback
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] print:hidden"
      role="dialog"
      aria-modal="false"
      aria-label="Report feedback"
    >
      <div className="card max-h-[80vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Report an issue
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
              Bugs, wording, ideas — anything. It goes straight to the team.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1 -mt-1 rounded-full px-2 py-1 text-lg leading-none text-[var(--color-ink-soft)] hover:bg-[var(--color-mist)]"
            aria-label="Close feedback"
          >
            ×
          </button>
        </div>

        {state.message ? (
          <div className="mt-4">
            <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2.5 text-sm text-[var(--color-olive-deep)]">
              {state.message}
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-3 w-full text-sm"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-4 space-y-3">
            <ErrorBanner error={state.error} />
            <input type="hidden" name="page_url" value={pageUrl} />

            <Field label="Type" htmlFor="widget-kind" required>
              <select
                ref={firstFieldRef}
                id="widget-kind"
                name="kind"
                className="select"
                defaultValue="bug"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Title" htmlFor="widget-subject" required>
              <input
                id="widget-subject"
                name="subject"
                className="input"
                required
                placeholder="Short summary"
              />
            </Field>

            <Field
              label="Details"
              htmlFor="widget-body"
              required
              hint="What you did, what you expected, what happened instead."
            >
              <textarea
                id="widget-body"
                name="body"
                className="textarea"
                rows={4}
                required
              />
            </Field>

            <Field label="Screenshot (optional)" htmlFor="widget-screenshot">
              <FileDrop
                name="screenshot"
                accept="image/*,application/pdf"
                maxBytes={MAX_ATTACHMENT_BYTES}
                allowedTypes={null}
                preview={false}
                hint={ATTACHMENT_HINT}
                label="Attach a screenshot"
              />
            </Field>

            <Submit />
          </form>
        )}
      </div>
    </div>
  );
}
