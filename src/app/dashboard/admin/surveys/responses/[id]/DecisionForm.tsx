"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { SurveyQualityStatus } from "@/lib/types";
import { decideSurveyResponse, type ResponseActionState } from "../actions";

/**
 * Three submit buttons sharing one `useActionState` form, each meant to
 * carry its own `decision` — but a submit button's own `name`/`value` isn't
 * reliably included in the FormData React builds for an `action={fn}` form
 * (only `new FormData(form)`, not `new FormData(form, submitter)`), so
 * clicking any of them submitted no `decision` at all. Fixed the same way as
 * the participant survey form's React 19 auto-reset bug: bypass the gap by
 * writing directly to a plain DOM ref, synchronously in the click handler,
 * before the browser gathers the form's data.
 */
function DecideButton({
  decision,
  label,
  className,
  inputRef,
}: {
  decision: SurveyQualityStatus;
  label: string;
  className: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={() => {
        if (inputRef.current) inputRef.current.value = decision;
      }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DecisionForm({
  responseId,
  currentStatus,
}: {
  responseId: string;
  currentStatus: SurveyQualityStatus;
}) {
  const [state, formAction] = useActionState<ResponseActionState, FormData>(
    decideSurveyResponse,
    {},
  );
  const decisionRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={responseId} />
      <input type="hidden" name="decision" ref={decisionRef} />
      <ErrorBanner error={state.error} />

      <div>
        <label className="field-label" htmlFor="reason">
          Reason (optional — shown to the respondent only on reject)
        </label>
        <textarea id="reason" name="reason" className="textarea" rows={2} />
      </div>

      <div className="flex flex-wrap gap-2">
        <DecideButton
          decision="pass"
          label="Pass"
          className="btn btn-primary text-sm"
          inputRef={decisionRef}
        />
        <DecideButton
          decision="review"
          label="Send to review"
          className="btn btn-ghost text-sm"
          inputRef={decisionRef}
        />
        <DecideButton
          decision="reject"
          label="Reject"
          className="btn btn-ghost text-sm text-[var(--color-accent)]"
          inputRef={decisionRef}
        />
      </div>
      {currentStatus !== "pending" && (
        <p className="field-hint">
          Currently <span className="font-semibold capitalize">{currentStatus}</span> — any of
          the buttons above overrides that decision.
        </p>
      )}
    </form>
  );
}
