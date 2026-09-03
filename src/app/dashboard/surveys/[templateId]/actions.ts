"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import type { SurveyQuestion } from "@/lib/types";

export interface SurveyResponseState {
  error?: string;
}

interface SubmitOutcome {
  outcome: "submitted" | "not_eligible" | "already_submitted" | "invalid";
  reason: string | null;
  response_id: string | null;
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

  // TODO(survey-stage-1): Cloudflare Turnstile token verification, honeypot
  // discard and per-account/per-IP rate limiting go here, before the RPC
  // (build plan §03 stages 1-2). Step 3.
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
