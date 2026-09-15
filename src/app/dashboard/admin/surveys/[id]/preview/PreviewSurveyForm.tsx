"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/onboarding/parts";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { accentColorVars, backgroundImageStyle } from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyQuestion, SurveyTemplate } from "@/lib/types";
import { emptyAnswerFor, questionSpec, validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";

/**
 * Admin-only stand-in for the real SurveyForm — same field renderers, but
 * with no Turnstile, no honeypot, and no submit_survey_response() call. An
 * admin fills it in to see the participant's experience; "Finish preview"
 * only runs the same client-side validateAnswers() check and never reaches
 * the server, so nothing is written and no quality scoring runs.
 */
export function PreviewSurveyForm({ questions, template }: { questions: SurveyQuestion[]; template: SurveyTemplate }) {
  const {
    layout_mode: layoutMode,
    cover_media_url: coverMediaUrl,
    cover_media_type: coverMediaType,
    footer_brand_name: footerBrandName,
    footer_tagline: footerTagline,
    footer_logo_url: footerLogoUrl,
    accent_color: accentColor,
    background_image_url: backgroundImageUrl,
    intro_message: introMessage,
    thank_you_message: thankYouMessage,
  } = template;
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
      <div className="card space-y-4 p-8 text-center">
        <div className="text-4xl" aria-hidden>
          🎉
        </div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          Thanks for taking part!
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          {thankYouMessage ??
            "Your answers have been recorded. Join the Live·En·Synergy community to unlock rewards and exclusive offers."}
        </p>
        <p className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          Preview mode — nothing was saved, and no reward or quality scoring ran.
        </p>
        <button type="button" className="btn btn-primary mt-2 w-full" onClick={reset}>
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

      {introMessage && (
        <div className="card p-5 text-sm text-[var(--color-ink-soft)]">{introMessage}</div>
      )}

      {layoutMode === "stepped" ? (
        <SteppedQuestions
          questions={questions}
          values={values}
          onChange={handleChange}
          onShown={() => {}}
          isPending={false}
          footer={
            <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />
          }
          accentColor={accentColor}
          submitLabel="Finish preview"
        />
      ) : (
        <div
          className={`space-y-4 ${backgroundImageStyle(backgroundImageUrl) ? "p-4" : ""}`}
          style={backgroundImageStyle(backgroundImageUrl)}
        >
          {coverMediaUrl && (
            <QuestionMedia config={{ media_url: coverMediaUrl, media_type: coverMediaType ?? "image" }} />
          )}

          {questions.map((q) => {
            const spec = questionSpec(q.type);
            return (
              <div key={q.id} className="card p-5">
                <QuestionMedia config={q.config}>
                  <Field label={q.prompt || spec.label} required={q.required} hint={q.help_text ?? undefined}>
                    <QuestionField
                      question={q}
                      value={values[q.id] ?? null}
                      onChange={(v) => handleChange(q.id, v)}
                    />
                  </Field>
                </QuestionMedia>
              </div>
            );
          })}

          <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />

          <div className="flex justify-end" style={accentColorVars(accentColor)}>
            <button type="submit" className="btn btn-primary">
              Finish preview
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
