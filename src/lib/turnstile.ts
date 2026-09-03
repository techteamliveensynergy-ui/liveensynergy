/**
 * Server-side verification for Cloudflare Turnstile — the invisible CAPTCHA
 * gating survey submission (build plan §03 stage 1). Configuration is env-
 * driven and optional in non-production, mirroring src/lib/github.ts's
 * "a missing token degrades the mirror, never the report" pattern — except
 * here, in production, a missing key must refuse rather than silently skip
 * the check (see turnstileConfigured()'s call site in survey-abuse.ts).
 *
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  public, read by the client widget
 *   TURNSTILE_SECRET_KEY            server-only, used to verify tokens
 *
 * Cloudflare publishes deterministic dummy keys for local/CI testing (always
 * pass): site `1x00000000000000000000BB`, secret
 * `1x0000000000000000000000000000000AA`. Test secrets only accept tokens
 * minted by a matching test sitekey and vice versa.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: false, errorCodes: ["not-configured"] };

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });

    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP error", res.status);
      return { success: false, errorCodes: ["internal-error"] };
    }

    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    return {
      success: Boolean(data.success),
      errorCodes: data["error-codes"] ?? [],
    };
  } catch (err) {
    console.error("[turnstile] siteverify request threw", err);
    return { success: false, errorCodes: ["internal-error"] };
  }
}
