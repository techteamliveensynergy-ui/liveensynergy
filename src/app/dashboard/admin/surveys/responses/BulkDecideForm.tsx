"use client";

import { useRef, type ReactNode } from "react";
import { bulkDecideSurveyResponses } from "./actions";

/**
 * Same fix as DecisionForm.tsx: a submit button's own `name`/`value` isn't
 * reliably part of the FormData React builds for an `action={fn}` form, so
 * three buttons sharing one form can't each carry a different `decision`
 * that way. A hidden input written directly via ref, synchronously on
 * click, sidesteps it.
 */
export function BulkDecideForm({
  showButtons,
  children,
}: {
  showButtons: boolean;
  children: ReactNode;
}) {
  const decisionRef = useRef<HTMLInputElement>(null);

  function setDecision(value: string) {
    if (decisionRef.current) decisionRef.current.value = value;
  }

  return (
    <form action={bulkDecideSurveyResponses}>
      <input type="hidden" name="decision" ref={decisionRef} />
      {showButtons && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="submit"
            className="btn btn-ghost text-sm"
            onClick={() => setDecision("pass")}
          >
            Bulk pass selected
          </button>
          <button
            type="submit"
            className="btn btn-ghost text-sm"
            onClick={() => setDecision("review")}
          >
            Bulk send to review
          </button>
          <button
            type="submit"
            className="btn btn-ghost text-sm"
            onClick={() => setDecision("reject")}
          >
            Bulk reject selected
          </button>
        </div>
      )}
      {children}
    </form>
  );
}
