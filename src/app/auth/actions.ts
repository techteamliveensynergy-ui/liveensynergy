"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES, type SignupRole } from "@/lib/constants";

export interface AuthState {
  error?: string;
  message?: string;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as SignupRole;

  if (!fullName || !email || !password) {
    return { error: "Please fill in your name, email and password." };
  }
  if (!ROLES.includes(role)) {
    return { error: "Please choose whether you're a brand, artist, organiser or audience member." };
  }
  if (password.length < 8) {
    return { error: "Your password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding`,
      data: { full_name: fullName, role },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is required, there is no active session yet.
  if (!data.session) {
    return {
      message:
        "Check your inbox to confirm your email address, then sign in to finish setting up your profile.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "") || "/dashboard";

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Blocked accounts must not get a usable session at all. The credentials
  // were valid, so tear the session back down immediately.
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      return {
        error:
          "This account has been blocked. Please contact the Live·En·Synergy team if you think this is a mistake.",
      };
    }
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Please enter your email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/auth/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  // Don't reveal whether the email exists.
  return {
    message:
      "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Your password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The reset link signs the user in via the callback; without a session the
  // link has expired or was already used.
  if (!user) {
    return {
      error:
        "Your reset link has expired or already been used. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
