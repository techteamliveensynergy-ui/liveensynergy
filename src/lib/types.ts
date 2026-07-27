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
  email: string | null;
  is_active: boolean;
  /** Audit trail for `is_active = false` (set by the admin console). */
  blocked_at: string | null;
  blocked_reason: string | null;
  /** Stamped by middleware, throttled to ~once every 5 minutes. */
  last_seen_at: string | null;
  plan_id: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_gbp: number;
  billing_interval: string;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
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
  video_url: string | null;
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
  video_url: string | null;
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
  video_url: string | null;
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

export type ListingStatus = "draft" | "available" | "matched" | "closed";
export type ParticipationStatus =
  | "registered"
  | "ticket_uploaded"
  | "attendance_verified"
  | "reward_released"
  | "rejected";

export interface Campaign {
  id: string;
  brand_id: string;
  reference: string;
  description: string;
  budget_gbp: number;
  category: string | null;
  category_other: string | null;
  preferred_location: string | null;
  preferred_timeline: string | null;
  target_name: string | null;
  reward_rules: string | null;
  expected_outcomes: string | null;
  additional_info: string | null;
  image_url: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  matched_listing_id: string | null;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Read-only projection of `campaigns` for the artist-side "Discover campaigns"
 * browse (migration 0008). Deliberately omits campaign-manager contact details.
 */
export interface OpenCampaign {
  id: string;
  reference: string;
  description: string;
  expected_outcomes: string | null;
  budget_gbp: number;
  category: string | null;
  category_other: string | null;
  preferred_location: string | null;
  preferred_timeline: string | null;
  reward_rules: string | null;
  image_url: string | null;
  created_at: string;
  brand_name: string;
  brand_logo_url: string | null;
  brand_category: string | null;
}

/**
 * An artist / organiser registering interest in an open campaign. Recorded
 * rather than only notified, so the Discover Campaigns card can show a standing
 * "Interest sent" confirmation instead of re-offering the button (0011).
 */
export interface CampaignInterest {
  id: string;
  campaign_id: string;
  profile_id: string;
  note: string | null;
  created_at: string;
}

export interface EventListing {
  id: string;
  reference: string;
  owner_profile_id: string;
  artist_id: string | null;
  organiser_id: string | null;
  name: string;
  event_date: string | null;
  /** Local clock time at the venue, e.g. "19:30:00" (0013). */
  start_time: string | null;
  /** IANA zone that `start_time` is expressed in, e.g. "Europe/London". */
  timezone: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  capacity: number | null;
  ticket_price_gbp: number | null;
  ticket_buy_url: string | null;
  budget_range: string | null;
  existing_sponsors: string | null;
  sponsor_benefits: string | null;
  image_url: string | null;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
}

export interface SponsoredEvent {
  id: string;
  reference: string;
  brand_id: string | null;
  campaign_id: string | null;
  listing_id: string | null;
  artist_profile_id: string | null;
  name: string;
  event_date: string | null;
  /** Local clock time at the venue, e.g. "19:30:00" (0013). */
  start_time: string | null;
  /** IANA zone that `start_time` is expressed in, e.g. "Europe/London". */
  timezone: string;
  venue_details: string | null;
  location: string | null;
  artist_display_name: string | null;
  budget_gbp: number | null;
  remaining_budget_gbp: number | null;
  reward_rules: string | null;
  terms: string | null;
  banner_url: string | null;
  branding_guidelines: string | null;
  /** Free text: how the audience proves they physically attended. */
  attendance_method: string | null;
  brand_agreed: boolean;
  artist_agreed: boolean;
  /** Timestamptz since 0008 — carries a time of day, not just a date. */
  participation_deadline: string | null;
  status: SponsorshipStatus;
  created_at: string;
  updated_at: string;
}

export interface SponsoredEventAsset {
  id: string;
  sponsored_event_id: string;
  url: string;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Participation {
  id: string;
  sponsored_event_id: string;
  audience_profile_id: string;
  status: ParticipationStatus;
  selected: boolean;
  ticket_proof_url: string | null;
  attendance_verified_at: string | null;
  reward_amount_gbp: number | null;
  reward_released_at: string | null;
  newsletter_opt_in: boolean;
  bank_details_provided: boolean;
  created_at: string;
  updated_at: string;
}

/** `support` threads are with the Live-En-Synergy team rather than a partner. */
export type ConversationKind = "partner" | "support";

export interface Conversation {
  id: string;
  brand_profile_id: string;
  partner_profile_id: string;
  listing_id: string | null;
  campaign_id: string | null;
  kind: ConversationKind;
  subject: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_profile_id: string;
  body: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  read_at: string | null;
  created_at: string;
}

export type FeedbackKind = "bug" | "idea" | "improvement" | "text_change";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "wont_fix";

export interface FeedbackReport {
  id: string;
  reference: string;
  profile_id: string | null;
  kind: FeedbackKind;
  subject: string;
  body: string;
  page_url: string | null;
  screenshot_url: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
