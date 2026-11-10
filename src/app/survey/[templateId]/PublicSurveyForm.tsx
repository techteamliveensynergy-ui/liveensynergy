"use client";

import { usePathname } from "next/navigation";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/Field";
import { COUNTRY_CODES } from "@/components/ui/PhoneInput";
import { ErrorBanner } from "@/components/onboarding/parts";
import { CoverMedia } from "@/components/surveys/QuestionMedia";
import { SurveyFooter } from "@/components/surveys/SurveyFooter";
import { SteppedQuestions } from "@/components/surveys/SteppedQuestions";
import { useLiveAvailability } from "@/components/surveys/LiveAvailabilityNotice";
import { useSubmitQuotaConfirm } from "@/components/surveys/SubmitQuotaDialog";
import { VerifyEmailStep } from "@/components/surveys/VerifyEmailStep";
import { RewardPanel } from "@/components/surveys/RewardPanel";
import { SurveySignInPanel } from "@/components/surveys/SurveySignInPanel";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";
import { SurveyIntroGate, type SurveyConsent } from "@/components/surveys/SurveyIntroGate";
import { SurveyBlockCard } from "@/components/surveys/SurveyBlock";
import { SurveySlide } from "@/components/surveys/SurveySlide";
import {
  accentColorVars,
  backgroundImageStyle,
  cardBackgroundStyle,
  DEFAULT_SURVEY_APPEARANCE,
  typographyVars,
  type SurveyAppearance,
  type SurveyTypography,
} from "@/lib/survey-media";
import { choseOther, emptyAnswerFor, surveyBlocks } from "@/lib/surveys";
import { surveyPath } from "@/lib/survey-logic";
import { SURVEY_HONEYPOT_FIELD } from "@/lib/survey-abuse-constants";
import { SURVEY_HELD_FOR_REVIEW_MESSAGE, SURVEY_UNDER_REVIEW_MESSAGE } from "@/lib/survey-capacity";
import { registerNoteFor, type SurveyRewardOutcome } from "@/lib/survey-reward";
import type { SurveyAnswerValue, SurveyMediaType, SurveyQuestion, SurveyTemplateLayoutMode } from "@/lib/types";
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
  registered,
  reward,
  typography,
  appearance,
  accentColor,
}: {
  message: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
  typography?: SurveyTypography;
  appearance: SurveyAppearance;
  accentColor?: string | null;
  /** True only in the visit where startSurveyAccount() just created the
   *  account — it has a random password the respondent never saw, so offer to
   *  set one (they also have the emailed link). It must NOT follow the
   *  account's `survey_account` flag, which is never cleared: that replaced the
   *  register step on every survey, forever. */
  needsPassword: boolean;
  /** The submit registered them for the event. */
  registered?: boolean;
  /** Their code, or why there isn't one yet. */
  reward?: SurveyRewardOutcome;
}) {
  const pathname = usePathname();
  // The reward panel already says "under review" / "held" in its own words;
  // repeating the message above it would say it twice.
  const rewardSaysIt = reward?.status === "pending" && (reward.reason === "review" || reward.reason === "held");
  return (
    <SurveySlide
      className="survey-scope"
      style={{ ...typographyVars(typography ?? {}), ...cardBackgroundStyle(appearance), ...accentColorVars(accentColor) }}
    >
      <div className="text-[2.5em]" aria-hidden>
        🎉
      </div>
      <h2 className="font-display text-[1.75em] font-semibold text-[var(--survey-question-color,var(--color-ink))]">
        Thanks for taking part!
      </h2>
      {!rewardSaysIt && (
        <p className="whitespace-pre-line text-[1.05em] leading-relaxed text-[var(--survey-body-color,var(--color-ink-soft))]">
          {message ??
            "Your answers have been recorded. Join the Live·En·Synergy community to unlock rewards and exclusive offers."}
        </p>
      )}

      {isAuthenticated ? (
        <>
          {reward && <RewardPanel reward={reward} />}

          {registered ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--color-olive-deep)]" data-testid="registered-note">
                ✓ You&apos;re registered{event ? ` for ${event.name}` : ""}.
              </p>
              <Link
                href={reward?.status === "issued" ? "/dashboard/rewards" : "/dashboard/participations"}
                className="btn btn-primary w-full"
              >
                {reward?.status === "issued" ? "View my rewards" : "View my events"}
              </Link>
            </div>
          ) : event ? (
            // Auto-registration didn't happen (e.g. an account that wasn't
            // created in this visit, or the event wasn't open) — keep the manual route.
            <RegisterButton event={event} />
          ) : (
            <Link href="/dashboard" className="btn btn-primary mt-2 w-full">
              Go to my dashboard
            </Link>
          )}

          {needsPassword && (
            <div className="space-y-3 border-t border-black/10 pt-4 text-left">
              <p className="text-sm font-semibold text-[var(--color-ink)]">Set a password</p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                We&apos;ve created your account. Set a password now to sign in later, or use the link we emailed you.
              </p>
              <ResetPasswordForm />
            </div>
          )}
        </>
      ) : (
        <Link
          href={`/auth/sign-up?role=audience${event ? `&event=${encodeURIComponent(event.reference)}` : ""}&redirectTo=${encodeURIComponent(pathname)}`}
          className="btn btn-primary mt-2 w-full"
        >
          Create your account &amp; register
        </Link>
      )}
    </SurveySlide>
  );
}

type Stage = "gate" | "contact" | "verify" | "questions";

export function PublicSurveyForm({
  templateId,
  questions,
  introMessage,
  thankYouMessage,
  event,
  isAuthenticated,
  isAudience = false,
  emailVerified = true,
  needsPassword = false,
  googleEnabled = false,
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
  appearance = DEFAULT_SURVEY_APPEARANCE,
  initiallyFull = false,
}: {
  templateId: string;
  questions: SurveyQuestion[];
  introMessage: string | null;
  thankYouMessage: string | null;
  event: PublicSurveyEvent | null;
  isAuthenticated: boolean;
  /** The signed-in account is an audience account (only those are registered on submit). */
  isAudience?: boolean;
  /** The signed-in respondent has confirmed their email. False sends them to the
   *  "confirm your email" step before the questions (0108). */
  emailVerified?: boolean;
  needsPassword?: boolean;
  /** "Continue with Google" is configured (GOOGLE_SIGNIN_ENABLED). */
  googleEnabled?: boolean;
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
  appearance?: SurveyAppearance;
  /** The page already said the survey is over its limit (CapacityNotice). */
  initiallyFull?: boolean;
}) {
  // Re-checks places and codes as the respondent moves through a stepped
  // survey, so they hear codes have run out before the last question (#53).
  const live = useLiveAvailability(templateId, initiallyFull);
  // At the submit step, ask first when the quota is full / codes are gone (2 Nov).
  const quota = useSubmitQuotaConfirm(templateId);
  // The address must be confirmed BEFORE the questions (client test, 4 Nov;
  // migration 0108 enforces it at the database too). Nothing is answered yet at
  // that point, so waiting for the email loses nothing.
  const [emailOk, setEmailOk] = useState(emailVerified);
  const [stage, setStage] = useState<Stage>(() => {
    if (showIntroGate) return "gate";
    return prefill ? (emailVerified ? "questions" : "verify") : "contact";
  });
  const [consent, setConsent] = useState<SurveyConsent>({
    consentAccepted: false,
    residencyConfirmed: false,
  });

  const [contactFirstName, setContactFirstName] = useState(prefill?.firstName ?? "");
  const [contactLastName, setContactLastName] = useState(prefill?.lastName ?? "");
  const [contactEmail, setContactEmail] = useState(prefill?.email ?? "");
  const [contactPhoneCode, setContactPhoneCode] = useState("+44");
  const [contactPhone, setContactPhone] = useState("");
  const [accountState, setAccountState] = useState<SurveyAccountState>({});
  // A response belongs to an account: signed-out visitors register or sign in
  // first (client note, 4 Nov) — there is no "continue without an account".
  const [accountMode, setAccountMode] = useState<"create" | "signin">("create");
  const [accountPending, setAccountPending] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  // A signed-in respondent on an event-linked survey is registered for the event
  // when they submit (and told so beside the button) — see
  // registerAndRewardAfterSubmit() in ./actions.ts.
  const registersForEvent = Boolean(event) && (accountCreated || (isAuthenticated && isAudience));
  const registerNote =
    registersForEvent && event ? (
      <p className="text-sm text-[var(--color-ink-soft)]" data-testid="register-note">
        {registerNoteFor(event.name)}
      </p>
    ) : null;
  const router = useRouter();

  async function handleCreateAccount() {
    if (!contactFirstName.trim() || !contactLastName.trim() || !contactEmail.trim()) {
      setAccountState({ error: "Please fill in your name and email." });
      return;
    }
    const digits = contactPhone.replace(/[^\d]/g, "");
    if (digits.length < 7 || digits.length > 15) {
      setAccountState({ error: "Please enter a valid mobile number." });
      return;
    }
    setAccountPending(true);
    setAccountState({});
    const form = new FormData();
    form.set("template_id", templateId);
    form.set("first_name", contactFirstName);
    form.set("last_name", contactLastName);
    form.set("email", contactEmail);
    form.set("phone_country_code", contactPhoneCode);
    form.set("phone", contactPhone);
    form.set("consent_accepted", consent.consentAccepted ? "on" : "");
    form.set("residency_confirmed", consent.residencyConfirmed ? "on" : "");
    if (event) form.set("event_reference", event.reference);
    try {
      const result = await startSurveyAccount({}, form);
      setAccountPending(false);
      if (result.created) {
        // On to the confirm-your-email step, then the first question (FB-00032).
        // Pull the signed-in server props (needsPassword etc.) without remounting —
        // a remount would reset this form back to the welcome screen.
        setAccountCreated(true);
        // A brand-new account's address is unproven: confirm it first (0108).
        setEmailOk(false);
        setStage("verify");
        router.refresh();
        return;
      }
      if (result.alreadyRegistered) setAccountMode("signin");
      setAccountState(result);
    } catch {
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

  const [state, formAction, isPending] = useActionState<PublicSurveyResponseState, FormData>(
    submitPublicSurveyResponse,
    {},
  );
  // The database refused because the email isn't confirmed (0108): back to the
  // confirm step. The form stays mounted, so the answers are still here.
  useEffect(() => {
    if (state.needsEmailVerification) {
      setEmailOk(false);
      setStage("verify");
    }
  }, [state]);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [reachedLastStep, setReachedLastStep] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, layoutMode, pathKey]);

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

  if (state.success) {
    return (
      <ThankYouScreen
        message={
          state.heldForReview
            ? SURVEY_HELD_FOR_REVIEW_MESSAGE
            : state.underReview
              ? SURVEY_UNDER_REVIEW_MESSAGE
              : thankYouMessage
        }
        event={event}
        isAuthenticated={isAuthenticated}
        needsPassword={needsPassword && accountCreated}
        registered={state.registered}
        reward={state.reward}
        typography={typography}
        appearance={appearance}
        accentColor={accentColor}
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
        appearance={appearance}
        onStart={(c) => {
          setConsent(c);
          setStage(prefill ? (emailOk ? "questions" : "verify") : "contact");
        }}
      />
    );
  }

  if (stage === "verify") {
    return (
      <div className="survey-scope space-y-4" style={typographyVars(typography ?? {})}>
        <VerifyEmailStep
          email={contactEmail}
          templateId={templateId}
          onEmailChanged={setContactEmail}
          onVerified={() => {
            setEmailOk(true);
            setStage("questions");
            router.refresh();
          }}
        />
      </div>
    );
  }

  if (stage === "contact") {
    const signingIn = accountMode === "signin";
    return (
      <div className="survey-scope space-y-4" style={typographyVars(typography ?? {})}>
        <div className="card space-y-4 p-5" data-testid="survey-account-step">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              {signingIn ? "Sign in to start" : "Create your account to start"}
            </h2>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {signingIn
                ? "Sign in with the account you already have — we'll bring you straight back to the questions."
                : "You need a Live·En·Synergy account to take this survey. It keeps your answers, your event and your discount code together."}
            </p>
          </div>
          <ErrorBanner error={accountState.error} />
          {accountState.alreadyRegistered && (
            <p
              role="status"
              className="rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]"
            >
              There&apos;s already an account for <strong>{contactEmail}</strong>. Sign in below to continue.
            </p>
          )}

          {googleEnabled && (
            <>
              <GoogleButton
                next={`/survey/${templateId}`}
                role="audience"
                lockRole
                label={signingIn ? "Sign in with Google" : "Continue with Google"}
              />
              <OrDivider />
            </>
          )}

          {signingIn ? (
            <>
              <SurveySignInPanel templateId={templateId} defaultEmail={contactEmail} />
              <p className="text-center text-sm text-[var(--color-ink-soft)]">
                New here?{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--color-brand-dark)] underline"
                  onClick={() => {
                    setAccountState({});
                    setAccountMode("create");
                  }}
                >
                  Create an account
                </button>
              </p>
            </>
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
                <Field label="Mobile number" htmlFor="contact_phone" required>
                  <div className="flex gap-2">
                    <select
                      aria-label="Country code"
                      className="select w-[8rem] shrink-0"
                      value={contactPhoneCode}
                      onChange={(e) => setContactPhoneCode(e.target.value)}
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      id="contact_phone"
                      type="tel"
                      className="input flex-1"
                      required
                      placeholder="7911 123456"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                </Field>
              </div>
              <p className="text-xs text-[var(--color-ink-soft)]">
                We&apos;ll create your account and email you a link to confirm your address. The link signs you in
                and brings you back here — the questions start once it&apos;s confirmed. You can set a password at
                the end.
              </p>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={accountPending}
                onClick={handleCreateAccount}
              >
                {accountPending ? "Creating your account…" : "Create my account & continue"}
              </button>
              <p className="text-center text-sm text-[var(--color-ink-soft)]">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--color-brand-dark)] underline"
                  onClick={() => {
                    setAccountState({});
                    setAccountMode("signin");
                  }}
                >
                  Sign in
                </button>
              </p>
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
        quota.guard(() => {
          startTransition(() => {
            formAction(formData);
          });
        });
      }}
      className="survey-scope space-y-4"
      style={typographyVars(typography ?? {})}
    >
      <ErrorBanner error={state.error} />
      {state.needsSignIn && (
        <p className="text-sm">
          <a
            href={`/auth/sign-in?redirectTo=${encodeURIComponent(`/survey/${templateId}`)}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--color-brand-dark)] underline"
          >
            Sign in in a new tab
          </a>
          , then come back here and press Submit again.
        </p>
      )}
      {quota.dialog}
      {registersForEvent && event && <input type="hidden" name="register_event_id" value={event.id} readOnly />}
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="started_at" value={startedAt} />
      <input type="hidden" name="answers" value={JSON.stringify(payload)} readOnly />
      <input type="hidden" name="first_name" value={contactFirstName} readOnly />
      <input type="hidden" name="last_name" value={contactLastName} readOnly />
      <input type="hidden" name="email" value={contactEmail} readOnly />
      {prefill?.phone ? (
        <input type="hidden" name="phone" value={prefill.phone} readOnly />
      ) : contactPhone ? (
        <>
          <input type="hidden" name="phone_country_code" value={contactPhoneCode} readOnly />
          <input type="hidden" name="phone" value={contactPhone.replace(/[^\d]/g, "")} readOnly />
        </>
      ) : null}
      {accountCreated && (
        <p className="rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm">
          ✓ Your account is set up and <strong>{contactEmail}</strong> is confirmed. You can set a password once
          you&apos;ve finished.
        </p>
      )}
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
      {/* Stepped surveys start the bot check on the last page: mounted on
          page one, its token expired part-way through a long survey and the
          "Verify you are human" box came back (Testing notes 7 Nov). */}
      {(layoutMode !== "stepped" || reachedLastStep) && (
        <TurnstileWidget onToken={setBotToken} resetKey={turnstileResetKey} />
      )}

      {layoutMode === "stepped" ? (
        <SteppedQuestions
          questions={pathQuestions}
          values={values}
          otherTexts={otherTexts}
          onChange={handleChange}
          onOtherTextChange={handleOtherText}
          onReachLastStep={() => setReachedLastStep(true)}
          onShown={markShown}
          isPending={isPending || quota.checking}
          footer={
            <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />
          }
          accentColor={accentColor}
          appearance={appearance}
          onStepChange={live.check}
          submitLabel={registersForEvent ? "Submit & register" : "Submit survey"}
          notice={
            <>
              {live.notice}
              {registerNote}
            </>
          }
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
              registerRef={(id, el) => {
                refs.current[id] = el as HTMLDivElement | null;
              }}
            />
          ))}

          <SurveyFooter brandName={footerBrandName} tagline={footerTagline} logoUrl={footerLogoUrl} />

          <div className="space-y-2" style={accentColorVars(accentColor)}>
            {registerNote && <div className="text-right">{registerNote}</div>}
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={isPending || quota.checking}>
                {isPending || quota.checking ? "Submitting…" : registersForEvent ? "Submit & register" : "Submit survey"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
