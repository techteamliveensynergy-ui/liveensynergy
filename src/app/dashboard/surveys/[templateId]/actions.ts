"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSurveyClosedError, surveyCapacityState } from "@/lib/survey-capacity";
import { isEmailNotVerifiedError } from "@/lib/survey-verify";
import { isSurveyNotOpenError, SURVEY_NOT_OPEN_TITLE, surveyNotOpenBody } from "@/lib/campaign-opening";
import { requireRole } from "@/lib/profile";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD, SURVEY_RATE_LIMITS } from "@/lib/survey-abuse-constants";
import {
  BOT_SCREEN_UNAVAILABLE_MESSAGE,
  botScreenUnavailable,
  callerIpHash,
  screenSurveySubmission,
} from "@/lib/survey-abuse";
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
  prev: SurveyResponseState,
  formData: FormData,
): Promise<SurveyResponseState> {
  // M-07: an unexpected throw must surface as a visible error (answers kept).
  try {
    return await submitSurveyResponseInner(prev, formData);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    console.error("submitSurveyResponse threw:", e);
    return { error: SAVE_FAILED_MESSAGE };
  }
}

const SAVE_FAILED_MESSAGE =
  "Something went wrong and we couldn't confirm your response was saved. Your answers are still here — please press Submit again.";

/** Next's redirect()/notFound() work by throwing; those must pass through. */
function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

async function submitSurveyResponseInner(
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

  // 1. Honeypot. Every caller here is a signed-in, verified audience account
  // (requireRole above), and a browser's autofill can fill an off-screen field,
  // so a filled trap is NOT conclusive: silently dropping the response while
  // showing "received" lost a real tester's answers on 5 Nov. The hit is still
  // logged for the audit, then the submission is processed normally — the rate
  // limit and the bot check below still apply.
  const honeypot = String(formData.get(SURVEY_HONEYPOT_FIELD) ?? "").trim();
  if (honeypot) {
    await supabase.rpc("log_survey_attempt", {
      p_template_id: templateId,
      p_ip_hash: ipHash,
      p_outcome: "honeypot",
      p_detail: null,
    });
  }

  // A deployment missing its bot-check keys can't accept anything — say so
  // plainly, log it once for the audit trail, and don't charge the attempt
  // to the respondent's rate limit.
  if (botScreenUnavailable()) {
    console.error("[survey] Turnstile keys missing in production — submissions refused");
    await supabase.rpc("log_survey_attempt", {
      p_template_id: templateId,
      p_ip_hash: ipHash,
      p_outcome: "captcha_missing",
      p_detail: "unconfigured",
    });
    return { error: BOT_SCREEN_UNAVAILABLE_MESSAGE };
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
    return {
      error:
        "We couldn't verify your browser. Your answers are still here — wait a few seconds and press Submit again.",
    };
  }

  // Past the limit the response is accepted but held for an admin (0083), so
  // the thank-you says so. Read just before submitting: a response that tips
  // the survey over the limit by a hair gets the plain thank-you, and is
  // still held correctly by the database.
  const heldForReview = Boolean((await surveyCapacityState(supabase, templateId))?.is_full);

  const { data, error } = await supabase.rpc("submit_survey_response", {
    p_template_id: templateId,
    p_started_at: startedAt,
    p_answers: answers,
  });
  if (error) {
    if (isSurveyClosedError(error.message)) redirect("/dashboard/participations?notice=survey-closed");
    if (isSurveyNotOpenError(error.message)) return { error: `${SURVEY_NOT_OPEN_TITLE}. ${surveyNotOpenBody(null)}` };
    // 0108: an unverified account can't submit. The middleware already keeps such an
    // account out of /dashboard/surveys, so this is the backstop — the same screen.
    if (isEmailNotVerifiedError(error.message)) redirect("/dashboard?verify=required");
    return { error: error.message };
  }

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
  // M-07: success is only reported once the database has handed back a
  // response id. A "submitted" outcome without one means nothing we can point
  // at was saved, so it must surface as an error, never a thank-you.
  if (!outcome.response_id) {
    console.error("submit_survey_response returned submitted without a response_id");
    return { error: "We couldn't save your response. Your answers are still here — please press Submit again." };
  }

  // Score immediately so the review queue and any reward gate see a decided
  // status right away. A scoring failure doesn't fail the submission (the
  // response is saved and can be scored later from the review queue), but its
  // outcome decides the wording: we only say "received" when it passed, and
  // never expose the score or why (M-06).
  let qualityStatus: string | null = null;
  const { data: scoreData, error: scoreError } = await supabase.rpc("score_survey_response", {
    p_response_id: outcome.response_id,
  });
  if (scoreError) {
    console.error("score_survey_response failed:", scoreError.message);
  } else {
    const scored = scoreData as { outcome?: string; quality_status?: string } | null;
    if (scored?.outcome === "not_found") {
      // The row we were just told about isn't visible: treat as not saved.
      console.error("score_survey_response: response not found after submit", outcome.response_id);
      return { error: "We couldn't confirm your response was saved. Please press Submit again." };
    }
    qualityStatus = scored?.quality_status ?? null;
  }
  // The intro gate's Terms & Privacy tick (0080). Never blocks the redirect.
  if (formData.get("consent_accepted") === "on") {
    const { error: consentError } = await supabase.rpc("record_survey_consent", { p_template_id: templateId });
    if (consentError) console.error("record_survey_consent failed:", consentError.message);
  }

  revalidatePath("/dashboard/participations");
  const notice = heldForReview
    ? "survey-held"
    : qualityStatus === "pass"
      ? "survey-submitted"
      : "survey-review";
  redirect(`/dashboard/participations?notice=${notice}`);
}
