/**
 * Plain constants shared between the client (SurveyForm.tsx renders the
 * honeypot field) and the server (survey-abuse.ts checks it). Deliberately
 * has zero imports — survey-abuse.ts itself imports `next/headers` and
 * `crypto`, which cannot be pulled into a "use client" bundle, so anything
 * a client component needs from that module lives here instead.
 */

/** Rolling-window rate-limit thresholds — see survey-abuse.ts's comment on
 *  why these are TS constants rather than a settings table for now. */
export const SURVEY_RATE_LIMITS = {
  accountShortMinutes: 10,
  accountShortMax: 5,
  accountLongMax: 20, // per rolling 24h
  ipShortMinutes: 10,
  ipShortMax: 20,
  ipLongMax: 100, // per rolling 24h
} as const;

/**
 * Hidden honeypot field name. Deliberately NOT a real HTML autocomplete
 * token (`website`, `url`, `email`, `organization`, `tel`, `address-*`,
 * `bday`, `sex`, `cc-*`, …) — using one of those would make browser autofill
 * silently fill the trap for genuine users and discard their real
 * submission. Do not rename without checking SurveyForm.tsx's matching
 * input and actions.ts's check.
 */
export const SURVEY_HONEYPOT_FIELD = "contact_reason";
