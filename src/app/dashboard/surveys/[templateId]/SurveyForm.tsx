"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBanner } from "@/components/onboarding/parts";
import { CoverMedia } from "@/components/surveys/QuestionMedia";
import { SurveyBlockCard } from "@/components/surveys/SurveyBlock";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { SurveyIntroGate } from "@/components/surveys/SurveyIntroGate";
import {
  accentColorVars,
  backgroundImageStyle,
  DEFAULT_SURVEY_APPEARANCE,
  typographyVars,
  type SurveyAppearance,
  type SurveyTypography,
} from "@/lib/survey-media";
import type { SurveyAnswerValue, SurveyMediaType, SurveyQuestion, SurveyTemplateLayoutMode } from "@/lib/types";
import { choseOther, emptyAnswerFor, surveyBlocks } from "@/lib/surveys";
import { surveyPath } from "@/lib/survey-logic";
import { SURVEY_HONEYPOT_FIELD } from "@/lib/survey-abuse-constants";
import { submitSurveyResponse, type SurveyResponseState } from "./actions";
import { TurnstileWidget } from "./TurnstileWidget";

interface Timing {
  shown_at: string | null;
  answered_at: string | null;
}

export function SurveyForm({
  templateId,
  questions,
  introMessage = null,
  showIntroGate = true,
  layoutMode = "single_page",
  coverMediaUrl,
  coverMediaType,
  footerBrandName,
  footerTagline,
  footerLogoUrl,
  accentColor,
  backgroundImageUrl,
  typography,
  appearance = DEFAULT_SURVEY_APPEARANCE,
}: {
  templateId: string;
  questions: SurveyQuestion[];
  introMessage?: string | null;
  showIntroGate?: boolean;
  layoutMode?: SurveyTemplateLayoutMode;
  coverMediaUrl?: string | null;
  coverMediaType?: SurveyMediaType | null;
  footerBrandName?: string | null;
  footerTagline?: string | null;
  footerLogoUrl?: string | null;
  accentColor?: string | null;
  backgroundImageUrl?: string | null;
  typography?: SurveyTypography;
  appearance?: SurveyAppearance;
}) {
  // A registered participant already agreed to the platform's own T&Cs at
  // sign-up (participations.terms_accepted_at/profiles.terms_accepted_at) —
  // this gate is UI-only re-confirmation for THIS survey (requirement 5,
  // 17 Sep standup), not a new consent record. submit_survey_response()
  // takes no consent parameter; adding one would create a Postgres function
  // overload for a UI-only requirement, which isn't worth the weight.
  const [gateCleared, setGateCleared] = useState(!showIntroGate);

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
  // "Other — please specify" text per question (FB-00029), sent with the
  // answers as other_text; only stored when Other is actually chosen.
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  function handleOtherText(questionId: string, text: string) {
    setOtherTexts((prev) => ({ ...prev, [questionId]: text }));
  }
  // Skip logic (0071): only the questions on this respondent's path, given
  // their answers so far. Jumps only go forward, so changing an answer never
  // moves the step someone is on — only what comes after it.
  const pathQuestions = useMemo(() => surveyPath(questions, values), [questions, values]);
  const pathKey = pathQuestions.map((q) => q.id).join(",");
  const blocks = useMemo(() => surveyBlocks(pathQuestions), [pathQuestions]);
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
  // wins; scrolling a question back into view never resets it. Only wired
  // up for single-page — stepped mode marks shown_at itself as each
  // question becomes the active step (see markShown below).
  //
  // Waits for the intro gate to clear: behind it the question cards aren't
  // mounted, so observing at first render found no elements and every
  // single-page answer went in with shown_at = null.
  useEffect(() => {
    if (layoutMode !== "single_page" || !gateCleared) return;
    if (typeof IntersectionObserver === "undefined") {
      const fallback = mountedAt.current;
      setTimings((prev) => {
        const next = { ...prev };
        for (const q of pathQuestions) {
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

    for (const q of pathQuestions) {
      const el = refs.current[q.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Registered against the refs captured at mount, and again only when a
    // branch changes which questions are on the page (pathKey) — not on
    // every keystroke, which would defeat the point of the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, gateCleared, pathKey]);

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

  function markShown(questionId: string) {
    setTimings((prev) =>
      prev[questionId]?.shown_at
        ? prev
        : { ...prev, [questionId]: { shown_at: new Date().toISOString(), answered_at: prev[questionId]?.answered_at ?? null } },
    );
  }

  const startedAt = useMemo(() => {
    const shownTimes = Object.values(timings)
      .map((t) => t.shown_at)
      .filter((t): t is string => Boolean(t))
      .sort();
    return shownTimes[0] ?? mountedAt.current;
  }, [timings]);

  // Only answers on the path — the server refuses answers to skipped questions.
  const payload = pathQuestions.map((q) => ({
    question_id: q.id,
    value: values[q.id] ?? null,
    shown_at: timings[q.id]?.shown_at ?? null,
    answered_at: timings[q.id]?.answered_at ?? null,
    other_text: choseOther(values[q.id] ?? null) ? (otherTexts[q.id] ?? "").trim() || null : null,
  }));

  const footer = (
    <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />
  );
  const singlePageBackground = backgroundImageStyle(backgroundImageUrl, appearance.backgroundImageOpacity);

  if (!gateCleared) {
    return (
      <SurveyIntroGate
        introMessage={introMessage}
        coverMediaUrl={coverMediaUrl}
        coverMediaType={coverMediaType}
        accentColor={accentColor}
        requireResidency={false}
        footer={footer}
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
      className="survey-scope space-y-4"
      style={typographyVars(typography ?? {})}
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

      {layoutMode === "stepped" ? (
        <SteppedQuestions
          questions={pathQuestions}
          values={values}
          otherTexts={otherTexts}
          onChange={handleChange}
          onOtherTextChange={handleOtherText}
          onShown={markShown}
          isPending={isPending}
          footer={footer}
          accentColor={accentColor}
          appearance={appearance}
        />
      ) : (
        <div className={`space-y-4 ${singlePageBackground ? "p-4" : ""}`} style={singlePageBackground}>
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
              registerRef={(id, el) => {
                refs.current[id] = el as HTMLDivElement | null;
              }}
            />
          ))}

          {footer}

          <div className="flex justify-end" style={accentColorVars(accentColor)}>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Submitting…" : "Submit survey"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
