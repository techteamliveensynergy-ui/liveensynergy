"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/urls";
import { siteUrl } from "@/lib/site-url";
import { ROLE_LABELS, SIGNUP_ROLE_OPTIONS, type Role, type SignupRole } from "@/lib/constants";
import { TERMS_VERSION } from "@/lib/terms";
import { notify, notifyAdmins } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVerificationEmail } from "@/lib/email-verification";
import { callerIpHash } from "@/lib/survey-abuse";
import { passwordProblem } from "@/lib/password";

export interface AuthState {
  error?: string;
  message?: string;
  /** Set when sign-in failed only because the address isn't confirmed yet,
   *  so the form can offer to resend the confirmation email. */
  unconfirmedEmail?: string;
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as SignupRole;
  // Carried from a public survey's "join & register" CTA
  // (src/app/survey/[templateId]/PublicSurveyForm.tsx) — a sponsored_events
  // reference, not a URL, so it survives the email-confirmation round trip
  // via raw_user_meta_data rather than a query param. Resolved and consumed
  // by saveAudience() (src/app/onboarding/actions.ts) once onboarding
  // completes.
  const pendingEventReference = String(formData.get("event") ?? "").trim() || null;

  if (!fullName || !email || !password) {
    return { error: "Please fill in your name, email and password." };
  }
  // Only the three sign-up cards. `event` stays in ROLES for accounts created
  // before the 3 Aug merge, but a new organiser signs up as an artist — a
  // ?role=event link used to create a fresh legacy account.
  if (!SIGNUP_ROLE_OPTIONS.some((o) => o.value === role)) {
    return {
      error:
        "Please choose whether you're a brand, an artist / event organiser, or an audience member.",
    };
  }
  const passwordError = passwordProblem(password);
  if (passwordError) return { error: passwordError };
  if (String(formData.get("terms_accepted") ?? "") !== "on") {
    return {
      error:
        "Please confirm you agree to the Terms & Conditions for your account type.",
    };
  }

  const supabase = await createClient();
  const metadata = {
    full_name: fullName,
    role,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
    ...(pendingEventReference ? { pending_event_reference: pendingEventReference } : {}),
  };

  // The usual path (16 Oct): the account is usable at once and our own
  // welcome email carries the confirm-your-email link (0074). Created through
  // the Admin API so Supabase neither holds the sign-in back nor sends its
  // own email; until the link is opened the dashboard is covered by the
  // verify overlay. Without the service-role key (a local checkout) we fall
  // through to Supabase's confirmation flow below.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data: allowed } = await supabase.rpc("signup_gate", { p_ip_hash: await callerIpHash() });
    if (allowed === false) {
      return { error: "Too many sign-ups from this connection. Please try again in an hour." };
    }

    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { ...metadata, verify_by_link: true },
    });
    if (createError || !created.user) {
      const code = (createError as { code?: string } | null)?.code;
      if (code === "email_exists" || /already.*registered/i.test(createError?.message ?? "")) {
        return { error: "An account with this email already exists. Sign in instead, or reset your password." };
      }
      if (code === "weak_password") return { error: createError?.message ?? "Please choose a stronger password." };
      return { error: createError?.message ?? "Something went wrong creating your account. Please try again." };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { error: "Your account was created, but we couldn't sign you in. Please sign in." };
    }

    await sendVerificationEmail(supabase, created.user.id, ROLE_LABELS[role]);
    await notify({
      eventKey: "account.welcome",
      recipientProfileId: created.user.id,
      link: "/onboarding",
      variables: { user_name: fullName, role_label: ROLE_LABELS[role] },
    });
    await notifyAdmins({
      eventKey: "admin.new_signup",
      link: "/dashboard/admin/users",
      variables: { user_name: fullName, role_label: ROLE_LABELS[role] },
    });

    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=/onboarding`,
      // The profile row is created by the `handle_new_user` trigger, not here,
      // so the terms acceptance travels with the sign-up metadata — there's no
      // session to write with yet when email confirmation is on (0021).
      data: metadata,
    },
  });

  if (error) {
    // Supabase's own mailer caps confirmation emails per hour across the
    // whole project until custom SMTP is set up (docs/email-setup.md).
    if (error.code === "over_email_send_rate_limit") {
      return {
        error:
          "We couldn't send your confirmation email just now — too many sign-ups in the last hour. Please try again in a little while.",
      };
    }
    return { error: error.message };
  }

  if (data.user) {
    await notify({
      eventKey: "account.welcome",
      recipientProfileId: data.user.id,
      link: "/onboarding",
      variables: { user_name: fullName, role_label: ROLE_LABELS[role] },
    });
    await notifyAdmins({
      eventKey: "admin.new_signup",
      link: "/dashboard/admin/users",
      variables: { user_name: fullName, role_label: ROLE_LABELS[role] },
    });
  }

  // Email confirmation is on, so there is no session yet: the link in the
  // email signs them in and lands them on onboarding (/auth/callback). Show a
  // proper "check your inbox" screen with the address and a resend button —
  // a one-line note under the form was easy to miss (client, 13 Oct).
  if (!data.session) {
    redirect(`/auth/check-email?email=${encodeURIComponent(email)}`);
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
  const redirectTo = safeRedirectPath(String(formData.get("redirectTo") ?? ""), "/dashboard");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Please confirm your email address first — open the link we emailed you when you signed up. Can't find it? Send a new one below.",
        unconfirmedEmail: email,
      };
    }
    return { error: error.message };
  }

  // Blocked accounts must not get a usable session at all. The credentials
  // were valid, so tear the session back down immediately.
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active, suspended_until, role, email_verified_at")
      .eq("id", data.user.id)
      .maybeSingle<{ is_active: boolean; suspended_until: string | null; role: Role; email_verified_at: string | null }>();

    // An automatic no-show suspension that has run its course lifts here too
    // — otherwise someone whose year was up could never sign back in, since
    // the middleware's lift only runs for a session that already exists.
    let active = profile?.is_active !== false;
    if (!active && profile?.suspended_until && new Date(profile.suspended_until) <= new Date()) {
      const { data: lifted } = await supabase.rpc("lift_expired_suspension");
      active = lifted === true;
    }

    if (profile && !active) {
      await supabase.auth.signOut();
      return {
        error:
          "This account has been blocked. Please contact the Live·En·Synergy team if you think this is a mistake.",
      };
    }

    // Not confirmed yet and no live link out there (an account from before
    // 0074, or the link expired): send the welcome email now.
    if (profile && profile.role !== "admin" && profile.email_verified_at === null) {
      const { data: pending } = await supabase.rpc("email_verification_pending");
      if (pending === false) await sendVerificationEmail(supabase, data.user.id, ROLE_LABELS[profile.role]);
    }
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

/**
 * Sends the sign-up confirmation email again. Always answers the same way so
 * it can't be used to discover which addresses have accounts. Supabase rate-
 * limits these per address on its side as well.
 */
export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Please enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=/onboarding` },
  });
  if (error && (error.code === "over_email_send_rate_limit" || /rate|too many|seconds/i.test(error.message))) {
    return { error: "We've just sent one — please wait a minute before asking for another." };
  }
  return {
    message: `If ${email} is waiting to be confirmed, a new confirmation link is on its way. Check your spam folder too.`,
  };
}

/**
 * "Send it again" on the verify overlay / banner, for a signed-in account
 * whose email isn't proved yet. Sends our own welcome email with a fresh
 * one-time link (0074) — the previous link stops working.
 */
export async function resendVerification(
  _prev: AuthState,
  _formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please sign in again." };

  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_action: "email_verification",
    p_window_seconds: 600,
    p_max: 3,
  });
  if (allowed === false) {
    return { error: "We've sent a few already — please check your inbox (and spam) and try again in 10 minutes." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email_verified_at")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; email_verified_at: string | null }>();
  if (profile?.email_verified_at) {
    return { message: "Your email is already confirmed — refresh the page." };
  }
  const sent = await sendVerificationEmail(supabase, user.id, ROLE_LABELS[profile?.role ?? "audience"]);
  if (!sent) {
    return { error: "We couldn't send the email just now. Please try again in a few minutes." };
  }
  return { message: `Sent — check ${user.email} (and your spam folder). The new link replaces the old one.` };
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
    redirectTo: `${await siteUrl()}/auth/callback?next=/auth/reset-password`,
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

  const passwordError = passwordProblem(password);
  if (passwordError) return { error: passwordError };
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
