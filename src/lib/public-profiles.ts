import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants";

/**
 * Public profile reads.
 *
 * The role tables are owner-only under RLS, so these go through the
 * `public_*_profiles` views from migration 0008 — which hold only the columns
 * that are safe to show a stranger.
 */

export interface PublicProfile {
  profileId: string;
  role: Extract<Role, "artist" | "event" | "brand">;
  name: string;
  /** Stage name for artists — shown under the main name when present. */
  secondaryName: string | null;
  about: string | null;
  category: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  videoUrl: string | null;
  videoUrls: string[] | null;
  socialLinks: Record<string, string> | null;
  sponsorValue: string | null;
}

/** Route segment ↔ role, so `/artists/:id` and friends stay tidy. */
export const PUBLIC_PROFILE_PATH: Record<string, string> = {
  artist: "artists",
  event: "organisers",
  brand: "brands",
};

function category(main: string | null, other: string | null) {
  if (main && main !== "Other") return main;
  return other || main;
}

export async function getPublicProfile(
  role: PublicProfile["role"],
  profileId: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  if (role === "artist") {
    const { data } = await supabase
      .from("public_artist_profiles")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!data) return null;
    return {
      profileId,
      role,
      name: data.artist_name,
      secondaryName: data.stage_name,
      about: data.bio,
      category: category(data.category, data.category_other),
      imageUrl: data.profile_image_url,
      bannerUrl: data.banner_url,
      websiteUrl: data.website_url,
      videoUrl: data.video_url,
      videoUrls: data.video_urls,
      socialLinks: data.social_links,
      sponsorValue: data.sponsor_value_details,
    };
  }

  if (role === "event") {
    const { data } = await supabase
      .from("public_organiser_profiles")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!data) return null;
    return {
      profileId,
      role,
      name: data.event_name,
      secondaryName: null,
      about: data.description,
      category: category(data.category, data.category_other),
      imageUrl: data.profile_image_url,
      bannerUrl: data.banner_url,
      websiteUrl: data.website_url,
      videoUrl: data.video_url,
      videoUrls: data.video_urls,
      socialLinks: data.social_links,
      sponsorValue: data.sponsor_value_details,
    };
  }

  const { data } = await supabase
    .from("public_brand_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  return {
    profileId,
    role,
    name: data.brand_name,
    secondaryName: null,
    about: data.description,
    category: category(data.product_category, data.product_category_other),
    imageUrl: data.logo_url,
    bannerUrl: data.banner_url,
    websiteUrl: data.website_url,
    videoUrl: data.video_url,
      videoUrls: data.video_urls,
    socialLinks: data.social_links,
    sponsorValue: null,
  };
}
