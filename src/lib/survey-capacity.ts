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

/** True when a submit RPC failed because the cap was reached (the 0056 trigger's message). */
export const isSurveyClosedError = (message: string | null | undefined) =>
  !!message && message.includes("SURVEY_CLOSED");
