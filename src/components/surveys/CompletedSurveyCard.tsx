import Link from "next/link";
import { RewardPanel } from "@/components/surveys/RewardPanel";
import type { SurveyRewardOutcome } from "@/lib/survey-reward";

/**
 * What someone sees when they open a survey they have already answered — and,
 * because the survey page re-renders the moment a submit registers the
 * respondent, what they see straight after submitting: the thank-you and the
 * discount code, rendered from the database rather than from the form's own
 * (short-lived) state. A refresh, a return visit and the post-submit re-render
 * all show the same thing, code included.
 */
export function CompletedSurveyCard({
  surveyTitle,
  submittedAt,
  eventName,
  registered,
  reward,
}: {
  surveyTitle: string;
  /** Already formatted, or null. */
  submittedAt: string | null;
  eventName: string | null;
  /** Registered for the event this survey belongs to. */
  registered: boolean;
  /** Their code, or why there isn't one yet; null when there is no event. */
  reward: SurveyRewardOutcome | null;
}) {
  return (
    <div className="card mx-auto max-w-xl space-y-4 p-8 text-center" data-testid="survey-completed">
      <div className="text-[2.5em]" aria-hidden>
        🎉
      </div>
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
        Thanks — you&apos;ve completed &ldquo;{surveyTitle}&rdquo;
      </h1>
      {submittedAt && <p className="text-sm text-[var(--color-ink-soft)]">Submitted {submittedAt}.</p>}

      {registered && reward ? (
        <>
          <RewardPanel reward={reward} />
          <p className="text-sm font-medium text-[var(--color-olive-deep)]" data-testid="registered-note">
            ✓ You&apos;re registered{eventName ? ` for ${eventName}` : ""}.
          </p>
          <Link
            href={reward.status === "issued" ? "/dashboard/rewards" : "/dashboard/participations"}
            className="btn btn-primary w-full"
          >
            {reward.status === "issued" ? "View my rewards" : "View my events"}
          </Link>
        </>
      ) : eventName ? (
        <>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Your answers are in. You&apos;re not registered for {eventName} yet, so there is no discount code to show —
            check My events to register.
          </p>
          <Link href="/dashboard/participations" className="btn btn-primary w-full">
            View my events
          </Link>
        </>
      ) : (
        <Link href="/dashboard" className="btn btn-primary w-full">
          Go to my dashboard
        </Link>
      )}
    </div>
  );
}
