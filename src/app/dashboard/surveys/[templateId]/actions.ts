"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD, SURVEY_RATE_LIMITS } from "@/lib/survey-abuse-constants";
import { callerIpHash, screenSurveySubmission } from "@/lib/survey-abuse";
import type { SurveyQuestion } from "@/lib/types";

export interface SurveyResponseState {
  error?: string;
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

export async function submitSurveyResponse(
  _prev: SurveyResponseState,
  formData: FormData,
): Promise<SurveyResponseState> {
  const { supabase } = await requireRole(["audience"]);

  const templateId = String(formData.get("template_id") ?? "").trim();
  const startedAt = String(formData.get("started_at") ?? "").trim();
  if (!templateId || !startedAt) {
    return { error: "Something went wrong — please reload and try again." };
  }

  const ipHash = await callerIpHash();

  // Gate order, cheapest/most-conclusive first (build plan §03 stages 1-2):
  // honeypot (free, no I/O) -> rate limit (one RPC) -> answer validation ->
  // Turnstile (the only outbound network call in the whole pipeline) ->
  // submit_survey_response().

  // 1. Honeypot. A filled trap is conclusive, so the response looks
  // identical to a real success — nothing tips off the bot operator. The
  // redirect must stay outside any try/catch: it works by throwing, and
  // swallowing that would turn the fake success into a hang.
  const honeypot = String(formData.get(SURVEY_HONEYPOT_FIELD) ?? "").trim();
  if (honeypot) {
    await supabase.rpc("log_survey_attempt", {
      p_template_id: templateId,
      p_ip_hash: ipHash,
      p_outcome: "honeypot",
      p_detail: null,
    });
    revalidatePath("/dashboard/participations");
    redirect("/dashboard/participations?notice=survey-submitted");
  }

  // 2. Rate limit — per-account and per-IP, each over a short burst window
  // and a rolling 24h cap. Deliberately loose on the IP side: shared venue
  // wifi/CGNAT means several genuine attendees can share one address.
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

  // Cheap pre-check against the same questions the form rendered.
  // submit_survey_response() (migration 0033) is the authoritative
  // validator — this action, like the browser, can be bypassed.
  const { data: questionRows } = await supabase
    .from("survey_form_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");
  const questions = (questionRows ?? []) as SurveyQuestion[];
  if (questions.length === 0) {
    return { error: "This survey isn't available to you." };
  }

  const validationError = validateAnswers(questions, answers);
  if (validationError) return { error: validationError };

  // 3. Turnstile — the only outbound network call, so it runs last: a
  // token-less flood shouldn't make us hammer Cloudflare's siteverify per
  // bogus request.
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

  const { data, error } = await supabase.rpc("submit_survey_response", {
    p_template_id: templateId,
    p_started_at: startedAt,
    p_answers: answers,
  });
  if (error) return { error: error.message };

  const outcome = data as SubmitOutcome;
  if (outcome.outcome === "not_eligible") {
    return { error: "This survey isn't available to you." };
  }
  if (outcome.outcome === "invalid") {
    return { error: outcome.reason ?? "Please check your answers and try again." };
  }
  if (outcome.outcome === "already_submitted") {
    redirect("/dashboard/participations?notice=survey-already-submitted");
  }

  // outcome.outcome === "submitted"
  // TODO(survey-quality): step 5 scores the response here using
  // outcome.response_id, writing quality_score/quality_status.

  revalidatePath("/dashboard/participations");
  redirect("/dashboard/participations?notice=survey-submitted");
}
