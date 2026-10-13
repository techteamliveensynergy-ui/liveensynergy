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

  let ok = false;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (ok) {
    // Opening a link from our email proves the person owns the address —
    // records it for accounts made without the usual confirmation step
    // (survey sign-ups, 0069). No-op for everyone else.
    await supabase.rpc("mark_email_verified").then(
      () => undefined,
      () => undefined,
    );
    // Straight into profile set-up, with a "your email is confirmed" note.
    const dest = next.startsWith("/onboarding")
      ? `${next}${next.includes("?") ? "&" : "?"}confirmed=1`
      : next;
    return NextResponse.redirect(`${origin}${dest}`);
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
