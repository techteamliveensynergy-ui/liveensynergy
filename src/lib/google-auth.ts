import type { User } from "@supabase/supabase-js";

/**
 * "Continue with Google" (client note 4 Nov, #55) is switched on by a runtime
 * env var rather than shown unconditionally: the button only works once the
 * Google provider has been enabled in Supabase (Authentication → Providers →
 * Google, with the Client ID and Secret pasted there). Until then a visible
 * button would dead-end every person who tried it.
 *
 * Plain env read (not NEXT_PUBLIC_): pages read it on the server and pass a
 * boolean down, so flipping it on Vercel needs a redeploy, not a rebuild.
 */
export function googleSignInEnabled(): boolean {
  return process.env.GOOGLE_SIGNIN_ENABLED === "true";
}

/**
 * A brand-new Google account has a profile (the handle_new_user trigger makes
 * one, role 'audience') but has not chosen a role or accepted the Terms —
 * the password sign-up form collects both, Google collects neither. Such an
 * account is sent to /auth/complete before anything else.
 *
 * Keyed on the account having been *created by* Google (app_metadata.provider)
 * so seeded and older accounts, whose terms columns may legitimately be empty,
 * are never caught by it. An email-and-password account that later signs in
 * with Google keeps provider "email" and is not affected.
 */
export function needsGoogleCompletion(
  user: Pick<User, "app_metadata"> | null | undefined,
  profile: { role?: string | null; terms_accepted_at?: string | null } | null | undefined,
): boolean {
  if (!user || !profile) return false;
  return user.app_metadata?.provider === "google" && profile.role !== "admin" && !profile.terms_accepted_at;
}
