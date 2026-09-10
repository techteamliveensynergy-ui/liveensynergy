"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD, SURVEY_RATE_LIMITS } from "@/lib/survey-abuse-constants";
import { callerIpHash, screenSurveySubmission } from "@/lib/survey-abuse";
import type { SurveyQuestion } from "@/lib/types";

export interface PublicSurveyResponseState {
  error?: string;
  success?: boolean;
}

interface SubmitOutcome {
  outcome: "submitted" | "not_eligible" | "already_submitted" | "invalid";
  reason: string | null;
  response_id: string | null;
}

interface SubmissionGateResult {
  allowed: boolean;
  reason: "account" | "ip" | null;
}

/**
 * Public/anonymous-friendly twin of
 * src/app/dashboard/surveys/[templateId]/actions.ts's submitSurveyResponse()
 * — same gate order (honeypot -> rate limit -> answer validation ->
 * Turnstile -> RPC), but against survey_public_form_questions /
 * submit_public_survey_response() and returning success in-state rather than
 * redirecting, so the page can show the CTA screen in place.
 */
export async function submitPublicSurveyResponse(
  _prev: PublicSurveyResponseState,
  formData: FormData,
): Promise<PublicSurveyResponseState> {
  const supabase = await createClient();

  const templateId = String(formData.get("template_id") ?? "").trim();
  const startedAt = String(formData.get("started_at") ?? "").trim();
  if (!templateId || !startedAt) {
    return { error: "Something went wrong — please reload and try again." };
  }

  const ipHash = await callerIpHash();

  // 1. Honeypot — a filled trap reports the same success as a real
  // submission, so nothing tips off the bot operator.
  const honeypot = String(formData.get(SURVEY_HONEYPOT_FIELD) ?? "").trim();
  if (honeypot) {
    await supabase.rpc("log_survey_attempt", {
      p_template_id: templateId,
      p_ip_hash: ipHash,
      p_outcome: "honeypot",
      p_detail: null,
    });
    return { success: true };
  }

  // 2. Rate limit — per-account (if signed in) and per-IP.
  const { data: gateData, error: gateError } = await supabase.rpc("survey_submission_gate", {
    p_template_id: templateId,
    p_ip_hash: ipHash,
    p_account_short_minutes: SURVEY_RATE_LIMITS.accountShortMinutes,
    p_account_short_max: SURVEY_RATE_LIMITS.accountShortMax,
    p_account_long_max: SURVEY_RATE_LIMITS.accountLongMax,
    p_ip_short_minutes: SURVEY_RATE_LIMITS.ipShortMinutes,
    p_ip_short_max: SURVEY_RATE_LIMITS.ipShortMax,
    p_ip_long_max: SURVEY_RATE_LIMITS.ipLongMax,
  });
  if (gateError) return { error: gateError.message };
  const gate = gateData as SubmissionGateResult;
  if (!gate.allowed) {
    return { error: "Too many submission attempts. Please wait a few minutes and try again." };
  }

  let answers: SurveyAnswerDraft[];
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "[]"));
  } catch {
    return { error: "Something went wrong — please reload and try again." };
  }

  const { data: questionRows } = await supabase
    .from("survey_public_form_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");
  const questions = (questionRows ?? []) as SurveyQuestion[];
  if (questions.length === 0) {
    return { error: "This survey isn't available." };
  }

  const validationError = validateAnswers(questions, answers);
  if (validationError) return { error: validationError };

  // 3. Turnstile — the only outbound network call, so it runs last.
  const botToken = String(formData.get("cf-turnstile-response") ?? "").trim() || null;
  const botScreen = await screenSurveySubmission(botToken);
  if (!botScreen.ok) {
    await supabase.rpc("log_survey_attempt", {
      p_template_id: templateId,
      p_ip_hash: ipHash,
      p_outcome: botScreen.code === "missing" ? "captcha_missing" : "captcha_failed",
      p_detail: botScreen.detail,
    });
    return { error: "We couldn't verify your browser. Please refresh the page and try again." };
  }

  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim();
  const phoneLocal = String(formData.get("phone") ?? "").trim();
  const phone = phoneLocal ? `${phoneCountryCode}${phoneLocal}` : null;

  const { data, error } = await supabase.rpc("submit_public_survey_response", {
    p_template_id: templateId,
    p_started_at: startedAt,
    p_answers: answers,
    p_first_name: String(formData.get("first_name") ?? "").trim() || null,
    p_last_name: String(formData.get("last_name") ?? "").trim() || null,
    p_email: String(formData.get("email") ?? "").trim() || null,
    p_phone: phone,
    p_age_range: String(formData.get("age_range") ?? "").trim() || null,
    p_residency_confirmed: formData.get("residency_confirmed") === "on",
    p_consent_accepted: formData.get("consent_accepted") === "on",
  });
  if (error) return { error: error.message };

  const outcome = data as SubmitOutcome;
  if (outcome.outcome === "not_eligible") {
    return { error: "This survey isn't available." };
  }
  if (outcome.outcome === "invalid") {
    return { error: outcome.reason ?? "Please check your answers and try again." };
  }
  if (outcome.outcome === "already_submitted") {
    return { success: true };
  }

  // outcome.outcome === "submitted" — score immediately, same best-effort
  // reasoning as the authenticated action: never block the CTA on this.
  if (outcome.response_id) {
    const { error: scoreError } = await supabase.rpc("score_survey_response", {
      p_response_id: outcome.response_id,
    });
    if (scoreError) console.error("score_survey_response failed:", scoreError.message);
  }

  return { success: true };
}

export interface RegisterAfterSurveyState {
  error?: string;
}

/**
 * For a visitor who was already signed in (any pre-existing session) when
 * they answered the public survey but had no participation for this event
 * yet — registers them directly rather than routing an existing account
 * through sign-up again. Mirrors confirmRegistration()
 * (src/app/dashboard/discover/actions.ts) minus the details form, since an
 * existing audience account already has that on file.
 */
export async function registerForEventAfterSurvey(
  _prev: RegisterAfterSurveyState,
  formData: FormData,
): Promise<RegisterAfterSurveyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const sponsoredEventId = String(formData.get("sponsored_event_id") ?? "").trim();
  if (!sponsoredEventId) return { error: "Missing event." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "audience") {
    return { error: "Sign in with an audience account to register for events." };
  }

  const { error } = await supabase.from("participations").insert({
    sponsored_event_id: sponsoredEventId,
    audience_profile_id: user.id,
    status: "registered",
    terms_accepted_at: new Date().toISOString(),
  });
  // 23505 = already registered — treat as success, same as confirmRegistration().
  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  revalidatePath("/dashboard/participations");
  redirect("/dashboard/participations?notice=registered");
}
