"use client";

import { useId, type ReactNode } from "react";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { SurveyQuestionCard } from "@/components/surveys/SurveyQuestionCard";
import { ScaleField } from "@/app/dashboard/surveys/[templateId]/fields/ScaleField";
import { offersOther, type SurveyBlock as Block } from "@/lib/surveys";
import {
  accentColorVars,
  cardBackgroundStyle,
  questionTypographyStyle,
  type SurveyAppearance,
} from "@/lib/survey-media";
import type { SurveyAnswerValue } from "@/lib/types";

export interface SurveyBlockProps {
  block: Block;
  values: Record<string, SurveyAnswerValue>;
  otherTexts: Record<string, string>;
  onChange: (questionId: string, value: SurveyAnswerValue) => void;
  onOtherTextChange: (questionId: string, text: string) => void;
  appearance?: SurveyAppearance;
  accentColor?: string | null;
  /** Registers each question's element for the shown_at observer. */
  registerRef?: (questionId: string, el: HTMLElement | null) => void;
  footer?: ReactNode;
}

/**
 * Several items rated on one shared scale, in one card (FB-00028). Each row
 * is an ordinary scale question (its prompt is the item's label); the group's
 * question text, help and media come from the first row, where the builder
 * keeps them in sync. Rows stack under the question on a phone and sit beside
 * their label from a tablet up.
 */
function RatingGroupCard({
  block,
  values,
  onChange,
  appearance,
  accentColor,
  registerRef,
  footer,
}: SurveyBlockProps) {
  const promptId = useId();
  const first = block.questions[0];
  const size = first.config.question_size ?? appearance?.questionFontSize ?? "md";
  const prompt = first.config.group_prompt || "Please rate each of the following";

  return (
    <div
      className="card survey-card"
      style={{
        ...questionTypographyStyle(first.config),
        ...cardBackgroundStyle(appearance, first.config),
        ...accentColorVars(accentColor),
      }}
    >
      <QuestionMedia config={first.config}>
        <div role="group" aria-labelledby={promptId}>
          <h2 id={promptId} className="survey-prompt" data-size={size}>
            {prompt}
          </h2>
          {first.help_text && <p className="survey-help">{first.help_text}</p>}
          <div className="survey-answer divide-y divide-black/10">
            {block.questions.map((q) => (
              <div
                key={q.id}
                ref={(el) => registerRef?.(q.id, el)}
                data-question-id={q.id}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(7rem,13rem)_1fr] sm:items-center sm:gap-4"
              >
                <p className="font-semibold text-[var(--survey-question-color,var(--color-ink))]">
                  {q.prompt}
                  {q.required && (
                    <>
                    <span className="text-[var(--color-accent)]" aria-hidden>
                      {" "}
                      *
                    </span>
                    <span className="sr-only"> (required)</span>
                    </>
                  )}
                </p>
                <ScaleField question={q} value={values[q.id] ?? null} onChange={(v) => onChange(q.id, v)} />
              </div>
            ))}
          </div>
          {footer}
        </div>
      </QuestionMedia>
    </div>
  );
}

/** One card on screen — a single question or a rating group. */
export function SurveyBlockCard(props: SurveyBlockProps) {
  const { block, values, otherTexts, onChange, onOtherTextChange, appearance, accentColor, registerRef, footer } =
    props;
  if (block.group) return <RatingGroupCard {...props} />;
  const q = block.questions[0];
  return (
    <SurveyQuestionCard
      question={q}
      value={values[q.id] ?? null}
      onChange={(v) => onChange(q.id, v)}
      appearance={appearance}
      accentColor={accentColor}
      cardRef={(el) => registerRef?.(q.id, el)}
      footer={footer}
      otherText={offersOther(q) ? (otherTexts[q.id] ?? "") : undefined}
      onOtherTextChange={offersOther(q) ? (t) => onOtherTextChange(q.id, t) : undefined}
    />
  );
}
