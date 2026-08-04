"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { normaliseUrl, normaliseUrlFields } from "@/lib/urls";
import { MAX_BIO_CHARS } from "@/lib/upload-limits";
import { GENDER_SELF_DESCRIBE, ROLE_LABELS, type Role } from "@/lib/constants";

export interface OnboardingState {
  error?: string;
  success?: boolean;
  /**
   * What the user actually submitted, echoed back when a save is rejected.
   *
   * Without this the form re-renders from the *stored* values, so a rejected
   * save silently discards the edit it's complaining about: you're told the
   * phone number is taken while the field in front of you shows your old
   * number, and any field backed by component state (gender, country) loses
   * its selection. Merged over the defaults so the form shows what you typed.
   */
  values?: Record<string, string>;
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

/** Mirrors the database's `phone_digits()` — the last 10 digits, so that
 *  "+44 7700 900123", "07700900123" and "7700900123" all compare equal. */
function phoneKey(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

/** The number this account already has stored, in whichever shape its table keeps it. */
async function storedPhone(
  table: "audience_members" | "artists" | "event_organisers" | "brands",
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  if (table === "audience_members") {
    const { data } = await supabase
      .from(table)
      .select("phone, phone_country_code")
      .eq("profile_id", userId)
      .maybeSingle<{ phone: string | null; phone_country_code: string | null }>();
    if (!data?.phone) return null;
    return `${data.phone_country_code ?? ""}${data.phone}`;
  }

  const column = table === "brands" ? "manager_phone" : "contact_phone";
  const { data } = await supabase
    .from(table)
    .select(column)
    .eq("profile_id", userId)
    .maybeSingle<Record<string, string | null>>();
  return data?.[column] ?? null;
}

/**
 * Rejects a number already registered against a different account.
 *
 * A phone number is the platform's main defence against duplicate and
 * throwaway accounts, so uniqueness spans all four role tables, not just the
 * one being saved (3 Aug standup). The check runs through the `phone_in_use`
 * security-definer function because a normal user can't read anyone else's
 * profile row — it answers "is this taken?" without revealing whose it is.
 * Unique indexes in 0021 are the backstop against two concurrent saves.
 *
 * Only an actual *change* of number is checked. Enforcing this on every save
 * would permanently trap anyone who already shared a number with another
 * account before the rule existed: they couldn't edit their address, their
 * name, anything — every save would fail on a number they hadn't touched.
 * Uniqueness is enforced going forward; it doesn't retroactively brick
 * existing accounts.
 */
async function phoneTaken(
  value: string | null,
  userId: string,
  table: "audience_members" | "artists" | "event_organisers" | "brands",
): Promise<string | null> {
  if (!value) return null;

  const current = await storedPhone(table, userId);
  if (current && phoneKey(current) === phoneKey(value)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_in_use", {
    p_phone: value,
    p_profile_id: userId,
  });
  // A failing check must not block a legitimate save — the database index
  // still catches a genuine duplicate.
  if (error) return null;
  return data === true
    ? "That phone number is already registered to another account. Each account needs its own number."
    : null;
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

const SOCIAL_KEYS = [
  "facebook",
  "youtube",
  "instagram",
  "tiktok",
  "spotify",
  "linkedin",
  "x",
  "pinterest",
] as const;

/**
 * Collects the social link fields into a JSON object, normalising each one.
 * A bad link reports which network it was rather than failing the whole save
 * anonymously.
 */
function socialLinks(formData: FormData): {
  links: Record<string, string> | null;
  error?: string;
} {
  const links: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const label = key === "x" ? "Your X (Twitter) link" : `Your ${key} link`;
    const { url, error } = normaliseUrl(formData.get(`social_${key}`), label);
    if (error) return { links: null, error };
    if (url) links[key] = url;
  }
  return { links: Object.keys(links).length ? links : null };
}

/**
 * Collects the repeatable showcase video links, normalising each and dropping
 * blanks so an empty row never becomes an error.
 */
function videoUrls(formData: FormData): {
  urls: string[] | null;
  error?: string;
} {
  const out: string[] = [];
  for (const raw of formData.getAll("video_urls")) {
    const { url, error } = normaliseUrl(raw, "A video link");
    if (error) return { urls: null, error };
    if (url) out.push(url);
  }
  return { urls: out.length ? out : null };
}

/**
 * Normalises the website link shared by the artist, brand and organiser forms.
 */
function profileUrls(formData: FormData) {
  return normaliseUrlFields([
    {
      key: "website_url",
      value: formData.get("website_url"),
      label: "Your website link",
    },
  ]);
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

  const takenError = await phoneTaken(
    str(formData.get("manager_phone")),
    userId,
    "brands",
  );
  if (takenError) return { error: takenError };

  const descError = tooLong(formData.get("description"), "Your description");
  if (descError) return { error: descError };

  const { values: urls, error: urlError } = profileUrls(formData);
  if (urlError) return { error: urlError };
  const { urls: videos, error: videoError } = videoUrls(formData);
  if (videoError) return { error: videoError };
  const { links, error: socialError } = socialLinks(formData);
  if (socialError) return { error: socialError };

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
      video_urls: videos,
      // Kept in step so anything still reading the single column keeps working.
      video_url: videos?.[0] ?? null,
      product_category: str(formData.get("product_category")),
      product_category_other: str(formData.get("product_category_other")),
      website_url: urls.website_url,
      social_links: links,
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

  const takenError = await phoneTaken(
    str(formData.get("contact_phone")),
    userId,
    "artists",
  );
  if (takenError) return { error: takenError };

  const bioError = tooLong(formData.get("bio"), "Your bio");
  if (bioError) return { error: bioError };

  const { values: urls, error: urlError } = profileUrls(formData);
  if (urlError) return { error: urlError };
  const { urls: videos, error: videoError } = videoUrls(formData);
  if (videoError) return { error: videoError };
  const { links, error: socialError } = socialLinks(formData);
  if (socialError) return { error: socialError };

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
      video_urls: videos,
      // Kept in step so anything still reading the single column keeps working.
      video_url: videos?.[0] ?? null,
      category: str(formData.get("category")),
      category_other: str(formData.get("category_other")),
      website_url: urls.website_url,
      social_links: links,
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

  const takenError = await phoneTaken(
    str(formData.get("contact_phone")),
    userId,
    "event_organisers",
  );
  if (takenError) return { error: takenError };

  const descError = tooLong(formData.get("description"), "Your description");
  if (descError) return { error: descError };

  const { values: urls, error: urlError } = profileUrls(formData);
  if (urlError) return { error: urlError };
  const { urls: videos, error: videoError } = videoUrls(formData);
  if (videoError) return { error: videoError };
  const { links, error: socialError } = socialLinks(formData);
  if (socialError) return { error: socialError };

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
      video_urls: videos,
      // Kept in step so anything still reading the single column keeps working.
      video_url: videos?.[0] ?? null,
      category: str(formData.get("category")),
      category_other: str(formData.get("category_other")),
      website_url: urls.website_url,
      social_links: links,
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

  // Echoed back on every rejection so the form can re-render what was typed
  // rather than reverting to what's stored — see OnboardingState.values.
  const submitted: Record<string, string> = {};
  for (const field of [
    "full_name",
    "phone",
    "phone_country_code",
    "date_of_birth",
    "gender",
    "gender_self_describe",
    "country_of_residence",
    "address",
    "postcode",
  ]) {
    submitted[field] = String(formData.get(field) ?? "");
  }
  const reject = (error: string): OnboardingState => ({
    error,
    values: submitted,
  });

  const fullName = str(formData.get("full_name"));
  if (!fullName) return reject("Your name is required.");

  const phoneError = requirePhone(formData.get("phone"), "A phone number");
  if (phoneError) return reject(phoneError);

  const countryCode = str(formData.get("phone_country_code")) ?? "+44";
  const phone = str(formData.get("phone"));
  const takenError = await phoneTaken(
    `${countryCode}${phone ?? ""}`,
    userId,
    "audience_members",
  );
  if (takenError) return reject(takenError);

  // Only kept when they actually chose to self-describe — otherwise a stale
  // value would linger behind a since-changed answer.
  const gender = str(formData.get("gender"));
  const selfDescribe =
    gender === GENDER_SELF_DESCRIBE
      ? str(formData.get("gender_self_describe"))
      : null;

  const supabase = await createClient();
  const { error } = await supabase.from("audience_members").upsert(
    {
      profile_id: userId,
      full_name: fullName,
      phone,
      phone_country_code: countryCode,
      date_of_birth: str(formData.get("date_of_birth")),
      gender,
      gender_self_describe: selfDescribe,
      country_of_residence: str(formData.get("country_of_residence")),
      address: str(formData.get("address")),
      postcode: str(formData.get("postcode")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return reject(error.message);

  if (isProfileMode(formData)) {
    revalidatePath("/dashboard/profile");
    return { success: true };
  }

  await completeOnboarding(userId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
