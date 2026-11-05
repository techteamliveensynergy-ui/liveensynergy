/**
 * Confirming the email address before a survey (client test, 4 Nov: "I was able
 * to fill out a survey without confirming the email first"; migration 0108).
 *
 * Plain module so the survey form (a client component) and the server actions
 * share one wording and one way of recognising the database's refusal.
 */

/** What a respondent is told if a submit reaches the database unverified. */
export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Please confirm your email address first. We've sent you a link — open it, then come back and press Submit.";

/** True when an insert failed because the account's email isn't verified (0108's trigger). */
export const isEmailNotVerifiedError = (message: string | null | undefined) =>
  !!message && message.includes("EMAIL_NOT_VERIFIED");

/** How often the "check your inbox" step asks whether the link has been opened. */
export const VERIFY_POLL_MS = 5000;
