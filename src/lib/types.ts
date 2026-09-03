import type { Role } from "./constants";

/**
 * Application-level TypeScript shapes for the core tables. These mirror the
 * Supabase schema in supabase/migrations. For a fully generated set of types,
 * run `supabase gen types typescript` once the CLI is connected.
 */

export type CampaignStatus = "in_progress" | "closed" | "completed";
/**
 * `withdrawn` (0020) is where a suggested sponsorship lands when the sponsor
 * confirms a different event for the same campaign. Terminal — it never moves
 * back into the in_progress → confirmed → completed ladder.
 */
export type SponsorshipStatus =
  | "in_progress"
  | "confirmed"
  | "completed"
  | "withdrawn";

export interface Profile {
  id: string; // == auth.users.id
  role: Role;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  /** Audit trail for `is_active = false` (set by the admin console). */
  blocked_at: string | null;
  blocked_reason: string | null;
  /** Set on an automatic 3-strikes no-show suspension; cleared on restore. */
  suspended_until: string | null;
  /** Stamped by middleware, throttled to ~once every 5 minutes. */
  last_seen_at: string | null;
  plan_id: string | null;
  onboarding_completed: boolean;
  /** When they ticked the role-specific terms box at sign-up (0021). */
  terms_accepted_at: string | null;
  /** Which revision of the terms that was — see TERMS_VERSION. */
  terms_version: string | null;
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

export interface CampaignPackage {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  participant_count: number | null;
  price_gbp: number | null;
  is_custom_price: boolean;
  min_price_gbp: number | null;
  price_increment_gbp: number | null;
  platform_margin_gbp: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: string;
  reference: string;
  sponsored_event_id: string | null;
  campaign_id: string | null;
  brand_id: string;
  amount_gbp: number;
  status: InvoiceStatus;
  external_invoice_ref: string | null;
  sent_at: string | null;
  sent_by: string | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
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
  /** Multiple showcase links (0015). `video_url` remains as a fallback. */
  video_urls: string[] | null;
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
  /** Multiple showcase links (0015). `video_url` remains as a fallback. */
  video_urls: string[] | null;
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
  /** Multiple showcase links (0015). `video_url` remains as a fallback. */
  video_urls: string[] | null;
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
  /** e.g. "+44". Defaults to UK; entered alongside `phone` on the form. */
  phone_country_code: string;
  date_of_birth: string | null;
  /** One of GENDER_OPTIONS (0021). Null when they'd rather not answer. */
  gender: string | null;
  /** Free text, only set when `gender` is "Prefer to self-describe". */
  gender_self_describe: string | null;
  /** Plain English country name, picked from COUNTRIES (0021). */
  country_of_residence: string | null;
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
  /** An external event the sponsor would like to sponsor (0023). */
  suggested_event_note: string | null;
  suggested_event_url: string | null;
  image_url: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  matched_listing_id: string | null;
  status: CampaignStatus;
  campaign_package_id: string | null;
  /** Snapshotted from campaign_packages at creation — doesn't move if the
   * package's own margin is edited later. */
  package_platform_margin_gbp: number | null;
  package_participant_count: number | null;
  created_at: string;
  updated_at: string;
}

export type CampaignIntakeStatus =
  | "submitted"
  | "in_review"
  | "converted"
  | "declined";

/** A brand's campaign request, before admin turns it into a real Campaign. */
export interface CampaignIntakeRequest {
  id: string;
  reference: string;
  brand_id: string;
  description: string;
  budget_expectation_gbp: number | null;
  category: string | null;
  category_other: string | null;
  preferred_location: string | null;
  preferred_timeline: string | null;
  target_name: string | null;
  reward_rules: string | null;
  expected_outcomes: string | null;
  additional_info: string | null;
  suggested_event_note: string | null;
  suggested_event_url: string | null;
  manager_name: string;
  manager_email: string;
  manager_phone: string;
  image_url: string | null;
  status: CampaignIntakeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decline_reason: string | null;
  converted_campaign_id: string | null;
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
  suggested_event_note: string | null;
  suggested_event_url: string | null;
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
  /** Stable per-event token behind the QR / link self-check-in flow. */
  attendance_qr_token: string;
  brand_agreed: boolean;
  artist_agreed: boolean;
  /** Timestamptz since 0008 — carries a time of day, not just a date. */
  participation_deadline: string | null;
  status: SponsorshipStatus;
  /** What the platform owes the artist for this event — separate from
   * remaining_budget_gbp, which is exclusively the audience reward pool. */
  artist_fee_gbp: number | null;
  artist_upfront_gbp: number | null;
  artist_upfront_paid_at: string | null;
  artist_remainder_gbp: number | null;
  artist_remainder_released_at: string | null;
  artist_remainder_released_by: string | null;
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

export type SponsoredEventProofType = "social_mention" | "onsite_branding";
export type SponsoredEventProofStatus = "submitted" | "approved" | "rejected";

export interface SponsoredEventProof {
  id: string;
  sponsored_event_id: string;
  proof_type: SponsoredEventProofType;
  url: string;
  description: string | null;
  uploaded_by: string;
  status: SponsoredEventProofStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface SponsoredEventRewardTier {
  id: string;
  sponsored_event_id: string;
  label: string;
  rank: number;
  participant_cap: number | null;
  reward_description: string | null;
  code_type: "discount" | "merch" | null;
  value_label: string | null;
  value_gbp: number | null;
  created_at: string;
  updated_at: string;
}

export type RewardCodeType = "discount" | "merch";
export type RewardCodeStatus = "issued" | "redeemed" | "expired" | "void";

export interface RewardCode {
  id: string;
  code: string;
  sponsored_event_id: string;
  participation_id: string | null;
  tier_id: string | null;
  code_type: RewardCodeType;
  value_label: string | null;
  value_gbp: number | null;
  status: RewardCodeStatus;
  issued_by: string | null;
  issued_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface TicketSalesReport {
  id: string;
  sponsored_event_id: string;
  submitted_by: string;
  tickets_sold: number | null;
  gross_revenue_gbp: number | null;
  report_file_path: string | null;
  notes: string | null;
  status: "submitted" | "reviewed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type SponsoredEventChangeRequestStatus =
  | "pending"
  | "approved"
  | "declined";

export interface SponsoredEventChangeRequest {
  id: string;
  sponsored_event_id: string;
  requested_by: string;
  summary: string;
  requested_changes: Record<string, unknown> | null;
  status: SponsoredEventChangeRequestStatus;
  admin_response: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Participation {
  id: string;
  sponsored_event_id: string;
  audience_profile_id: string;
  status: ParticipationStatus;
  selected: boolean;
  /** Stamped when `selected` flips true — anchors the ticket-upload deadline. */
  selected_at: string | null;
  /** Private-bucket storage path (0018+) or, for pre-migration rows, the
   *  pasted external link the old "paste your ticket link" step collected. */
  ticket_proof_url: string | null;
  attendance_verified_at: string | null;
  reward_amount_gbp: number | null;
  reward_released_at: string | null;
  newsletter_opt_in: boolean;
  bank_details_provided: boolean;
  /** Set when selected-but-never-followed-through; 3 strikes auto-suspends. */
  no_show: boolean;
  no_show_marked_at: string | null;
  terms_accepted_at: string | null;
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
  /** Set when the report was mirrored to GitHub (0021); null if not wired. */
  github_issue_url: string | null;
  github_issue_number: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Surveys ---

export type SurveyTemplateKind = "pre_event" | "post_event";
export type SurveyTemplateStatus = "draft" | "published" | "archived";
export type SurveyQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "scale"
  | "yes_no"
  | "dropdown"
  | "short_text"
  | "long_text"
  | "ranking"
  | "number"
  | "attention_check"
  | "hidden_field";

export interface SurveyQuestionOption {
  label: string;
  value: string;
}

/** Per-type settings; every key optional, only the ones the type declares are read. */
export interface SurveyQuestionConfig {
  min?: number;
  max?: number;
  step?: number;
  min_label?: string;
  max_label?: string;
  min_select?: number;
  max_select?: number;
  max_length?: number;
  /** attention_check — scored, never shown to the brand. */
  expected_answer?: string;
  /** hidden_field — which profile field this question copies at submit time. */
  profile_field?: string;
}

export interface SurveyTemplate {
  id: string;
  campaign_id: string | null;
  kind: SurveyTemplateKind;
  status: SurveyTemplateStatus;
  title: string;
  description: string | null;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyQuestion {
  id: string;
  template_id: string;
  order_index: number;
  type: SurveyQuestionType;
  prompt: string | null;
  help_text: string | null;
  options: SurveyQuestionOption[] | null;
  config: SurveyQuestionConfig;
  required: boolean;
  created_at: string;
}

export type SurveyQualityStatus = "pending" | "pass" | "review" | "reject";

/** Shape depends on the question type — see `answerShape` in src/lib/surveys.ts. */
export type SurveyAnswerValue = string | number | string[] | null;

/** The 9 signals `score_survey_response()` (0035) computes, in scoring order. */
export type SurveyQualitySignalKey =
  | "completion_time"
  | "attention_checks"
  | "straight_lining"
  | "contradictions"
  | "open_text_quality"
  | "question_coverage"
  | "duplicate_detection"
  | "behaviour"
  | "fraud_signals";

export interface SurveyQualitySignalResult {
  applicable: boolean;
  weight: number;
  /** 0 (clean) – 1 (worst). Rescaled across only the applicable signals. */
  severity: number;
  /** weight * severity — how many of the 100 points this signal cost. */
  contribution: number;
  verdict: "clear" | "warning" | "failed";
  /** Human-readable detail for the review-queue detail screen. */
  evidence: string;
}

export type SurveyQualitySignalBreakdown = Record<
  SurveyQualitySignalKey,
  SurveyQualitySignalResult
>;

export interface SurveyResponse {
  id: string;
  template_id: string;
  participation_id: string;
  started_at: string;
  submitted_at: string;
  quality_score: number | null;
  quality_status: SurveyQualityStatus;
  signal_breakdown: SurveyQualitySignalBreakdown | null;
  duplicate_of: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  updated_at: string;
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  value: SurveyAnswerValue;
  shown_at: string | null;
  answered_at: string | null;
}

/** Admin-defined "these two answers can't both be true" rule (0035). */
export interface SurveyContradictionRule {
  id: string;
  template_id: string;
  question_a_id: string;
  value_a: string;
  question_b_id: string;
  value_b: string;
  created_at: string;
}

export interface SurveyQualityWeight {
  signal_key: SurveyQualitySignalKey;
  label: string;
  weight: number;
  updated_by: string | null;
  updated_at: string;
}

/** Completion only, no verdict — reads `sponsored_event_survey_completions`
 * (0036), the brand/artist-safe view with no quality columns to leak. */
export interface SponsoredEventSurveyCompletion {
  sponsored_event_id: string;
  participation_id: string;
  kind: SurveyTemplateKind;
  submitted_at: string;
}
