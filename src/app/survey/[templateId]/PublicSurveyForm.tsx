"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/Field";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { ErrorBanner } from "@/components/onboarding/parts";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { accentColorVars, backgroundImageStyle } from "@/lib/survey-media";
import { AGE_RANGE_OPTIONS, emptyAnswerFor, questionSpec } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD } from "@/lib/survey-abuse-constants";
import type { SurveyAnswerValue, SurveyMediaType, SurveyQuestion, SurveyTemplateLayoutMode } from "@/lib/types";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";
import { TurnstileWidget } from "@/app/dashboard/surveys/[templateId]/TurnstileWidget";
import {
  registerForEventAfterSurvey,
  submitPublicSurveyResponse,
  type PublicSurveyResponseState,
  type RegisterAfterSurveyState,
} from "./actions";

interface Timing {
  shown_at: string | null;
  answered_at: string | null;
}

export interface PublicSurveyEvent {
  id: string;
  reference: string;
  name: string;
}

function RegisterButton({ event }: { event: PublicSurveyEvent }) {
  const [state, formAction, isPending] = useActionState<RegisterAfterSurveyState, FormData>(
    registerForEventAfterSurvey,
    {},
  );
  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="sponsored_event_id" value={event.id} />
      <ErrorBanner error={state.error} />
      <button type="submit" className="btn btn-primary mt-2 w-full" disabled={isPending}>
        {isPending ? "Registering…" : `Register me for ${event.name}`}
      </button>
    </form>
  );
}

function ThankYouScreen({
  message,
  event,
  isAuthenticated,
}: {
  message: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
}) {
  return (
    <div className="card space-y-4 p-8 text-center">
      <div className="text-4xl" aria-hidden>
        🎉
      </div>
      <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
        Thanks for taking part!
      </h2>
      <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
        {message ??
          "Your answers have been recorded. Join the Live·En·Synergy community to unlock rewards and exclusive offers."}
      </p>

      {isAuthenticated ? (
        event ? (
          <RegisterButton event={event} />
        ) : (
          <Link href="/dashboard" className="btn btn-primary mt-2 w-full">
            Go to my dashboard
          </Link>
        )
      ) : (
        <Link
          href={`/auth/sign-up?role=audience${event ? `&event=${encodeURIComponent(event.reference)}` : ""}`}
          className="btn btn-primary mt-2 w-full"
        >
          Create your account &amp; register
        </Link>
      )}
    </div>
  );
}

export function PublicSurveyForm({
  templateId,
  questions,
  introMessage,
  thankYouMessage,
  event,
  isAuthenticated,
  layoutMode = "single_page",
  coverMediaUrl,
  coverMediaType,
  footerBrandName,
  footerTagline,
  footerLogoUrl,
  accentColor,
  backgroundImageUrl,
}: {
  templateId: string;
  questions: SurveyQuestion[];
  introMessage: string | null;
  thankYouMessage: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
  layoutMode?: SurveyTemplateLayoutMode;
  coverMediaUrl?: string | null;
  coverMediaType?: SurveyMediaType | null;
  footerBrandName?: string | null;
  footerTagline?: string | null;
  footerLogoUrl?: string | null;
  accentColor?: string | null;
  backgroundImageUrl?: string | null;
}) {
  const [values, setValues] = useState<Record<string, SurveyAnswerValue>>(() => {
    const initial: Record<string, SurveyAnswerValue> = {};
    for (const q of questions) {
      initial[q.id] =
        q.type === "ranking" ? (q.options ?? []).map((o) => o.value) : emptyAnswerFor(q.type);
    }
    return initial;
  });
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const mountedAt = useRef(new Date().toISOString());
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const [state, formAction, isPending] = useActionState<PublicSurveyResponseState, FormData>(
    submitPublicSurveyResponse,
    {},
  );
  const [botToken, setBotToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    if (state.error) setTurnstileResetKey((k) => k + 1);
  }, [state.error]);

  useEffect(() => {
    if (layoutMode !== "single_page") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

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

  const payload = questions.map((q) => ({
    question_id: q.id,
    value: values[q.id] ?? null,
    shown_at: timings[q.id]?.shown_at ?? null,
    answered_at: timings[q.id]?.answered_at ?? null,
  }));

  if (state.success) {
    return <ThankYouScreen message={thankYouMessage} event={event} isAuthenticated={isAuthenticated} />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        // See SurveyForm.tsx's identical comment: sidesteps <form action>'s
        // auto-reset of native controls on any action resolution.
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

      {introMessage && (
        <div className="card p-5 text-sm text-[var(--color-ink-soft)]">{introMessage}</div>
      )}

      {/* Always shown here, signed in or not — reaching this component at
          all means submit_public_survey_response() found no existing
          eligible participation to attach the response to (that case
          renders the authenticated SurveyForm instead, see page.tsx), so
          the RPC always requires this captured identity regardless of
          whether the visitor happens to have an unrelated session. */}
      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="first_name" required>
              <input id="first_name" name="first_name" className="input" required />
            </Field>
            <Field label="Last name" htmlFor="last_name" required>
              <input id="last_name" name="last_name" className="input" required />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <input id="email" name="email" type="email" className="input" required />
            </Field>
            <Field label="Phone number" htmlFor="phone" required>
              <PhoneInput required />
            </Field>
            <Field label="Age range" htmlFor="age_range" required>
              <select id="age_range" name="age_range" className="select" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {AGE_RANGE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-start gap-2.5 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="residency_confirmed"
              required
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>I confirm I&apos;m 18 or over and a UK resident.</span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="consent_accepted"
              required
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-[var(--color-brand-dark)] underline">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-[var(--color-brand-dark)] underline">
                Privacy Policy
              </Link>
              . My contact details are used only to prevent duplicate entries and won&apos;t be
              retained longer than necessary.
            </span>
          </label>
      </div>

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
          questions={questions}
          values={values}
          onChange={handleChange}
          onShown={markShown}
          isPending={isPending}
          footer={
            <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />
          }
          accentColor={accentColor}
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
              <div
                key={q.id}
                ref={(el) => {
                  refs.current[q.id] = el;
                }}
                data-question-id={q.id}
                className="card p-5"
              >
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
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Submitting…" : "Submit survey"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
