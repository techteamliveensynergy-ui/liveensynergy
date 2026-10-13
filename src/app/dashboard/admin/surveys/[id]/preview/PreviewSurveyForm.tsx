"use client";

import { useMemo, useState } from "react";
import { ErrorBanner } from "@/components/onboarding/parts";
import { CoverMedia } from "@/components/surveys/QuestionMedia";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { SurveyIntroGate } from "@/components/surveys/SurveyIntroGate";
import { SurveyBlockCard } from "@/components/surveys/SurveyBlock";
import { SurveySlide } from "@/components/surveys/SurveySlide";
import {
  accentColorVars,
  backgroundImageStyle,
  cardBackgroundStyle,
  surveyAppearance,
  typographyVars,
} from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyQuestion, SurveyTemplate } from "@/lib/types";
import {
  choseOther,
  emptyAnswerFor,
  surveyBlocks,
  validateAnswers,
  type SurveyAnswerDraft,
} from "@/lib/surveys";

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
    font_scale: fontScale,
    font_family: fontFamily,
    question_text_color: questionTextColor,
    body_text_color: bodyTextColor,
    show_intro_gate: showIntroGate,
  } = template;
  const appearance = surveyAppearance(template);
  const typography = { fontScale, fontFamily, questionTextColor, bodyTextColor };
  const [values, setValues] = useState<Record<string, SurveyAnswerValue>>(() => {
    const initial: Record<string, SurveyAnswerValue> = {};
    for (const q of questions) {
      initial[q.id] =
        q.type === "ranking" ? (q.options ?? []).map((o) => o.value) : emptyAnswerFor(q.type);
    }
    return initial;
  });
  // "Other — please specify" text per question (FB-00029), sent with the
  // answers as other_text; only stored when Other is actually chosen.
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  function handleOtherText(questionId: string, text: string) {
    setOtherTexts((prev) => ({ ...prev, [questionId]: text }));
  }
  const blocks = useMemo(() => surveyBlocks(questions), [questions]);
  const [error, setError] = useState<string | undefined>();
  const [finished, setFinished] = useState(false);
  const [gateCleared, setGateCleared] = useState(!showIntroGate);

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
    setOtherTexts({});
    setError(undefined);
    setFinished(false);
  }

  if (finished) {
    return (
      <SurveySlide
        className="survey-scope"
        style={{ ...typographyVars(typography), ...cardBackgroundStyle(appearance), ...accentColorVars(accentColor) }}
      >
        <div className="text-[2.5em]" aria-hidden>
          🎉
        </div>
        <h2 className="font-display text-[1.75em] font-semibold text-[var(--survey-question-color,var(--color-ink))]">
          Thanks for taking part!
        </h2>
        <p className="whitespace-pre-line text-[1.05em] leading-relaxed text-[var(--survey-body-color,var(--color-ink-soft))]">
          {thankYouMessage ??
            "Your answers have been recorded. Join the Live·En·Synergy community to unlock rewards and exclusive offers."}
        </p>
        <p className="rounded-lg bg-[var(--color-mist)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          Preview mode — nothing was saved, and no reward or quality scoring ran.
        </p>
        <button type="button" className="btn btn-primary mt-2 w-full" onClick={reset}>
          Try again
        </button>
      </SurveySlide>
    );
  }

  if (!gateCleared) {
    return (
      <SurveyIntroGate
        introMessage={introMessage}
        coverMediaUrl={coverMediaUrl}
        coverMediaType={coverMediaType}
        accentColor={accentColor}
        requireResidency={true}
        footer={<SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />}
        typography={typography}
        appearance={appearance}
        onStart={() => setGateCleared(true)}
      />
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
          other_text: choseOther(values[q.id] ?? null) ? (otherTexts[q.id] ?? "").trim() || null : null,
        }));
        const problem = validateAnswers(questions, drafts);
        if (problem) {
          setError(problem);
          return;
        }
        setError(undefined);
        setFinished(true);
      }}
      className="survey-scope space-y-4"
      style={typographyVars(typography)}
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
          otherTexts={otherTexts}
          onChange={handleChange}
          onOtherTextChange={handleOtherText}
          onShown={() => {}}
          isPending={false}
          footer={
            <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />
          }
          accentColor={accentColor}
          appearance={appearance}
          submitLabel="Finish preview"
        />
      ) : (
        <div
          className={`space-y-4 ${backgroundImageUrl ? "p-4" : ""}`}
          style={backgroundImageStyle(backgroundImageUrl, appearance.backgroundImageOpacity)}
        >
          <CoverMedia url={coverMediaUrl} type={coverMediaType} videoFormat={appearance.coverVideoFormat} />

          {blocks.map((block) => (
            <SurveyBlockCard
              key={block.key}
              block={block}
              values={values}
              otherTexts={otherTexts}
              onChange={handleChange}
              onOtherTextChange={handleOtherText}
              appearance={appearance}
              accentColor={accentColor}
            />
          ))}

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
