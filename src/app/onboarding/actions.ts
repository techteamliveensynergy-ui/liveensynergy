"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
  success?: boolean;
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
  await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId);
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

  const supabase = await createClient();
  const { error } = await supabase.from("brands").upsert(
    {
      profile_id: userId,
      brand_name: brandName,
      description: str(formData.get("description")),
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

  const supabase = await createClient();
  const { error } = await supabase.from("artists").upsert(
    {
      profile_id: userId,
      artist_name: artistName,
      stage_name: str(formData.get("stage_name")),
      bio: str(formData.get("bio")),
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

  const supabase = await createClient();
  const { error } = await supabase.from("event_organisers").upsert(
    {
      profile_id: userId,
      event_name: eventName,
      description: str(formData.get("description")),
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
