/**
 * What a respondent sees about their discount code straight after submitting a
 * public, event-linked survey (client test, 4 Nov: "the discount code did not
 * pop up after finishing the survey").
 *
 * Plain module — no server-only imports — so the thank-you screen (a client
 * component) can use the types and wording, and the server action can build the
 * value.
 *
 * Deliberately says nothing about scores, signals or thresholds (M-06): a
 * response that did not pass the quality check reads exactly like one held for
 * any other reason.
 */

/** Why a code isn't on screen yet. */
export type SurveyRewardPendingReason =
  /** The quality check didn't pass the response outright (or scoring failed). */
  | "review"
  /** Submitted past the participant limit: an admin decides first (0083). */
  | "held"
  /** The organiser hasn't set up / confirmed the event's codes yet. */
  | "not_ready"
  /** Every code (or the tier's cap) has been claimed. */
  | "no_codes"
  /** The event isn't open for registration. */
  | "not_open"
  /** The event was full, so they joined its waitlist (0114). */
  | "waitlisted"
  /** Registered and nothing is wrong that we can name — the email follows. */
  | "unknown";

export type SurveyRewardOutcome =
  | {
      status: "issued";
      code: string;
      valueLabel: string | null;
      platform: string | null;
      url: string | null;
      instructions: string | null;
      /** ISO timestamp, or null for no expiry. */
      expiresAt: string | null;
      /** One code shared by everyone (pattern A/B), not one per person. */
      shared: boolean;
    }
  | { status: "pending"; reason: SurveyRewardPendingReason };

export const REWARD_PENDING_COPY: Record<SurveyRewardPendingReason, { title: string; body: string }> = {
  review: {
    title: "Your response is under review",
    body: "Thanks - we've received your response and our team is taking a look at it. We'll get back to you shortly: if everything is fine, your discount code will be emailed to you and will appear under My rewards. You're registered for the event in the meantime, and there's nothing you need to do.",
  },
  held: {
    title: "Your response is under review",
    body: "Thanks - we've received your response. As it arrived after the participant limit was reached, our team will review it before any discount code is issued. We'll get back to you shortly by email, and any code will appear under My rewards. You're registered for the event.",
  },
  not_ready: {
    title: "Your discount code isn't ready yet",
    body: "You're registered, and your answers are in. The organiser is still setting up the discount codes for this event. We'll email your code as soon as it's available, and it will appear under My rewards.",
  },
  no_codes: {
    title: "All discount codes have been claimed",
    body: "You're registered and your answers still count, but every code for this event has now been claimed, so we can't guarantee you one.",
  },
  not_open: {
    title: "Registration isn't open yet",
    body: "Your answers are in, but registration for this event hasn't opened yet. We'll let you know when it does.",
  },
  waitlisted: {
    title: "You're on the waitlist",
    body: "Your answers are in, but the event is full, so we've put you on its waitlist. If a place opens up it's yours automatically — we'll email you, and if your response passed, your discount code follows straight away.",
  },
  unknown: {
    title: "Your discount code is on its way",
    body: "You're registered. We'll email your code as soon as it's issued, and it will appear under My rewards.",
  },
};

/** The sentence beside Submit that makes the registration an informed act. */
export function registerNoteFor(eventName: string): string {
  return `Submitting also registers you for ${eventName}, so your discount code can be issued.`;
}
