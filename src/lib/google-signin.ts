import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNUP_ROLE_OPTIONS } from "@/lib/constants";
import { needsGoogleCompletion } from "@/lib/google-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** The role a sign-up card asked for — only the three public ones, else none. */
export function signupRoleOrNull(value: string | null | undefined): string | null {
  return SIGNUP_ROLE_OPTIONS.some((o) => o.value === value) ? (value as string) : null;
}

/**
 * Runs once, in /auth/callback, right after Google has handed back a session.
 * Returns the site path to send the person to.
 *
 * 1. Refuses a Google address Google itself hasn't verified.
 *
 * 2. Closes the "pre-hijack" hole. Supabase links a Google sign-in to an
 *    existing account with the same email. Every account this app creates
 *    through the Admin API is flagged "confirmed" from Supabase's side even
 *    though WE haven't proved the address yet (profiles.email_verified_at is
 *    null until the emailed link is opened) — so someone who signed up with a
 *    stranger's address and a password of their own would stay logged in to the
 *    real owner's account after the owner arrives with Google, and could keep
 *    using that password. When Google lands on an account whose address we had
 *    not verified, the owner has now proved the inbox, so: mark it verified,
 *    replace the password with a random one nobody knows and end every other
 *    session. The owner keeps Google (and "Forgot password?" if they want a
 *    password); the squatter is out.
 *
 * 3. A brand-new Google account has no role choice or Terms acceptance yet —
 *    send it to /auth/complete to supply them (and a mobile number for an
 *    audience account) before anything else.
 */
export async function finishGoogleSignIn(
  supabase: SupabaseClient,
  opts: { next: string; role: string | null; lockRole: boolean },
): Promise<string> {
  const failed = `/auth/sign-in?error=google&redirectTo=${encodeURIComponent(opts.next)}`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const google = user?.identities?.find((i) => i.provider === "google");
  if (!user || !google) return failed;

  const identity = (google.identity_data ?? {}) as { email_verified?: boolean };
  if (identity.email_verified !== true) {
    await supabase.auth.signOut();
    return failed;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, terms_accepted_at, email_verified_at")
    .eq("id", user.id)
    .maybeSingle<{ role: string; terms_accepted_at: string | null; email_verified_at: string | null }>();

  if (profile && profile.role !== "admin" && !profile.email_verified_at && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      });
      if (pwError) throw pwError;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await admin.auth.admin.signOut(session.access_token, "others");
      await admin
        .from("profiles")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("id", user.id)
        .is("email_verified_at", null);
    } catch (e) {
      // Not safe to continue on an account whose old password may still work.
      console.error("[google sign-in] could not secure a previously unverified account:", e);
      await supabase.auth.signOut();
      return failed;
    }
  }

  if (needsGoogleCompletion(user, profile)) {
    const qs = new URLSearchParams({ next: opts.next });
    if (opts.role) qs.set("role", opts.role);
    if (opts.lockRole) qs.set("locked", "1");
    return `/auth/complete?${qs.toString()}`;
  }
  return opts.next;
}
