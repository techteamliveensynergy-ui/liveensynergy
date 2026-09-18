"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/onboarding/parts";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { SurveyIntroGate, type SurveyConsent } from "@/components/surveys/SurveyIntroGate";
import { accentColorVars, backgroundImageStyle, typographyVars, type SurveyTypography } from "@/lib/survey-media";
import { emptyAnswerFor, questionSpec } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD } from "@/lib/survey-abuse-constants";
import type { SurveyAnswerValue, SurveyMediaType, SurveyQuestion, SurveyTemplateLayoutMode } from "@/lib/types";
import { QuestionField } from "@/app/dashboard/surveys/[templateId]/fields";
import { TurnstileWidget } from "@/app/dashboard/surveys/[templateId]/TurnstileWidget";
import { ResetPasswordForm } from "@/app/auth/reset-password/ResetPasswordForm";
import {
  registerForEventAfterSurvey,
  startSurveyAccount,
  submitPublicSurveyResponse,
  type PublicSurveyResponseState,
  type RegisterAfterSurveyState,
  type SurveyAccountState,
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

/** Server-resolved identity for a signed-in visitor with no participation
 *  yet (either a pre-existing account or one startSurveyAccount() just
 *  created) — src/app/survey/[templateId]/page.tsx. When present, the
 *  contact step is skipped entirely: this is the "Implement Pre-fill"
 *  action item. */
export interface SurveyPrefill {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
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
  needsPassword,
}: {
  message: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
  /** True for an account startSurveyAccount() just created — it has a
   *  random password the respondent never saw, so they need to set a real
   *  one before the "register" step (or later, from the emailed reset
   *  link). */
  needsPassword: boolean;
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
        needsPassword ? (
          <div className="space-y-3 text-left">
            <p className="text-center text-sm text-[var(--color-ink-soft)]">
              We&apos;ve created your account — set a password now, or use the link we emailed you later.
            </p>
            <ResetPasswordForm />
          </div>
        ) : event ? (
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

type Stage = "gate" | "contact" | "questions";

export function PublicSurveyForm({
  templateId,
  questions,
  introMessage,
  thankYouMessage,
  event,
  isAuthenticated,
  needsPassword = false,
  prefill = null,
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
}: {
  templateId: string;
  questions: SurveyQuestion[];
  introMessage: string | null;
  thankYouMessage: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
  needsPassword?: boolean;
  prefill?: SurveyPrefill | null;
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
}) {
  const [stage, setStage] = useState<Stage>(() => {
    if (showIntroGate) return "gate";
    return prefill ? "questions" : "contact";
  });
  const [consent, setConsent] = useState<SurveyConsent>({
    consentAccepted: false,
    residencyConfirmed: false,
  });

  const [contactFirstName, setContactFirstName] = useState(prefill?.firstName ?? "");
  const [contactLastName, setContactLastName] = useState(prefill?.lastName ?? "");
  const [contactEmail, setContactEmail] = useState(prefill?.email ?? "");
  const [accountState, setAccountState] = useState<SurveyAccountState>({});
  const [accountPending, setAccountPending] = useState(false);

  async function handleCreateAccount() {
    if (!contactFirstName.trim() || !contactLastName.trim() || !contactEmail.trim()) {
      setAccountState({ error: "Please fill in your name and email." });
      return;
    }
    setAccountPending(true);
    setAccountState({});
    const form = new FormData();
    form.set("template_id", templateId);
    form.set("first_name", contactFirstName);
    form.set("last_name", contactLastName);
    form.set("email", contactEmail);
    form.set("consent_accepted", consent.consentAccepted ? "on" : "");
    form.set("residency_confirmed", consent.residencyConfirmed ? "on" : "");
    if (event) form.set("event_reference", event.reference);
    try {
      // A successful call redirect()s — Next re-throws that internally as a
      // special digest-tagged error rather than resolving normally, so it
      // must be re-thrown here rather than swallowed as a real failure (see
      // the catch below). Only the "already registered" / validation-error
      // branches actually return a state to show.
      const result = await startSurveyAccount({}, form);
      setAccountPending(false);
      setAccountState(result);
    } catch (err) {
      if (typeof (err as { digest?: string })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      setAccountPending(false);
      setAccountState({
        error: "Something went wrong creating your account. Please try again in a moment.",
      });
    }
  }

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
    if (stage !== "questions" || layoutMode !== "single_page") return;
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
  }, [stage, layoutMode]);

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
    return (
      <ThankYouScreen
        message={thankYouMessage}
        event={event}
        isAuthenticated={isAuthenticated}
        needsPassword={needsPassword}
      />
    );
  }

  if (stage === "gate") {
    return (
      <SurveyIntroGate
        introMessage={introMessage}
        coverMediaUrl={coverMediaUrl}
        coverMediaType={coverMediaType}
        accentColor={accentColor}
        requireResidency={!prefill}
        footer={<SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />}
        typography={typography}
        onStart={(c) => {
          setConsent(c);
          setStage(prefill ? "questions" : "contact");
        }}
      />
    );
  }

  if (stage === "contact") {
    return (
      <div className="survey-scope space-y-4" style={typographyVars(typography ?? {})}>
        <div className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">About you</h2>
          <ErrorBanner error={accountState.error} />

          {accountState.alreadyRegistered ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-ink-soft)]">
                We&apos;ve emailed <strong>{contactEmail}</strong> a link to continue as yourself — or keep
                going below and we&apos;ll save your answers without an account.
              </p>
              <button
                type="button"
                className="btn btn-ghost w-full"
                onClick={() => setStage("questions")}
              >
                Continue without an account
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="first_name" required>
                  <input
                    id="first_name"
                    className="input"
                    required
                    value={contactFirstName}
                    onChange={(e) => setContactFirstName(e.target.value)}
                  />
                </Field>
                <Field label="Last name" htmlFor="last_name" required>
                  <input
                    id="last_name"
                    className="input"
                    required
                    value={contactLastName}
                    onChange={(e) => setContactLastName(e.target.value)}
                  />
                </Field>
                <Field label="Email" htmlFor="email" required>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </Field>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={accountPending}
                onClick={handleCreateAccount}
              >
                {accountPending ? "Creating your account…" : "Create my account & continue"}
              </button>
              {/* Resilience, not the primary path: if account creation ever
                  fails outright (a config problem, a network blip), this
                  keeps the survey completable rather than a hard dead end —
                  same reasoning as the "already registered" branch above. */}
              {accountState.error && (
                <button
                  type="button"
                  className="btn btn-ghost w-full"
                  disabled={accountPending}
                  onClick={() => setStage("questions")}
                >
                  Continue without an account
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
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
      className="survey-scope space-y-4"
      style={typographyVars(typography ?? {})}
    >
      <ErrorBanner error={state.error} />
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="started_at" value={startedAt} />
      <input type="hidden" name="answers" value={JSON.stringify(payload)} readOnly />
      <input type="hidden" name="first_name" value={contactFirstName} readOnly />
      <input type="hidden" name="last_name" value={contactLastName} readOnly />
      <input type="hidden" name="email" value={contactEmail} readOnly />
      {prefill?.phone && <input type="hidden" name="phone" value={prefill.phone} readOnly />}
      <input
        type="hidden"
        name="consent_accepted"
        value={consent.consentAccepted ? "on" : ""}
        readOnly
      />
      <input
        type="hidden"
        name="residency_confirmed"
        value={consent.residencyConfirmed ? "on" : ""}
        readOnly
      />

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
