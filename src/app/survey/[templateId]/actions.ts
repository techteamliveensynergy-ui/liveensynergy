"use server";

import { isSurveyClosedError, SURVEY_CLOSED_BODY, SURVEY_CLOSED_TITLE } from "@/lib/survey-capacity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { TERMS_VERSION } from "@/lib/terms";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD, SURVEY_RATE_LIMITS } from "@/lib/survey-abuse-constants";
import { callerIpHash, screenSurveySubmission } from "@/lib/survey-abuse";
import type { SurveyQuestion } from "@/lib/types";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

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
  if (error) {
    if (isSurveyClosedError(error.message)) {
      return { error: `${SURVEY_CLOSED_TITLE}. ${SURVEY_CLOSED_BODY}` };
    }
    return { error: error.message };
  }

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

    // Best-effort in-app nudge for a signed-in respondent (0043) — never
    // blocks the CTA. Writes email_outbox only (never drained, per
    // CLAUDE.md); the actually-delivered "set your password" email, if any,
    // is sent separately by startSurveyAccount() below.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: tpl } = await supabase
        .from("survey_templates")
        .select("title")
        .eq("id", templateId)
        .maybeSingle();
      await notify({
        eventKey: "survey.completed",
        recipientProfileId: user.id,
        link: "/onboarding/audience",
        variables: { survey_title: tpl?.title ?? "the survey" },
      });
    }
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
    .select("role, onboarding_completed")
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
  // A freshly-created (0043) or otherwise not-yet-onboarded account would
  // have this redirect silently swallowed by dashboard/layout.tsx's own
  // onboarding_completed guard, which redirects to /onboarding/[role]
  // first and drops the ?notice= query string — send them there directly
  // instead so the notice survives.
  redirect(
    profile.onboarding_completed
      ? "/dashboard/participations?notice=registered"
      : "/onboarding/audience?notice=registered",
  );
}

export interface SurveyAccountState {
  error?: string;
  /** Set when the email already has an account — we can't auto-sign them in
   *  (their real password is unknown to us), so a real password-reset email
   *  has been sent instead and the UI should offer to continue without an
   *  account rather than block. A successful new-account call never reaches
   *  this — it redirect()s straight back into the authenticated survey. */
  alreadyRegistered?: boolean;
}

/**
 * The "different approach for new users" half of the 17 Sep standup ask.
 * Creates a real, pre-confirmed account for a brand-new respondent the
 * instant they give their name + email (no waiting on an email click to
 * keep answering), signs them in immediately in this same request, and
 * separately emails them a real password-reset link for setting a
 * memorable password later. Reuses signUp()'s exact metadata contract
 * (src/app/auth/actions.ts) — role/terms/pending_event_reference — so
 * handle_new_user() and registerPendingEvent() need no changes.
 */
export async function startSurveyAccount(
  _prev: SurveyAccountState,
  formData: FormData,
): Promise<SurveyAccountState> {
  const supabase = await createClient();

  const templateId = String(formData.get("template_id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const eventReference = String(formData.get("event_reference") ?? "").trim() || null;
  const consentAccepted = formData.get("consent_accepted") === "on";
  const residencyConfirmed = formData.get("residency_confirmed") === "on";

  if (!templateId || !firstName || !lastName || !email) {
    return { error: "Please fill in your name and email." };
  }
  if (!consentAccepted || !residencyConfirmed) {
    return { error: "Please confirm residency and accept the Terms & Conditions first." };
  }
  // A controlled, readable failure instead of a raw crash deep inside
  // @supabase/supabase-js's createClient() guard — see src/lib/supabase/admin.ts.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[startSurveyAccount] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { error: "Account creation isn't available right now. Please try again shortly." };
  }

  // Same rate-limit gate submitPublicSurveyResponse uses — this action calls
  // the Admin API, which bypasses Supabase's own sign-up throttling, so
  // without this it would be an unrated account-creation mailer.
  const ipHash = await callerIpHash();
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
  if (!(gateData as { allowed: boolean }).allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Never returned to the client, never logged — spent immediately below to
  // mint a session, then never needed again (the respondent sets their own
  // password from the emailed reset link).
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `${firstName} ${lastName}`.trim(),
      role: "audience",
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      survey_account: true,
      ...(eventReference ? { pending_event_reference: eventReference } : {}),
    },
  });

  if (createError) {
    // Duplicate email — we don't know their existing password, so we can't
    // sign them in. Send a real reset-password email (same call shape as
    // requestPasswordReset()) whose link also lands them back on this
    // survey, authenticated, instead of just erroring out.
    const code = (createError as { code?: string }).code;
    const alreadyRegistered =
      code === "email_exists" || /already.*registered/i.test(createError.message);
    if (alreadyRegistered) {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl()}/auth/callback?next=/survey/${templateId}`,
      });
      return { alreadyRegistered: true };
    }
    return { error: createError.message };
  }
  if (!created.user) {
    return { error: "Something went wrong creating your account. Please try again." };
  }

  // Sign in immediately with the password we just set — works because
  // email_confirm: true bypassed the project's own confirmation requirement.
  // This is what lets the respondent keep answering with no wait at all.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { error: "Your account was created, but we couldn't sign you in. Please try signing in manually." };
  }

  // Fire-and-forget — the real, delivered "set your password" email. Never
  // fails the flow: they're already signed in and can finish the survey
  // regardless of whether this send succeeds.
  await supabase.auth
    .resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/auth/reset-password`,
    })
    .catch((err) => console.error("[startSurveyAccount] reset email failed", err));

  revalidatePath(`/survey/${templateId}`);
  redirect(`/survey/${templateId}`);
}
