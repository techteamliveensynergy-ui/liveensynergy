"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";
import { emptyAnswerFor, questionSpec } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD } from "@/lib/survey-abuse-constants";
import { submitSurveyResponse, type SurveyResponseState } from "./actions";
import { QuestionField } from "./fields";
import { TurnstileWidget } from "./TurnstileWidget";

interface Timing {
  shown_at: string | null;
  answered_at: string | null;
}

export function SurveyForm({
  templateId,
  questions,
}: {
  templateId: string;
  questions: SurveyQuestion[];
}) {
  const [values, setValues] = useState<Record<string, SurveyAnswerValue>>(() => {
    const initial: Record<string, SurveyAnswerValue> = {};
    for (const q of questions) {
      // A ranking question is never "empty" — it starts in the order the
      // admin defined and the participant only needs to touch it to disagree.
      initial[q.id] =
        q.type === "ranking" ? (q.options ?? []).map((o) => o.value) : emptyAnswerFor(q.type);
    }
    return initial;
  });
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const mountedAt = useRef(new Date().toISOString());
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  // Deliberately NOT wired as <form action={formAction}>: React resets a
  // form's native controls after ANY action call resolves — success or an
  // app-level validation error alike, since returning `{ error }` doesn't
  // "throw" from React's perspective. For a single edit-in-place form
  // (SurveyTemplateForm) a post-success remount is fine; here it would wipe
  // every radio/checkbox answer the moment one question fails validation.
  // Calling formAction() from a plain onSubmit sidesteps that native reset
  // entirely, so isPending (not useFormStatus, which needs a real form
  // action) tracks the pending state instead.
  const [state, formAction, isPending] = useActionState<SurveyResponseState, FormData>(
    submitSurveyResponse,
    {},
  );
  const [botToken, setBotToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  // A Turnstile token is single-use and the server has now spent it. The
  // form deliberately survives a validation error with its answers intact
  // (see the comment above), so a retry needs a fresh token or it fails with
  // timeout-or-duplicate instead of the real problem.
  useEffect(() => {
    if (state.error) setTurnstileResetKey((k) => k + 1);
  }, [state.error]);

  // Per-question shown_at via IntersectionObserver — a single page-load
  // timestamp for every question would collapse the straight-lining and
  // completion-time signals the quality engine needs later. First write
  // wins; scrolling a question back into view never resets it.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      const fallback = mountedAt.current;
      setTimings((prev) => {
        const next = { ...prev };
        for (const q of questions) {
          next[q.id] = { shown_at: next[q.id]?.shown_at ?? fallback, answered_at: next[q.id]?.answered_at ?? null };
        }
        return next;
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setTimings((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.getAttribute("data-question-id");
            if (!id || next[id]?.shown_at) continue;
            next[id] = { shown_at: new Date().toISOString(), answered_at: next[id]?.answered_at ?? null };
            changed = true;
          }
          return changed ? next : prev;
        });
      },
      { threshold: 0.5 },
    );

    for (const q of questions) {
      const el = refs.current[q.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Registered once against the refs captured at mount — re-subscribing
    // on every keystroke would defeat the point of the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(questionId: string, value: SurveyAnswerValue) {
    setValues((prev) => ({ ...prev, [questionId]: value }));
    setTimings((prev) => ({
      ...prev,
      [questionId]: {
        shown_at: prev[questionId]?.shown_at ?? null,
        answered_at: new Date().toISOString(),
      },
    }));
  }

  const startedAt = useMemo(() => {
    const shownTimes = Object.values(timings)
      .map((t) => t.shown_at)
      .filter((t): t is string => Boolean(t))
      .sort();
    return shownTimes[0] ?? mountedAt.current;
  }, [timings]);

  const payload = questions.map((q) => ({
    question_id: q.id,
    value: values[q.id] ?? null,
    shown_at: timings[q.id]?.shown_at ?? null,
    answered_at: timings[q.id]?.answered_at ?? null,
  }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        // formAction is an async action from useActionState — calling it
        // outside startTransition breaks its own pending-state tracking
        // (React warns about this in dev) and, worse, crashed with a real
        // "rendered more hooks than during the previous render" error in
        // production on the post-submit re-render. startTransition is what
        // <form action={formAction}> does for you automatically; this
        // onSubmit path exists specifically to dodge that wiring's other
        // side effect — form.reset() wiping every radio/checkbox answer
        // after ANY action call resolves, success or validation error alike.
        startTransition(() => {
          formAction(formData);
        });
      }}
      className="space-y-4"
    >
      <ErrorBanner error={state.error} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="started_at" value={startedAt} />
      <input type="hidden" name="answers" value={JSON.stringify(payload)} readOnly />

      {/* Honeypot (build plan §03 stage 1). Deliberately NOT display:none —
          an unsophisticated bot that skips CSS should still see and fill
          it. Kept out of the a11y tree and out of tab order so no genuine
          user, sighted or not, can reach it. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
      >
        <label htmlFor="contact_reason">Contact reason</label>
        <input
          id="contact_reason"
          type="text"
          name={SURVEY_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <input type="hidden" name="cf-turnstile-response" value={botToken ?? ""} readOnly />
      <TurnstileWidget onToken={setBotToken} resetKey={turnstileResetKey} />

      {questions.map((q) => {
        const spec = questionSpec(q.type);
        return (
          <div
            key={q.id}
            ref={(el) => {
              refs.current[q.id] = el;
            }}
            data-question-id={q.id}
            className="card p-5"
          >
            <Field label={q.prompt || spec.label} required={q.required} hint={q.help_text ?? undefined}>
              <QuestionField
                question={q}
                value={values[q.id] ?? null}
                onChange={(v) => handleChange(q.id, v)}
              />
            </Field>
          </div>
        );
      })}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit survey"}
        </button>
      </div>
    </form>
  );
}
