/**
 * Bot/fraud screening for survey submission (build plan §03 stages 1-2) —
 * gates src/app/dashboard/surveys/[templateId]/actions.ts's
 * submitSurveyResponse() before it calls the submit_survey_response() RPC.
 *
 * Three independent checks, deliberately kept behind small pure exports so
 * the CAPTCHA provider can be swapped later (Turnstile today — see the
 * provider note on screenSurveySubmission()) without touching the action,
 * the gate ordering, or the rate limiter.
 */

import { headers } from "next/headers";
import { createHash } from "crypto";
import { turnstileConfigured, verifyTurnstileToken } from "./turnstile";

export { SURVEY_RATE_LIMITS, SURVEY_HONEYPOT_FIELD } from "./survey-abuse-constants";

function callerIp(h: Headers): string | null {
  return (
    h.get("x-vercel-forwarded-for") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

/**
 * A salted SHA-256 of the caller's IP, or null when no proxy header is
 * present (local dev — the IP dimension is skipped entirely rather than
 * bucketing every request together under one null key). Salted with
 * SURVEY_IP_SALT when set; unsalted still rate-limits identically (matching
 * is all it needs), only the privacy property weakens, since the IPv4 space
 * is small enough to brute-force an unsalted hash.
 */
export async function callerIpHash(): Promise<string | null> {
  const h = await headers();
  const raw = callerIp(h);
  if (!raw) return null;
  const salt = process.env.SURVEY_IP_SALT ?? "";
  if (!salt) {
    console.warn("[survey-abuse] SURVEY_IP_SALT unset — per-IP hashes are unsalted");
  }
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

async function callerIpRaw(): Promise<string | null> {
  return callerIp(await headers());
}

export type BotScreenResult =
  | { ok: true }
  | { ok: false; code: "missing" | "failed"; detail: string | null };

/**
 * Verifies the Turnstile token submitted alongside the survey answers.
 * Fails OPEN (skips the check, with a console warning) when unconfigured in
 * development, so local work isn't blocked on a Cloudflare account existing.
 * Fails CLOSED in production — a missing env var must never silently
 * disable the gate, which is the worst possible failure mode because
 * nothing looks broken.
 *
 * Provider note: swapping Turnstile for another provider (e.g. Vercel
 * BotID) means rewriting this one function's body, plus deleting
 * TurnstileWidget.tsx and its hidden input — the gate ordering, logging, and
 * rate limiter in actions.ts/survey-abuse.ts don't change.
 */
export async function screenSurveySubmission(token: string | null): Promise<BotScreenResult> {
  if (!turnstileConfigured()) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[survey-abuse] Turnstile unconfigured in production — refusing submission");
      return { ok: false, code: "missing", detail: "unconfigured" };
    }
    console.warn("[survey-abuse] Turnstile unconfigured — bot screen skipped");
    return { ok: true };
  }

  if (!token) {
    return { ok: false, code: "missing", detail: null };
  }

  const remoteIp = await callerIpRaw();
  const result = await verifyTurnstileToken(token, remoteIp);
  if (!result.success) {
    return { ok: false, code: "failed", detail: result.errorCodes.join(",") || null };
  }
  return { ok: true };
}
