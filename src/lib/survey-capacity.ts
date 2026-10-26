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
  "You can still answer. Our team reviews responses that arrive after the limit, and a discount code is only issued if one is still available.";
/** Shown after an over-the-limit response is submitted. */
export const SURVEY_HELD_FOR_REVIEW_MESSAGE =
  "Your response has been recorded. As it arrived after the participant limit was reached, our team will review it before any discount code is issued.";

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
export type SurveyAvailability = "open" | "nearly_full" | "full" | "codes_out";

export const SURVEY_FILLED_MID_TITLE = "This survey has just reached its participant limit";
export const SURVEY_FILLED_MID_BODY =
  "You can still finish. Your answers will be reviewed, but a discount code isn't guaranteed.";
export const SURVEY_CODES_OUT_TITLE = "All discount codes for this survey have now been claimed";
export const SURVEY_CODES_OUT_BODY =
  "You can still finish and your answers still count, but a discount code isn't guaranteed.";
