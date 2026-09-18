"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { QuestionMedia } from "@/components/surveys/QuestionMedia";
import { accentColorVars, typographyVars, type SurveyTypography } from "@/lib/survey-media";
import type { SurveyMediaType } from "@/lib/types";

export interface SurveyConsent {
  consentAccepted: boolean;
  residencyConfirmed: boolean;
}

/**
 * The survey's own first screen — welcome message + terms agreement + a
 * "Start survey" button — shown before any contact-capture fields or
 * questions (17 Sep standup). Shared by the public anonymous form, the
 * authenticated dashboard form and the admin preview, so all three present
 * the same gate. It is NOT itself a <form> and must not submit one — it
 * calls onStart() once the visitor has agreed, and the caller decides what
 * stage comes next.
 */
export function SurveyIntroGate({
  title,
  introMessage,
  coverMediaUrl,
  coverMediaType,
  accentColor,
  footer,
  requireResidency,
  onStart,
  startLabel = "Start survey",
  typography,
}: {
  /** Optional — every call site already shows the survey title elsewhere on
   *  the page, so this is only for a context that doesn't. */
  title?: string;
  introMessage: string | null | undefined;
  coverMediaUrl?: string | null;
  coverMediaType?: SurveyMediaType | null;
  accentColor?: string | null;
  footer?: ReactNode;
  /** false for an already-registered/signed-in respondent — residency and
   *  age were already taken at onboarding, so re-asking reads as a mistake. */
  requireResidency: boolean;
  onStart: (consent: SurveyConsent) => void;
  startLabel?: string;
  typography?: SurveyTypography;
}) {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [residencyConfirmed, setResidencyConfirmed] = useState(false);

  const canStart = consentAccepted && (!requireResidency || residencyConfirmed);

  return (
    <div
      className="survey-scope card space-y-4 p-8 text-center"
      style={typographyVars(typography ?? {})}
    >
      {coverMediaUrl && (
        <QuestionMedia config={{ media_url: coverMediaUrl, media_type: coverMediaType ?? "image" }} />
      )}
      {title && (
        <h1 className="font-display text-[1.5em] font-semibold text-[var(--survey-question-color,var(--color-ink))]">
          {title}
        </h1>
      )}
      <p className="text-[0.875em] leading-relaxed text-[var(--survey-body-color,var(--color-ink-soft))]">
        {introMessage ?? "Thanks for taking part — a few quick questions before we get started."}
      </p>

      <div className="space-y-3 text-left">
        {requireResidency && (
          <label className="flex items-start gap-2.5 text-[0.875em] text-[var(--survey-body-color,var(--color-ink))]">
            <input
              type="checkbox"
              checked={residencyConfirmed}
              onChange={(e) => setResidencyConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>I confirm I&apos;m 18 or over and a UK resident.</span>
          </label>
        )}

        <label className="flex items-start gap-2.5 text-[0.875em] text-[var(--survey-body-color,var(--color-ink))]">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
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
            .
          </span>
        </label>
      </div>

      <div style={accentColorVars(accentColor)}>
        <button
          type="button"
          className="btn btn-primary mt-2 w-full"
          disabled={!canStart}
          onClick={() => onStart({ consentAccepted, residencyConfirmed })}
        >
          {startLabel}
        </button>
      </div>

      {footer}
    </div>
  );
}
