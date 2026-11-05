"use server";

import { atQuota, isSurveyClosedError, SURVEY_CLOSED_BODY, SURVEY_CLOSED_TITLE, surveyCapacityState, type SurveyAvailability } from "@/lib/survey-capacity";
import { isRegistrationNotOpenError, isSurveyNotOpenError, REGISTRATION_NOT_OPEN_MESSAGE, SURVEY_NOT_OPEN_TITLE, surveyNotOpenBody } from "@/lib/campaign-opening";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { TERMS_VERSION } from "@/lib/terms";
import { validateAnswers, type SurveyAnswerDraft } from "@/lib/surveys";
import { SURVEY_HONEYPOT_FIELD, SURVEY_RATE_LIMITS } from "@/lib/survey-abuse-constants";
import {
  BOT_SCREEN_UNAVAILABLE_MESSAGE,
  botScreenUnavailable,
  callerIpHash,
  screenSurveySubmission,
} from "@/lib/survey-abuse";
import type { SurveyQuestion } from "@/lib/types";
import type { SurveyRewardOutcome } from "@/lib/survey-reward";
import { EMAIL_NOT_VERIFIED_MESSAGE, isEmailNotVerifiedError } from "@/lib/survey-verify";
import { siteUrl } from "@/lib/site-url";
import { sendVerificationEmail } from "@/lib/email-verification";
import { ROLE_LABELS } from "@/lib/constants";

export interface PublicSurveyResponseState {
  error?: string;
  success?: boolean;
  /** Submitted past the participant limit: held for an admin (#34, 0083). */
  heldForReview?: boolean;
  /** The quality check did not pass the response outright (held or rejected).
   *  Never carries the score or reason (M-06). */
  underReview?: boolean;
  /** The respondent is now registered for the survey's event (the submit
   *  registers them — see registerAndRewardAfterSubmit). */
  registered?: boolean;
  /** Their discount code, or why there isn't one yet. Absent when the survey
   *  has no event or the respondent isn't a signed-in audience account. */
  reward?: SurveyRewardOutcome;
  /** The database refused because the account's email isn't verified (0108):
   *  the form returns to its "confirm your email" step with answers intact. */
  needsEmailVerification?: boolean;
  /** The session ended (or never existed): a response needs an account, so the
   *  form offers sign-in in a new tab rather than losing the answers. */
  needsSignIn?: boolean;
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
  prev: PublicSurveyResponseState,
  formData: FormData,
): Promise<PublicSurveyResponseState> {
  // M-07: an unexpected throw must surface as a visible error (answers kept),
  // never as an unhandled failure that leaves the respondent guessing.
  try {
    return await submitPublicSurveyResponseInner(prev, formData);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    console.error("submitPublicSurveyResponse threw:", e);
    return { error: SAVE_FAILED_MESSAGE };
  }
}

const SIGN_IN_REQUIRED_MESSAGE =
  "You need to be signed in to submit this survey. Your answers are still on this page — sign in, then press Submit again.";

const SAVE_FAILED_MESSAGE =
  "Something went wrong and we couldn't confirm your response was saved. Your answers are still here — please press Submit again.";

/** Next's redirect()/notFound() work by throwing; those must pass through. */
function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

async function submitPublicSurveyResponseInner(
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

  // A response belongs to an account — register or sign in first (client note,
  // 4 Nov; the database refuses it too, 0109). Checked before anything is
  // charged to the rate limit or sent to Turnstile.
  const {
    data: { user: submitter },
  } = await supabase.auth.getUser();
  if (!submitter) {
    return { error: SIGN_IN_REQUIRED_MESSAGE, needsSignIn: true };
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
    return {
      error:
        "We couldn't verify your browser. Your answers are still here — wait a few seconds and press Submit again.",
    };
  }

  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim();
  const phoneLocal = String(formData.get("phone") ?? "").trim();
  const phone = phoneLocal ? `${phoneCountryCode}${phoneLocal}` : null;

  // Past the limit the response is accepted but held for an admin (0083).
  const heldForReview = Boolean((await surveyCapacityState(supabase, templateId))?.is_full);

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
    if (isSurveyNotOpenError(error.message)) {
      return { error: `${SURVEY_NOT_OPEN_TITLE}. ${surveyNotOpenBody(null)}` };
    }
    if (isEmailNotVerifiedError(error.message)) {
      return { error: EMAIL_NOT_VERIFIED_MESSAGE, needsEmailVerification: true };
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
    // Nothing new was saved, so don't show the thank-you as if it were.
    return { error: "You've already completed this survey, so we haven't recorded a second response." };
  }

  // outcome.outcome === "submitted" — M-07: success only with a confirmed
  // response id from the database.
  if (!outcome.response_id) {
    console.error("submit_public_survey_response returned submitted without a response_id");
    return { error: "We couldn't save your response. Your answers are still here — please press Submit again." };
  }

  // Score immediately. A scoring failure doesn't fail the (already saved)
  // submission, but the outcome picks the wording (M-06).
  let underReview = true; // unknown or not-passed => don't promise acceptance
  {
    const { data: scoreData, error: scoreError } = await supabase.rpc("score_survey_response", {
      p_response_id: outcome.response_id,
    });
    if (scoreError) {
      console.error("score_survey_response failed:", scoreError.message);
    } else {
      const scored = scoreData as { quality_status?: string } | null;
      underReview = scored?.quality_status !== "pass";
    }

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

  // Registering is what lets a code be issued (a participation must exist), and
  // the code is what the respondent is waiting to see.
  const followUp = await registerAndRewardAfterSubmit(
    supabase,
    templateId,
    String(formData.get("register_event_id") ?? "").trim(),
    { underReview, heldForReview },
  );

  return { success: true, heldForReview, underReview, ...followUp };
}

/**
 * After a public, event-linked survey is saved and scored: register the signed-in
 * audience respondent for the event, then report their code (or why there isn't
 * one yet).
 *
 * Why this exists (client test, 4 Nov): the register step used to be a separate
 * button on the thank-you screen, and for an account the survey itself had just
 * created it never appeared (the password form took its place, and the
 * `survey_account` flag that chose it is never cleared). So the person was never
 * registered, no code was ever issued (auto_issue_reward_code() needs a
 * participation, 0075), the dashboard said "no events participated", and the
 * thank-you screen had no way to show a code anyway.
 *
 * Rules:
 *  - Only when the form asked for it (`register_event_id`, which the form sends
 *    only alongside the sentence "Submitting also registers you for …") and
 *    that event is the one this survey's campaign is actually running — the form
 *    naming an event is not enough to register someone for it.
 *  - Only an audience account. A brand or artist taking the link isn't registered.
 *  - Registration also records the event-terms acceptance, as the old Register
 *    button did: it follows an explicit, labelled Submit.
 *  - Registering fires the existing participations trigger, which issues the code
 *    if the response already passed (0075) — nothing here issues a code.
 *  - NEVER throws and never undoes the saved response: any failure degrades to
 *    "we'll email your code" wording.
 */
async function registerAndRewardAfterSubmit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  requestedEventId: string,
  flags: { underReview: boolean; heldForReview: boolean },
): Promise<{ registered?: boolean; reward?: SurveyRewardOutcome }> {
  if (!requestedEventId) return {};
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    if (profile?.role !== "audience") return {};

    const { data: tpl } = await supabase
      .from("survey_templates")
      .select("campaign_id")
      .eq("id", templateId)
      .maybeSingle<{ campaign_id: string | null }>();
    if (!tpl?.campaign_id) return {};

    // The same lookup the survey page uses to name the event.
    const { data: evRows } = await supabase
      .from("sponsored_events")
      .select("id, artist_profile_id, reward_codes_confirmed_at")
      .eq("campaign_id", tpl.campaign_id)
      .in("status", ["confirmed", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);
    const ev = (evRows?.[0] ?? null) as {
      id: string;
      artist_profile_id: string | null;
      reward_codes_confirmed_at: string | null;
    } | null;
    if (!ev || ev.id !== requestedEventId) return {};

    const { error: regError } = await supabase.from("participations").insert({
      sponsored_event_id: ev.id,
      audience_profile_id: user.id,
      status: "registered",
      terms_accepted_at: new Date().toISOString(),
    });
    // 23505 = already registered: fine, they may be completing a second survey.
    if (regError && regError.code !== "23505") {
      if (isRegistrationNotOpenError(regError.message)) {
        return { registered: false, reward: { status: "pending", reason: "not_open" } };
      }
      console.error("[survey] registering after submit failed:", regError.message);
      return { registered: false, reward: { status: "pending", reason: "unknown" } };
    }
    revalidatePath("/dashboard/participations");
    revalidatePath("/dashboard/rewards");

    // The code, if the registration trigger just issued one (or it already existed).
    const { data: part } = await supabase
      .from("participations")
      .select("id")
      .eq("sponsored_event_id", ev.id)
      .eq("audience_profile_id", user.id)
      .maybeSingle<{ id: string }>();
    if (part) {
      const { data: codeRow } = await supabase
        .from("reward_codes")
        .select("code, value_label, redemption_platform, redemption_url, redemption_instructions, expires_at, is_shared")
        .eq("participation_id", part.id)
        .neq("status", "void")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          code: string;
          value_label: string | null;
          redemption_platform: string | null;
          redemption_url: string | null;
          redemption_instructions: string | null;
          expires_at: string | null;
          is_shared: boolean;
        }>();
      if (codeRow) {
        return {
          registered: true,
          reward: {
            status: "issued",
            code: codeRow.code,
            valueLabel: codeRow.value_label,
            platform: codeRow.redemption_platform,
            url: codeRow.redemption_url,
            instructions: codeRow.redemption_instructions,
            expiresAt: codeRow.expires_at,
            shared: codeRow.is_shared,
          },
        };
      }
    }

    // No code. Say why, without revealing how the quality check works (M-06).
    if (flags.heldForReview) return { registered: true, reward: { status: "pending", reason: "held" } };
    if (flags.underReview) return { registered: true, reward: { status: "pending", reason: "review" } };
    if (ev.artist_profile_id && !ev.reward_codes_confirmed_at) {
      return { registered: true, reward: { status: "pending", reason: "not_ready" } };
    }
    const { data: codesState } = await supabase.rpc("survey_codes_state", { p_template_id: templateId });
    if (codesState === "exhausted") return { registered: true, reward: { status: "pending", reason: "no_codes" } };
    if (codesState === "none") return { registered: true, reward: { status: "pending", reason: "not_ready" } };
    return { registered: true, reward: { status: "pending", reason: "unknown" } };
  } catch (e) {
    console.error("[survey] registerAndRewardAfterSubmit threw:", e);
    return {};
  }
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
    if (isRegistrationNotOpenError(error.message)) return { error: REGISTRATION_NOT_OPEN_MESSAGE };
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
   *  (their real password is unknown to us), so the form switches to sign-in.
   *  There is no "continue without an account": a response needs one. */
  alreadyRegistered?: boolean;
  /** The account was created and signed in — the form moves straight on to
   *  the questions and refreshes its server props (FB-00032). Returned
   *  instead of redirect()ing back to this same URL: a same-page navigation
   *  keeps the client form mounted with its old state, so the button sat on
   *  "Creating your account…" and the questions never appeared. */
  created?: boolean;
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
  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim() || "+44";
  const phoneLocal = String(formData.get("phone") ?? "").replace(/[^\d]/g, "");

  if (!templateId || !firstName || !lastName || !email) {
    return { error: "Please fill in your name and email." };
  }
  // Mobile number is asked for here too (FB-00032) — an audience account is
  // one person, one number (phone_in_use, 0023), and without it a survey
  // sign-up skipped that rule until onboarding much later.
  if (phoneLocal.length < 7 || phoneLocal.length > 15) {
    return { error: "Please enter a valid mobile number." };
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

  const { data: phoneTaken } = await supabase.rpc("phone_in_use", {
    p_phone: `${phoneCountryCode}${phoneLocal}`,
    p_profile_id: null,
  });
  if (phoneTaken === true) {
    return {
      error:
        "That mobile number is already registered to another audience account. If it's yours, sign in instead — each audience member needs their own number.",
    };
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
      // Pre-fills audience onboarding later (src/app/onboarding/audience).
      phone_country_code: phoneCountryCode,
      phone: phoneLocal,
      ...(eventReference ? { pending_event_reference: eventReference } : {}),
    },
  });

  if (createError) {
    // Duplicate email — we don't know their existing password, so we can't
    // sign them in. The form switches to sign-in (password, Google, or an
    // emailed link they ask for). Nothing is emailed to the address here: the
    // person who typed it may not be its owner.
    const code = (createError as { code?: string }).code;
    const alreadyRegistered =
      code === "email_exists" || /already.*registered/i.test(createError.message);
    if (alreadyRegistered) {
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

  // Our welcome / confirm-your-email message (0074) — not Supabase's reset-
  // password email, whose link depended on Supabase's redirect settings and
  // read as "someone reset your password" (16 Oct). Its link verifies the
  // address and then asks them to choose a password (/auth/verify-email).
  // Never fails the flow: they're already signed in and can finish the survey.
  // The link returns them to this survey, signed in (client note, 4 Nov).
  await sendVerificationEmail(
    supabase,
    created.user.id,
    ROLE_LABELS.audience,
    UUID_RE.test(templateId) ? `/survey/${templateId}` : null,
  );

  revalidatePath(`/survey/${templateId}`);
  return { created: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Asked by the stepped survey as the respondent moves between steps (#53).
 * Returns a state, never the counts behind it. Any failure — including a
 * database without 0088 yet — reads as "open", so the banner only ever
 * appears on a definite answer.
 */
export async function surveyAvailability(templateId: string): Promise<SurveyAvailability> {
  if (!UUID_RE.test(templateId)) return "open";
  const supabase = await createClient();
  const [capacity, codes] = await Promise.all([
    surveyCapacityState(supabase, templateId),
    supabase.rpc("survey_codes_state", { p_template_id: templateId }),
  ]);
  if (!codes.error && codes.data === "exhausted") return "codes_out";
  if (capacity?.is_full) return "full";
  // 100% of the expected participants, still inside the buffer (2 Nov).
  if (capacity && atQuota(capacity)) return "quota_reached";
  if (capacity?.nearly_full) return "nearly_full";
  return "open";
}

/**
 * Has the signed-in respondent confirmed their email yet? Asked by the survey's
 * "check your inbox" step while the respondent opens the link (often on another
 * device or tab), so the step carries on by itself. False for anyone not signed
 * in — never throws.
 */
export async function checkEmailVerified(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email_verified_at")
      .eq("id", user.id)
      .maybeSingle<{ role: string; email_verified_at: string | null }>();
    return Boolean(profile && (profile.role === "admin" || profile.email_verified_at));
  } catch {
    return false;
  }
}

export interface ChangeEmailState {
  error?: string;
  message?: string;
  /** The address now on the account — the form updates its own copy from this. */
  email?: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Wrong address?" on the confirm-your-email step. A respondent who mistyped
 * their email can't verify it, and can't just start again: their phone number is
 * already on the account (one number per audience account, phone_in_use()). So
 * let them correct the address and send a fresh link.
 *
 * Deliberately narrow — only the signed-in respondent's own account, only an
 * audience account, only while it is still UNVERIFIED (a verified address is
 * proof of ownership and is never changed here), and rate-limited. The auth email
 * is changed through the Admin API with email_confirm, which sends no Supabase
 * email and does not re-fire the verified sync (that only fires on a first
 * confirmation). profiles.email is updated by hand — nothing syncs it from auth —
 * and our notifications are sent to that column.
 */
export async function changeUnverifiedEmail(
  _prev: ChangeEmailState,
  formData: FormData,
): Promise<ChangeEmailState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please start the survey again." };

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (email.length > 254 || !EMAIL_SHAPE.test(email)) return { error: "Enter a valid email address." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email, email_verified_at")
      .eq("id", user.id)
      .maybeSingle<{ role: string; email: string | null; email_verified_at: string | null }>();
    if (!profile || profile.role !== "audience" || profile.email_verified_at) {
      return { error: "This address can't be changed here." };
    }

    const { data: allowed } = await supabase.rpc("rate_limit_hit", {
      p_action: "survey_email_change",
      p_window_seconds: 600,
      p_max: 4,
    });
    if (allowed === false) return { error: "Please wait a few minutes before trying again." };

    if (email !== (profile.email ?? "").toLowerCase()) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "We can't change the address right now." };
      const admin = createAdminClient();
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        email,
        email_confirm: true,
      });
      if (updateError) {
        // Never say whose address it is.
        return /already|exists|registered|taken/i.test(updateError.message)
          ? { error: "That address can't be used. Try another, or sign in with it." }
          : { error: "We couldn't change the address just now. Please try again." };
      }
      const { error: profileError } = await admin.from("profiles").update({ email }).eq("id", user.id);
      if (profileError) console.error("[survey] profiles.email update failed:", profileError.message);
    }

    const returnTo = String(formData.get("next") ?? "");
    const sent = await sendVerificationEmail(
      supabase,
      user.id,
      ROLE_LABELS.audience,
      /^\/survey\/[0-9a-f-]{36}$/i.test(returnTo) ? returnTo : null,
    );
    if (!sent) return { error: "We saved the new address but couldn't send the email. Use “Send it again”.", email };
    return { message: `Sent — check ${email} (and your spam folder). The new link replaces any earlier one.`, email };
  } catch (e) {
    console.error("[survey] changeUnverifiedEmail threw:", e);
    return { error: "Something went wrong. Please try again." };
  }
}


export interface SignInLinkState {
  error?: string;
  message?: string;
}

/**
 * "Email me a link to sign in" — for a respondent who already has an account
 * but doesn't have their password to hand (or is on a phone). Sent only when
 * they ask, to the address they typed; the link signs them in and returns them
 * to this survey (/auth/callback?next=). Always answers the same way so it
 * can't be used to discover which addresses have accounts.
 */
export async function emailSurveySignInLink(
  _prev: SignInLinkState,
  formData: FormData,
): Promise<SignInLinkState> {
  const templateId = String(formData.get("template_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!UUID_RE.test(templateId)) return { error: "Something went wrong — please reload the page." };
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { data: gateData, error: gateError } = await supabase.rpc("survey_submission_gate", {
    p_template_id: templateId,
    p_ip_hash: await callerIpHash(),
    p_account_short_minutes: SURVEY_RATE_LIMITS.accountShortMinutes,
    p_account_short_max: SURVEY_RATE_LIMITS.accountShortMax,
    p_account_long_max: SURVEY_RATE_LIMITS.accountLongMax,
    p_ip_short_minutes: SURVEY_RATE_LIMITS.ipShortMinutes,
    p_ip_short_max: SURVEY_RATE_LIMITS.ipShortMax,
    p_ip_long_max: SURVEY_RATE_LIMITS.ipLongMax,
  });
  if (gateError || !(gateData as { allowed: boolean }).allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/survey/${templateId}`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || /rate|too many|seconds/i.test(error.message))) {
    return { error: "We've just sent one — please wait a minute before asking for another." };
  }
  return {
    message: `If ${email} has an account, a sign-in link is on its way — open it in this browser and you'll come straight back to the survey. Check your spam folder too.`,
  };
}
