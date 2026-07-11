import type { Role } from "./constants";

/**
 * Application-level TypeScript shapes for the core tables. These mirror the
 * Supabase schema in supabase/migrations. For a fully generated set of types,
 * run `supabase gen types typescript` once the CLI is connected.
 */

export type CampaignStatus = "in_progress" | "closed" | "completed";
export type SponsorshipStatus = "in_progress" | "confirmed" | "completed";

export interface Profile {
  id: string; // == auth.users.id
  role: Role;
  full_name: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  profile_id: string;
  brand_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  product_category: string | null;
  product_category_other: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  // Internal (only visible to the brand and the Live-En-Synergy team)
  mission_vision: string | null;
  target_audience_keywords: string[] | null;
  brand_keywords: string[] | null;
  preferred_genres: string | null;
  preferred_locations: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  company_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Artist {
  id: string;
  profile_id: string;
  artist_name: string;
  stage_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  banner_url: string | null;
  category: string | null;
  category_other: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  // Internal use only
  date_of_birth: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  art_keywords: string[] | null;
  mission_vision: string | null;
  sponsor_value_details: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventOrganiser {
  id: string;
  profile_id: string;
  event_name: string;
  description: string | null;
  profile_image_url: string | null;
  banner_url: string | null;
  category: string | null;
  category_other: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  // Internal use only
  existing_partners: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_address: string | null;
  keywords: string[] | null;
  mission_vision: string | null;
  sponsor_value_details: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceMember {
  id: string;
  profile_id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  postcode: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}
