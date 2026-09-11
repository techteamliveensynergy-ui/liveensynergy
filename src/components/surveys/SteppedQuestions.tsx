"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Field } from "@/components/ui/Field";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";
import { isAnswerEmpty, questionSpec } from "@/lib/surveys";
import { accentColorVars, backgroundImageStyle } from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";

/**
 * `layout_mode: 'stepped'` — one question per screen with Back/Next
 * navigation, Typeform-style, instead of every question rendered at once.
 * Owns its own step position; the *answers themselves* stay owned by the
 * parent form (values/onChange), exactly like the single-page renderer, so
 * submission, the honeypot and Turnstile wiring don't change at all — only
 * how questions are presented does.
 */
export function SteppedQuestions({
  questions,
  values,
  onChange,
  onShown,
  isPending,
  footer,
  accentColor,
  submitLabel = "Submit survey",
}: {
  questions: SurveyQuestion[];
  values: Record<string, SurveyAnswerValue>;
  onChange: (questionId: string, value: SurveyAnswerValue) => void;
  /** Called once, the first time a question becomes the active step —
   *  feeds the same shown_at/completion-time signal the single-page
   *  renderer gets from its IntersectionObserver. */
  onShown: (questionId: string) => void;
  isPending: boolean;
  footer?: ReactNode;
  accentColor?: string | null;
  submitLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const shownRef = useRef<Set<string>>(new Set());

  const q = questions[index];

  useEffect(() => {
    if (!q || shownRef.current.has(q.id)) return;
    shownRef.current.add(q.id);
    onShown(q.id);
    // onShown is a stable setter-wrapping callback from the parent; only the
    // active question id should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  if (!q) return null;

  const spec = questionSpec(q.type);
  const isFirst = index === 0;
  const isLast = index === questions.length - 1;

  function goBack() {
    setBlockedMessage(null);
    setIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (q.required && isAnswerEmpty(values[q.id] ?? null)) {
      setBlockedMessage("Please answer this question to continue.");
      return;
    }
    setBlockedMessage(null);
    setIndex((i) => Math.min(questions.length - 1, i + 1));
  }

  const stepBackground = backgroundImageStyle(q.config.background_image_url);

  return (
    <div className={`space-y-4 ${stepBackground ? "p-4" : ""}`} style={stepBackground}>
      <div className="flex items-center gap-3 text-xs text-[var(--color-ink-soft)]">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-300"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="card p-5" data-question-id={q.id}>
        <QuestionMedia config={q.config} />
        <Field label={q.prompt || spec.label} required={q.required} hint={q.help_text ?? undefined}>
          <QuestionField
            question={q}
            value={values[q.id] ?? null}
            onChange={(v) => {
              setBlockedMessage(null);
              onChange(q.id, v);
            }}
          />
        </Field>
        {blockedMessage && (
          <p className="mt-2 text-sm text-[var(--color-accent)]">{blockedMessage}</p>
        )}
      </div>

      {footer}

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost" onClick={goBack} disabled={isFirst}>
          Back
        </button>
        <div style={accentColorVars(accentColor)}>
          {isLast ? (
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Submitting…" : submitLabel}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
