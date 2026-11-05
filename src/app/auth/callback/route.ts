import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/urls";
import { finishGoogleSignIn, signupRoleOrNull } from "@/lib/google-signin";

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
 * "Continue with Google" returns here too (`?provider=google`, a PKCE `?code=`):
 * finishGoogleSignIn() secures a linked account, then routes a brand-new Google
 * account to /auth/complete for its role and Terms.
 *
 * A failed link lands on sign-in with a reason rather than a bare form.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/onboarding");
  const viaGoogle = searchParams.get("provider") === "google";
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (viaGoogle) {
    // Cancelled on Google's screen, denied, or the code was already used.
    const dest = ok
      ? await finishGoogleSignIn(supabase, {
          next,
          role: signupRoleOrNull(searchParams.get("role")),
          lockRole: searchParams.get("locked") === "1",
        })
      : `/auth/sign-in?error=google&redirectTo=${encodeURIComponent(next)}`;
    return NextResponse.redirect(`${origin}${dest}`);
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
