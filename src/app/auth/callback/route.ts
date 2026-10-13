import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/urls";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Lands every link in a Supabase auth email (confirm sign-up, reset password),
 * then redirects onward (defaults to onboarding). Two link formats:
 *
 *  - `?code=` (PKCE, Supabase's default template) — only works in the browser
 *    that asked for the email, since the verifier is a cookie there.
 *  - `?token_hash=&type=` (a template using `{{ .TokenHash }}`) — works on any
 *    device, so a link opened on a phone no longer fails (client feedback,
 *    13 Oct; see docs/email-setup.md for the template).
 *
 * A failed link lands on sign-in with a reason rather than a bare form.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/onboarding");
  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Supabase reports an expired/used link as ?error_code=otp_expired.
  const expired = searchParams.get("error_code") === "otp_expired";
  const reason = next.startsWith("/auth/reset-password")
    ? "reset-link"
    : expired
      ? "link-expired"
      : "confirm-link";
  return NextResponse.redirect(`${origin}/auth/sign-in?error=${reason}`);
}
