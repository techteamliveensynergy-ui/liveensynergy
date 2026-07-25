"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { MAX_BIO_CHARS } from "@/lib/upload-limits";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export interface OnboardingState {
  error?: string;
  success?: boolean;
}

/**
 * A phone number is mandatory across every role. It's the platform's main
 * defence against duplicate and throwaway accounts, and the fastest way for
 * the team to reach someone when a match needs confirming within 48 hours
 * (agreed in the 24 Jul standup).
 */
function requirePhone(
  value: FormDataEntryValue | null,
  label = "A phone number",
): string | null {
  const phone = str(value);
  if (!phone) return `${label} is required.`;
  // Deliberately loose — international formats vary far too much to pattern
  // match safely; this only rejects obvious non-numbers.
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return `${label} doesn't look like a valid number.`;
  return null;
}

/** Guards the long free-text fields against runaway pastes. */
function tooLong(value: FormDataEntryValue | null, label: string) {
  const s = str(value);
  if (s && s.length > MAX_BIO_CHARS) {
    return `${label} is too long — keep it under ${MAX_BIO_CHARS.toLocaleString("en-GB")} characters.`;
  }
  return null;
}

/**
 * Resolves the profile/banner uploads for a role form. Returns only the keys
 * that actually got a new file, so leaving the pickers empty preserves what's
 * already stored.
 */
async function imagePatch(
  formData: FormData,
  imageColumn: "profile_image_url" | "logo_url",
): Promise<{ patch: Record<string, string>; error?: string }> {
  const patch: Record<string, string> = {};

  const image = await uploadImage(formData.get("profile_image"), "profile");
  if (image.error) return { patch, error: image.error };
  if (image.url) patch[imageColumn] = image.url;

  const banner = await uploadImage(formData.get("banner"), "banner");
  if (banner.error) return { patch, error: banner.error };
  if (banner.url) patch.banner_url = banner.url;

  return { patch };
}

/**
 * "onboarding" mode redirects to the dashboard on success; "profile" mode
 * (editing from the dashboard) stays on the page and reports success.
 */
function isProfileMode(formData: FormData) {
  return String(formData.get("mode") ?? "") === "profile";
}

/** Splits a comma / newline separated string into a trimmed array. */
function toArray(value: FormDataEntryValue | null): string[] | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return s
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function str(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Collects the standard set of social link fields into a JSON object. */
function socialLinks(formData: FormData): Record<string, string> | null {
  const keys = [
    "facebook",
    "youtube",
    "instagram",
    "tiktok",
    "spotify",
    "linkedin",
    "x",
    "pinterest",
  ];
  const links: Record<string, string> = {};
  for (const key of keys) {
    const v = str(formData.get(`social_${key}`));
    if (v) links[key] = v;
  }
  return Object.keys(links).length ? links : null;
}

async function completeOnboarding(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId)
    .select("role")
    .maybeSingle();

  await notify({
    eventKey: "account.onboarding_completed",
    recipientProfileId: userId,
    link: "/dashboard",
    variables: {
      role_label: profile?.role ? ROLE_LABELS[profile.role as Role] : undefined,
    },
  });
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function saveBrand(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await getUserId();
  if (!userId) redirect("/auth/sign-in");

  const brandName = str(formData.get("brand_name"));
  if (!brandName) return { error: "Brand name is required." };

  const phoneError = requirePhone(
    formData.get("manager_phone"),
    "A manager phone number",
  );
  if (phoneError) return { error: phoneError };

  const descError = tooLong(formData.get("description"), "Your description");
  if (descError) return { error: descError };

  const { patch: images, error: imageError } = await imagePatch(
    formData,
    "logo_url",
  );
  if (imageError) return { error: imageError };

  const supabase = await createClient();
  const { error } = await supabase.from("brands").upsert(
    {
      profile_id: userId,
      ...images,
      brand_name: brandName,
      description: str(formData.get("description")),
      video_url: str(formData.get("video_url")),
      product_category: str(formData.get("product_category")),
      product_category_other: str(formData.get("product_category_other")),
      website_url: str(formData.get("website_url")),
      social_links: socialLinks(formData),
      mission_vision: str(formData.get("mission_vision")),
      target_audience_keywords: toArray(formData.get("target_audience_keywords")),
      brand_keywords: toArray(formData.get("brand_keywords")),
      preferred_genres: str(formData.get("preferred_genres")),
      preferred_locations: str(formData.get("preferred_locations")),
      manager_name: str(formData.get("manager_name")),
      manager_email: str(formData.get("manager_email")),
      manager_phone: str(formData.get("manager_phone")),
      company_address: str(formData.get("company_address")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: error.message };

  if (isProfileMode(formData)) {
    revalidatePath("/dashboard/profile");
    return { success: true };
  }

  await completeOnboarding(userId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function saveArtist(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await getUserId();
  if (!userId) redirect("/auth/sign-in");

  const artistName = str(formData.get("artist_name"));
  if (!artistName) return { error: "Artist name is required." };

  const phoneError = requirePhone(
    formData.get("contact_phone"),
    "A contact phone number",
  );
  if (phoneError) return { error: phoneError };

  const bioError = tooLong(formData.get("bio"), "Your bio");
  if (bioError) return { error: bioError };

  const { patch: images, error: imageError } = await imagePatch(
    formData,
    "profile_image_url",
  );
  if (imageError) return { error: imageError };

  const supabase = await createClient();
  const { error } = await supabase.from("artists").upsert(
    {
      profile_id: userId,
      ...images,
      artist_name: artistName,
      stage_name: str(formData.get("stage_name")),
      bio: str(formData.get("bio")),
      video_url: str(formData.get("video_url")),
      category: str(formData.get("category")),
      category_other: str(formData.get("category_other")),
      website_url: str(formData.get("website_url")),
      social_links: socialLinks(formData),
      date_of_birth: str(formData.get("date_of_birth")),
      location: str(formData.get("location")),
      contact_name: str(formData.get("contact_name")),
      contact_email: str(formData.get("contact_email")),
      contact_phone: str(formData.get("contact_phone")),
      address: str(formData.get("address")),
      art_keywords: toArray(formData.get("art_keywords")),
      mission_vision: str(formData.get("mission_vision")),
      sponsor_value_details: str(formData.get("sponsor_value_details")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: error.message };

  if (isProfileMode(formData)) {
    revalidatePath("/dashboard/profile");
    return { success: true };
  }

  await completeOnboarding(userId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function saveEvent(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await getUserId();
  if (!userId) redirect("/auth/sign-in");

  const eventName = str(formData.get("event_name"));
  if (!eventName) return { error: "Event name is required." };

  const phoneError = requirePhone(
    formData.get("contact_phone"),
    "A contact phone number",
  );
  if (phoneError) return { error: phoneError };

  const descError = tooLong(formData.get("description"), "Your description");
  if (descError) return { error: descError };

  const { patch: images, error: imageError } = await imagePatch(
    formData,
    "profile_image_url",
  );
  if (imageError) return { error: imageError };

  const supabase = await createClient();
  const { error } = await supabase.from("event_organisers").upsert(
    {
      profile_id: userId,
      ...images,
      event_name: eventName,
      description: str(formData.get("description")),
      video_url: str(formData.get("video_url")),
      category: str(formData.get("category")),
      category_other: str(formData.get("category_other")),
      website_url: str(formData.get("website_url")),
      social_links: socialLinks(formData),
      existing_partners: str(formData.get("existing_partners")),
      contact_name: str(formData.get("contact_name")),
      contact_email: str(formData.get("contact_email")),
      contact_phone: str(formData.get("contact_phone")),
      company_address: str(formData.get("company_address")),
      keywords: toArray(formData.get("keywords")),
      mission_vision: str(formData.get("mission_vision")),
      sponsor_value_details: str(formData.get("sponsor_value_details")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: error.message };

  if (isProfileMode(formData)) {
    revalidatePath("/dashboard/profile");
    return { success: true };
  }

  await completeOnboarding(userId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function saveAudience(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await getUserId();
  if (!userId) redirect("/auth/sign-in");

  const fullName = str(formData.get("full_name"));
  if (!fullName) return { error: "Your name is required." };

  const phoneError = requirePhone(formData.get("phone"), "A phone number");
  if (phoneError) return { error: phoneError };

  const supabase = await createClient();
  const { error } = await supabase.from("audience_members").upsert(
    {
      profile_id: userId,
      full_name: fullName,
      phone: str(formData.get("phone")),
      date_of_birth: str(formData.get("date_of_birth")),
      address: str(formData.get("address")),
      postcode: str(formData.get("postcode")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: error.message };

  if (isProfileMode(formData)) {
    revalidatePath("/dashboard/profile");
    return { success: true };
  }

  await completeOnboarding(userId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
