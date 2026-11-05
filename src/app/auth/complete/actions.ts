"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRedirectPath } from "@/lib/urls";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { TERMS_VERSION } from "@/lib/terms";
import { notify, notifyAdmins } from "@/lib/notifications";
import { needsGoogleCompletion } from "@/lib/google-auth";
import { signupRoleOrNull } from "@/lib/google-signin";

export interface CompleteState {
  error?: string;
}

/**
 * "One last step" for an account made with Google (/auth/complete). Google gave
 * us a verified name and email but not the two things the password sign-up
 * collects: who they are on the platform (brand / artist / audience) and their
 * agreement to that party's Terms. An audience account also gives a mobile
 * number — one person, one number (phone_in_use, 0023) — so a Google sign-up
 * can't be used to open extra audience accounts around that rule.
 *
 * role / terms_accepted_at are guarded columns (0061): only the service role may
 * write them, which is why this uses the admin client — after checking, here,
 * that the caller is a Google-created account that has not completed this step
 * and has not finished onboarding, so it can only ever run once per account.
 */
export async function completeGoogleSignup(
  _prev: CompleteState,
  formData: FormData,
): Promise<CompleteState> {
  const next = safeRedirectPath(String(formData.get("next") ?? ""), "/onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, terms_accepted_at, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<{
      role: Role;
      full_name: string | null;
      terms_accepted_at: string | null;
      onboarding_completed: boolean;
    }>();
  if (!needsGoogleCompletion(user, profile) || !profile) redirect(next);
  if (profile.onboarding_completed) redirect(next);

  const role = signupRoleOrNull(String(formData.get("role") ?? "")) as Role | null;
  if (!role) {
    return { error: "Please choose whether you're a brand, an artist / event organiser, or an audience member." };
  }
  if (String(formData.get("terms_accepted") ?? "") !== "on") {
    return { error: "Please confirm you agree to the Terms & Conditions and Privacy Policy to continue." };
  }

  let phoneCountryCode: string | null = null;
  let phoneLocal: string | null = null;
  if (role === "audience") {
    phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim() || "+44";
    phoneLocal = String(formData.get("phone") ?? "").replace(/[^\d]/g, "");
    if (phoneLocal.length < 7 || phoneLocal.length > 15) {
      return { error: "Please enter a valid mobile number." };
    }
    const { data: taken } = await supabase.rpc("phone_in_use", {
      p_phone: `${phoneCountryCode}${phoneLocal}`,
      p_profile_id: user.id,
    });
    if (taken === true) {
      return {
        error:
          "That mobile number is already registered to another audience account. If it's yours, sign in to that account instead — each audience member needs their own number.",
      };
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[completeGoogleSignup] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { error: "We can't finish setting up your account right now. Please try again shortly." };
  }

  const admin = createAdminClient();
  const acceptedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ role, terms_accepted_at: acceptedAt, terms_version: TERMS_VERSION })
    .eq("id", user.id)
    .is("terms_accepted_at", null)
    .eq("onboarding_completed", false)
    .select("id");
  if (updateError || !updated?.length) {
    console.error("[completeGoogleSignup] profile update failed:", updateError?.message ?? "no row updated");
    return { error: "Something went wrong saving your choices. Please try again." };
  }

  // Onboarding pre-fills the phone from the account's metadata (survey sign-ups
  // work the same way).
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role,
      terms_accepted_at: acceptedAt,
      terms_version: TERMS_VERSION,
      ...(phoneLocal ? { phone_country_code: phoneCountryCode, phone: phoneLocal } : {}),
    },
  });
  if (metaError) console.error("[completeGoogleSignup] metadata update failed:", metaError.message);

  const name = profile.full_name ?? "";
  await notify({
    eventKey: "account.welcome",
    recipientProfileId: user.id,
    link: "/onboarding",
    variables: { user_name: name, role_label: ROLE_LABELS[role] },
  });
  await notifyAdmins({
    eventKey: "admin.new_signup",
    link: "/dashboard/admin/users",
    variables: { user_name: name, role_label: ROLE_LABELS[role] },
  });

  revalidatePath("/", "layout");
  redirect(next);
}
