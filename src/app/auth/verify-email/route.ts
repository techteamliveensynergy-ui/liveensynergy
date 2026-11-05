import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRedirectPath } from "@/lib/urls";

interface VerifyResult {
  status: "ok" | "already" | "expired" | "invalid";
  profile_id?: string;
  email?: string;
  onboarding_completed?: boolean;
  survey_account?: boolean;
}

/**
 * The link in our welcome / confirm-your-email message (0074):
 * /auth/verify-email?token=…
 *
 * verify_email_token() marks the address verified (one use, 24 hours). The
 * link is often opened somewhere the person isn't signed in — their phone's
 * mail app — so on success they're signed in here too: the token proves they
 * hold the inbox, exactly what a magic link proves, so we mint one with the
 * Admin API (generateLink sends nothing) and redeem it on the spot.
 *
 * Then: a link that carries `next` (a survey respondent's) returns them to that
 * page, signed in — a survey account sets its password at the end of the survey
 * instead. Otherwise a survey sign-up goes to set a password; everyone else to
 * their dashboard (or onboarding, if unfinished).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  // Same-site paths only ("" = none). The token proves the inbox; `next` only
  // chooses where to land, so a forged one can't do more than a normal link.
  const next = safeRedirectPath(searchParams.get("next"), "");
  const supabase = await createClient();

  const { data } = await supabase.rpc("verify_email_token", { p_token: token });
  const result = (data ?? { status: "invalid" }) as VerifyResult;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedInAsOwner = !!user && user.id === result.profile_id;

  if (result.status === "already") {
    return NextResponse.redirect(
      signedInAsOwner
        ? `${origin}${next || "/dashboard"}`
        : `${origin}/auth/sign-in?error=confirmed${next ? `&redirectTo=${encodeURIComponent(next)}` : ""}`,
    );
  }
  if (result.status !== "ok") {
    return NextResponse.redirect(`${origin}/auth/link-expired?reason=${result.status}`);
  }

  if (!signedInAsOwner && result.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data: link } = await createAdminClient().auth.admin.generateLink({
      type: "magiclink",
      email: result.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (tokenHash) {
      await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    }
  }

  const dest =
    next ||
    (result.survey_account
      ? "/auth/reset-password?welcome=1"
      : result.onboarding_completed
        ? "/dashboard?confirmed=1"
        : "/onboarding?confirmed=1");
  return NextResponse.redirect(`${origin}${dest}`);
}
