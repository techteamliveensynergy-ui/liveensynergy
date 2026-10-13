"use client";

import { useId, type ReactNode, type Ref } from "react";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";
import { questionSpec } from "@/lib/surveys";
import {
  accentColorVars,
  cardBackgroundStyle,
  questionTypographyStyle,
  type SurveyAppearance,
} from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";

/**
 * One question as a respondent sees it — shared by the public form, the
 * signed-in dashboard form, the admin preview and the stepped layout, which
 * used to each copy the same card markup (so a visual change had to land in
 * four places, and drifted).
 *
 * Order inside the card (13 Oct client notes): prompt (sized by
 * question_size/question_font_size) → help text directly under it (it used
 * to sit below the options) → a clear gap → the answer field.
 */
export function SurveyQuestionCard({
  question: q,
  value,
  onChange,
  appearance,
  accentColor,
  cardRef,
  footer,
}: {
  question: SurveyQuestion;
  value: SurveyAnswerValue;
  onChange: (value: SurveyAnswerValue) => void;
  appearance?: SurveyAppearance;
  accentColor?: string | null;
  cardRef?: Ref<HTMLDivElement>;
  /** Rendered inside the card under the answer — the stepped layout's
   *  "please answer this" message. */
  footer?: ReactNode;
}) {
  const promptId = useId();
  const helpId = useId();
  const spec = questionSpec(q.type);
  const size = q.config.question_size ?? appearance?.questionFontSize ?? "md";

  return (
    <div
      ref={cardRef}
      data-question-id={q.id}
      className="card survey-card"
      style={{
        ...questionTypographyStyle(q.config),
        ...cardBackgroundStyle(appearance, q.config),
        ...accentColorVars(accentColor),
      }}
    >
      <QuestionMedia config={q.config}>
        <div role="group" aria-labelledby={promptId} aria-describedby={q.help_text ? helpId : undefined}>
          <h2 id={promptId} className="survey-prompt" data-size={size}>
            {q.prompt || spec.label}
            {q.required && (
              <span className="text-[var(--color-accent)]" aria-label="required">
                {" "}
                *
              </span>
            )}
          </h2>
          {q.help_text && (
            <p id={helpId} className="survey-help">
              {q.help_text}
            </p>
          )}
          <div className="survey-answer">
            <QuestionField question={q} value={value} onChange={onChange} />
          </div>
          {footer}
        </div>
      </QuestionMedia>
    </div>
  );
}
