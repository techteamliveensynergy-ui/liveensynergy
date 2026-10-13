"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SurveyBlockCard } from "@/components/surveys/SurveyBlock";
import { blockProblem, surveyBlocks } from "@/lib/surveys";
import { accentColorVars, backgroundImageStyle, type SurveyAppearance } from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";

/**
 * `layout_mode: 'stepped'` — one card per screen with Back/Next navigation,
 * Typeform-style, instead of every question rendered at once. A card is one
 * question or one rating group (surveyBlocks(), FB-00028). Owns its own step
 * position; the *answers themselves* stay owned by the parent form
 * (values/otherTexts + their setters), exactly like the single-page renderer,
 * so submission, the honeypot and Turnstile wiring don't change at all — only
 * how questions are presented does.
 */
export function SteppedQuestions({
  questions,
  values,
  otherTexts,
  onChange,
  onOtherTextChange,
  onShown,
  isPending,
  footer,
  accentColor,
  appearance,
  submitLabel = "Submit survey",
}: {
  questions: SurveyQuestion[];
  values: Record<string, SurveyAnswerValue>;
  otherTexts: Record<string, string>;
  onChange: (questionId: string, value: SurveyAnswerValue) => void;
  onOtherTextChange: (questionId: string, text: string) => void;
  /** Called once per question, the first time its step becomes active —
   *  feeds the same shown_at/completion-time signal the single-page
   *  renderer gets from its IntersectionObserver. */
  onShown: (questionId: string) => void;
  isPending: boolean;
  footer?: ReactNode;
  accentColor?: string | null;
  appearance?: SurveyAppearance;
  submitLabel?: string;
}) {
  const blocks = useMemo(() => surveyBlocks(questions), [questions]);
  const [index, setIndex] = useState(0);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const shownRef = useRef<Set<string>>(new Set());

  const block = blocks[index];

  useEffect(() => {
    if (!block) return;
    for (const q of block.questions) {
      if (shownRef.current.has(q.id)) continue;
      shownRef.current.add(q.id);
      onShown(q.id);
    }
    // onShown is a stable setter-wrapping callback from the parent; only the
    // active step should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.key]);

  if (!block) return null;

  const isFirst = index === 0;
  const isLast = index === blocks.length - 1;
  const lead = block.questions[0];

  function goBack() {
    setBlockedMessage(null);
    setIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    const problem = blockProblem(block, values, otherTexts);
    if (problem) {
      setBlockedMessage(problem);
      return;
    }
    setBlockedMessage(null);
    setIndex((i) => Math.min(blocks.length - 1, i + 1));
  }

  // media_position: "background" is the current, unified way to set a
  // step's backdrop (via the same media_url the direction options use);
  // background_image_url is the older, separately-uploaded field it
  // replaced — still honoured here for any question that already had one
  // set before the merge (see the note on it in SurveyQuestionConfig).
  const backgroundUrl =
    lead.config.media_position === "background" ? lead.config.media_url : lead.config.background_image_url;
  const stepBackground = backgroundImageStyle(backgroundUrl, appearance?.backgroundImageOpacity);

  return (
    <div
      className={`space-y-4 ${stepBackground ? "p-4" : ""}`}
      style={{ ...stepBackground, ...accentColorVars(accentColor) }}
    >
      <div className="flex items-center gap-3 text-[0.75em] text-[var(--color-ink-soft)]">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-300"
            style={{ width: `${((index + 1) / blocks.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums">
          {index + 1} / {blocks.length}
        </span>
      </div>

      <SurveyBlockCard
        key={block.key}
        block={block}
        values={values}
        otherTexts={otherTexts}
        onChange={(id, v) => {
          setBlockedMessage(null);
          onChange(id, v);
        }}
        onOtherTextChange={(id, t) => {
          setBlockedMessage(null);
          onOtherTextChange(id, t);
        }}
        appearance={appearance}
        accentColor={accentColor}
        footer={
          blockedMessage && <p className="mt-3 text-[0.875em] text-[var(--color-accent)]">{blockedMessage}</p>
        }
      />

      {footer}

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost" onClick={goBack} disabled={isFirst}>
          Back
        </button>
        <div style={accentColorVars(accentColor)}>
          {isLast ? (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
              onClick={(e) => {
                // Same check as Next, so the last step can't submit with a
                // required row or an "Other" box left empty.
                const problem = blockProblem(block, values, otherTexts);
                if (problem) {
                  e.preventDefault();
                  setBlockedMessage(problem);
                }
              }}
            >
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
