"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ErrorBanner } from "@/components/onboarding/parts";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { publishSurveyTemplate, type SurveyState } from "./actions";

function PublishButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? "Publishing…" : "Publish"}
    </button>
  );
}

/**
 * Publish, with a readable refusal (QA 30 Oct #4). On the editor page it also
 * refuses while the builder holds unsaved questions (SurveyBuilder marks
 * itself with data-survey-unsaved): Publish locks the last *saved* version
 * and hides the Save button, so those questions would be lost.
 */
export function PublishSurveyForm({
  id,
  sensitive = [],
  className = "btn btn-primary text-sm",
}: {
  id: string;
  /** Prompts of sensitive questions nobody has acknowledged (#54). */
  sensitive?: string[];
  className?: string;
}) {
  const [state, formAction] = useActionState<SurveyState, FormData>(publishSurveyTemplate, {});
  const [clientError, setClientError] = useState<string | null>(null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (document.querySelector("[data-survey-unsaved]")) {
          e.preventDefault();
          setClientError(
            "You have unsaved question changes. Click “Save changes” below first — Publish uses the last saved version.",
          );
          return;
        }
        setClientError(null);
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {sensitive.length > 0 ? (
        <ConfirmSubmit
          label="Publish"
          pendingLabel="Publishing…"
          className={className}
          title="Publish with sensitive questions unacknowledged?"
          body={
            <>
              <p>
                These questions may collect special-category or identifying data, and nobody has confirmed
                they&apos;re intended and covered by the survey terms:
              </p>
              <ul className="mt-2 list-disc pl-5">
                {sensitive.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          }
          confirmLabel="Publish anyway"
          cancelLabel="Go back and review"
        />
      ) : (
        <PublishButton className={className} />
      )}
      <ErrorBanner error={clientError ?? state.error} />
    </form>
  );
}
