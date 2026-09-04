"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";
import { emptyAnswerFor, questionSpec, validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";

/**
 * Admin-only stand-in for the real SurveyForm — same field renderers, but
 * with no Turnstile, no honeypot, and no submit_survey_response() call. An
 * admin fills it in to see the participant's experience; "Finish preview"
 * only runs the same client-side validateAnswers() check and never reaches
 * the server, so nothing is written and no quality scoring runs.
 */
export function PreviewSurveyForm({ questions }: { questions: SurveyQuestion[] }) {
  const [values, setValues] = useState<Record<string, SurveyAnswerValue>>(() => {
    const initial: Record<string, SurveyAnswerValue> = {};
    for (const q of questions) {
      initial[q.id] =
        q.type === "ranking" ? (q.options ?? []).map((o) => o.value) : emptyAnswerFor(q.type);
    }
    return initial;
  });
  const [error, setError] = useState<string | undefined>();
  const [finished, setFinished] = useState(false);

  function handleChange(questionId: string, value: SurveyAnswerValue) {
    setValues((prev) => ({ ...prev, [questionId]: value }));
  }

  function reset() {
    const initial: Record<string, SurveyAnswerValue> = {};
    for (const q of questions) {
      initial[q.id] =
        q.type === "ranking" ? (q.options ?? []).map((o) => o.value) : emptyAnswerFor(q.type);
    }
    setValues(initial);
    setError(undefined);
    setFinished(false);
  }

  if (finished) {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-semibold">✓ Preview complete</p>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Nothing was saved — this was a preview only.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={reset}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const drafts: SurveyAnswerDraft[] = questions.map((q) => ({
          question_id: q.id,
          value: values[q.id] ?? null,
          shown_at: null,
          answered_at: null,
        }));
        const problem = validateAnswers(questions, drafts);
        if (problem) {
          setError(problem);
          return;
        }
        setError(undefined);
        setFinished(true);
      }}
      className="space-y-4"
    >
      <p className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
        Preview mode — answers here are not saved, and no reward or quality scoring runs.
      </p>
      <ErrorBanner error={error} />

      {questions.map((q) => {
        const spec = questionSpec(q.type);
        return (
          <div key={q.id} className="card p-5">
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
        <button type="submit" className="btn btn-primary">
          Finish preview
        </button>
      </div>
    </form>
  );
}
