"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { surveyAvailability } from "@/app/survey/[templateId]/actions";
import {
  SUBMIT_CONFIRM_STATES,
  SURVEY_SUBMIT_CANCEL_LABEL,
  SURVEY_SUBMIT_CODES_OUT_BODY,
  SURVEY_SUBMIT_CODES_OUT_TITLE,
  SURVEY_SUBMIT_CONFIRM_LABEL,
  SURVEY_SUBMIT_QUOTA_BODY,
  SURVEY_SUBMIT_QUOTA_TITLE,
  type SurveyAvailability,
} from "@/lib/survey-capacity";

/** How long the submit waits for the availability check before just submitting. */
const CHECK_TIMEOUT_MS = 4000;

/**
 * The "quota is full" pop-up at the submit step (2 Nov standup follow-up).
 *
 * `guard(proceed)` is called from a survey form's onSubmit instead of
 * submitting straight away. It asks the server for the survey's CURRENT
 * availability — not the state the page loaded with, which may be minutes old
 * — and:
 *   - open / nearly full: calls `proceed()` at once;
 *   - quota filled, limit reached, or codes all claimed: opens the dialog.
 *     "Submit anyway" calls `proceed()`; "Go back" leaves the answers as they
 *     are;
 *   - the check fails or takes over 4 s: calls `proceed()`. Advice only — the
 *     server and the database still decide, so a slow or failed check never
 *     blocks someone from submitting.
 *
 * A respondent who has confirmed once for a given state isn't asked again if
 * they resubmit after fixing a validation error; if the state gets worse
 * (quota -> limit reached) they are.
 */
export function useSubmitQuotaConfirm(templateId: string) {
  const [asking, setAsking] = useState<{ state: SurveyAvailability; proceed: () => void } | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const acknowledged = useRef<Set<SurveyAvailability>>(new Set());

  const guard = useCallback(
    (proceed: () => void) => {
      if (busy.current) return;
      busy.current = true;
      setChecking(true);
      let settled = false;
      const finish = (state: SurveyAvailability | null) => {
        if (settled) return;
        settled = true;
        busy.current = false;
        setChecking(false);
        if (state && SUBMIT_CONFIRM_STATES.includes(state) && !acknowledged.current.has(state)) {
          setAsking({ state, proceed });
        } else {
          proceed();
        }
      };
      const timer = setTimeout(() => finish(null), CHECK_TIMEOUT_MS);
      surveyAvailability(templateId)
        .then((s) => {
          clearTimeout(timer);
          finish(s);
        })
        .catch(() => {
          clearTimeout(timer);
          finish(null);
        });
    },
    [templateId],
  );

  const dialog = asking ? (
    <SubmitQuotaDialog
      codesOut={asking.state === "codes_out"}
      onCancel={() => setAsking(null)}
      onConfirm={() => {
        acknowledged.current.add(asking.state);
        const go = asking.proceed;
        setAsking(null);
        go();
      }}
    />
  ) : null;

  return { guard, checking, dialog };
}

function SubmitQuotaDialog({
  codesOut,
  onCancel,
  onConfirm,
}: {
  codesOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = codesOut ? SURVEY_SUBMIT_CODES_OUT_TITLE : SURVEY_SUBMIT_QUOTA_TITLE;
  const body = codesOut ? SURVEY_SUBMIT_CODES_OUT_BODY : SURVEY_SUBMIT_QUOTA_BODY;
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  // The parent passes a fresh onCancel every render; keep the effect from
  // re-running (and re-focusing) because of that.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Same behaviour as ConfirmSubmit: focus moves into the dialog, Escape goes
  // back, the page behind can't scroll, and focus returns afterwards.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      data-testid="quota-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card w-full max-w-md p-6 text-left">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{body}</p>
        {/* type="button" throughout: this renders inside the survey's <form>. */}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {SURVEY_SUBMIT_CANCEL_LABEL}
          </button>
          <button ref={confirmRef} type="button" className="btn btn-primary" onClick={onConfirm}>
            {SURVEY_SUBMIT_CONFIRM_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
