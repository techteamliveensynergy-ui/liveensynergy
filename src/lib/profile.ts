import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import {
  assessProfile,
  PROFILE_TABLE,
  type Completeness,
} from "./profile-completeness";
import type { Profile } from "./types";

/**
 * Returns the signed-in user's auth record and profile row, redirecting to
 * sign-in when there is no session. The profile row is created by a database
 * trigger on sign-up (see supabase/migrations).
 */
export async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile: profile as Profile | null };
}

/**
 * Like requireProfile, but also redirects to the dashboard when the user's
 * role is not in `allowed`. Use to scope a page to specific roles.
 */
export async function requireRole(allowed: readonly Profile["role"][]) {
  const ctx = await requireProfile();
  if (!ctx.profile) redirect("/onboarding");
  if (!allowed.includes(ctx.profile.role)) redirect("/dashboard");
  return { ...ctx, profile: ctx.profile };
}

/**
 * Like requireProfile, but for server actions guarding admin-only writes:
 * redirects to sign-in when signed out, to the dashboard when the caller
 * isn't an admin. Previously copy-pasted per admin actions.ts file.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  return { supabase, userId: user.id };
}

/**
 * Scores the caller's role-specific profile row. Used both for the "complete
 * your profile" badge and for the gate on creating events / campaigns.
 */
export async function profileCompleteness(
  profile: Profile,
): Promise<Completeness> {
  const table = PROFILE_TABLE[profile.role];
  if (!table) {
    return { percent: 100, missing: [], blocking: [], complete: true };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return assessProfile(profile.role, data);
}
