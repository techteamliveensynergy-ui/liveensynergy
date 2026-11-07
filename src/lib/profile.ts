import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import {
  assessProfile,
  PROFILE_TABLE,
  type Completeness,
} from "./profile-completeness";
import type { Profile } from "./types";

/**
 * The session check and profile read, done once per request.
 *
 * The dashboard layout and the page inside it both need them; without this the
 * same two round trips (an Auth check and a profile read) ran twice on every
 * dashboard page, on top of the middleware's own — part of why signing in took
 * ~11 s (QA 6 Nov). React's cache() is per request on the server, so nothing is
 * shared between users or carried across requests; in a server action it is a
 * plain call.
 */
const loadSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return { supabase, user, profile: profile as Profile | null };
});

/**
 * Returns the signed-in user's auth record and profile row, redirecting to
 * sign-in when there is no session. The profile row is created by a database
 * trigger on sign-up (see supabase/migrations).
 */
export async function requireProfile() {
  const { supabase, user, profile } = await loadSessionProfile();
  if (!user) {
    redirect("/auth/sign-in");
  }
  return { supabase, user, profile };
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
 * requireAdmin() without the redirect — for an action called directly (not
 * via <form action>) from a screen holding unsaved client state (e.g. the
 * survey builder's question canvas), where redirect()ing on an expired
 * session silently discards that state instead of leaving the screen where
 * the caller can show a readable, in-place error. Returns null on no
 * session or a non-admin caller; the caller decides what to show.
 */
export async function adminOrNull(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return null;

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
