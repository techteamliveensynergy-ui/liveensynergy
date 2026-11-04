import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Survey response cap (GitHub #8, migration 0056). A survey stops taking
 * responses at expected participants + buffer; the database enforces it on
 * insert, and pages check first so respondents see "closed" instead of a form
 * they can't submit.
 */

export const SURVEY_CLOSED_TITLE = "This survey has now closed";
export const SURVEY_CLOSED_BODY =
  "Thank you for your interest — we've received all the responses we need for this survey.";

export interface SurveyCapacity {
  response_limit: number | null;
  responses: number;
  is_full: boolean;
}

export async function surveyCapacity(
  supabase: SupabaseClient,
  templateId: string,
): Promise<SurveyCapacity | null> {
  const { data } = await supabase.rpc("survey_capacity", { p_template_id: templateId });
  return ((data ?? []) as SurveyCapacity[])[0] ?? null;
}

/**
 * 19 Oct standup (GitHub #34, migration 0083): the cap no longer closes a
 * survey. At 90% of the expected participants respondents are warned that
 * codes may run out; past the cap they can still answer, and the response
 * waits in the admin review queue instead of issuing a code automatically.
 */
export const SURVEY_NEARLY_FULL_TITLE = "Places are filling up";
export const SURVEY_NEARLY_FULL_BODY =
  "This survey has almost reached the number of participants it needs, so discount codes may run out. You can still take part.";
export const SURVEY_OVER_CAPACITY_TITLE = "This survey has reached its participant limit";
export const SURVEY_OVER_CAPACITY_BODY =
  "100% of the quota has been completed and the participant limit has been reached, so we can't guarantee a discount code. You're welcome to fill the survey in at your own discretion — our team reviews responses that arrive now, and a code is only issued if one is still available.";
/** Shown after an over-the-limit response is submitted. */
export const SURVEY_HELD_FOR_REVIEW_MESSAGE =
  "Your response has been recorded. As it arrived after the participant limit was reached, our team will review it before any discount code is issued.";

/**
 * Shown when the quality check did not pass the response outright (held or
 * rejected). Deliberately identical for both and silent on score, signals or
 * thresholds, so respondents can't learn the rules (M-06).
 */
export const SURVEY_UNDER_REVIEW_MESSAGE =
  "Thanks - your response has been received and is being reviewed. Any reward depends on it passing review.";
/** Shown when the response passed the quality check at submit time. */
export const SURVEY_RECEIVED_MESSAGE = "Thanks - your survey response has been received.";

/**
 * 2 Nov standup follow-up: the QUOTA stage. At 100% of the expected
 * participants the survey is still open (the buffer — `response_buffer_pct`,
 * 10% by default — keeps taking responses and processing them normally), but a
 * discount code can't be promised any more. The page says so (CapacityNotice),
 * and the submit step asks the respondent to confirm (SubmitQuotaDialog).
 * Past the buffer, responses are held for review (0083) — SURVEY_OVER_CAPACITY_*.
 */
export const SURVEY_QUOTA_TITLE = "The participant quota has been filled";
export const SURVEY_QUOTA_BODY =
  "100% of the quota has been completed, so we can't guarantee a discount code now. If someone cancels you may still get one, so you're welcome to fill the survey in at your own discretion.";
/** The pop-up shown when a respondent submits at or past the quota. */
export const SURVEY_SUBMIT_QUOTA_TITLE = "The quota is full — a discount code isn't guaranteed";
export const SURVEY_SUBMIT_QUOTA_BODY =
  "100% of this survey's quota has been completed, so we can't guarantee you a discount code. You might still get one if there are cancellations. Do you still want to submit?";
export const SURVEY_SUBMIT_CODES_OUT_TITLE = "All discount codes have been claimed";
export const SURVEY_SUBMIT_CODES_OUT_BODY =
  "Every discount code for this survey has now been claimed, so we can't guarantee you one. Your answers still count. Do you still want to submit?";
export const SURVEY_SUBMIT_CONFIRM_LABEL = "Submit anyway";
export const SURVEY_SUBMIT_CANCEL_LABEL = "Go back";

export interface SurveyCapacityState {
  expected_participants: number | null;
  response_limit: number | null;
  responses: number;
  nearly_full: boolean;
  is_full: boolean;
}

/**
 * Capacity for a survey page: the 0083 RPC when it exists, otherwise the
 * 0056 one (no warning, and `is_full` then means the database will still
 * refuse the submission — callers keep the "closed" screen for that case
 * via `refusesWhenFull`).
 */
export async function surveyCapacityState(
  supabase: SupabaseClient,
  templateId: string,
): Promise<(SurveyCapacityState & { refusesWhenFull: boolean }) | null> {
  const { data, error } = await supabase.rpc("survey_capacity_state", { p_template_id: templateId });
  if (!error) {
    const row = ((data ?? []) as SurveyCapacityState[])[0];
    return row ? { ...row, refusesWhenFull: false } : null;
  }
  const legacy = await surveyCapacity(supabase, templateId);
  if (!legacy) return null;
  return {
    expected_participants: null,
    response_limit: legacy.response_limit,
    responses: legacy.responses,
    nearly_full: false,
    is_full: legacy.is_full,
    refusesWhenFull: true,
  };
}

/** True when a submit RPC failed because the cap was reached (the 0056 trigger's message). */
export const isSurveyClosedError = (message: string | null | undefined) =>
  !!message && message.includes("SURVEY_CLOSED");

/**
 * Mid-survey re-check (GitHub #53, migration 0088). The page load shows
 * CapacityNotice; while someone moves through a stepped survey the form
 * asks again and, if the survey filled up or the codes ran out since,
 * shows one of these. Advice only — the server still decides at submit.
 */
export type SurveyAvailability = "open" | "nearly_full" | "quota_reached" | "full" | "codes_out";

export const SURVEY_FILLED_MID_TITLE = "This survey has just reached its participant limit";
export const SURVEY_FILLED_MID_BODY =
  "You can still finish. Your answers will be reviewed, but a discount code isn't guaranteed.";
export const SURVEY_QUOTA_MID_TITLE = "This survey's participant quota has just been filled";
export const SURVEY_QUOTA_MID_BODY =
  "100% of the quota has been completed, so we can't guarantee a discount code now. You may still get one if there are cancellations — you're welcome to finish at your own discretion.";
export const SURVEY_CODES_OUT_TITLE = "All discount codes for this survey have now been claimed";
export const SURVEY_CODES_OUT_BODY =
  "You can still finish and your answers still count, but a discount code isn't guaranteed.";

/**
 * Has the survey reached 100% of its expected participants (or gone past the
 * buffer)? Computed from the counts the capacity RPC already returns; a survey
 * with no expected number never reaches a quota.
 */
export function atQuota(
  c: Pick<SurveyCapacityState, "expected_participants" | "responses" | "is_full"> | null | undefined,
): boolean {
  if (!c) return false;
  if (c.is_full) return true;
  return c.expected_participants != null && c.responses >= c.expected_participants;
}

/** At the quota but still inside the buffer: the new stage between 90% and the limit. */
export function quotaFilledOpen(
  c: Pick<SurveyCapacityState, "expected_participants" | "responses" | "is_full"> | null | undefined,
): boolean {
  return atQuota(c) && !c?.is_full;
}

/** Availability states after which the submit step asks the respondent to confirm. */
export const SUBMIT_CONFIRM_STATES: readonly SurveyAvailability[] = ["quota_reached", "full", "codes_out"];
