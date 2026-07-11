import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
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
