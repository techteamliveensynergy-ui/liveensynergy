/**
 * Campaign Order Form (GitHub #9, Admin Portal brief, migration 0054).
 *
 * One form per campaign. An admin fills it after the 1-on-1 with the brand,
 * sends it, and the brand approves it with two consents — which moves the
 * campaign on to billing. The Admin Portal brief marks some sections "ok for
 * artist to see"; ARTIST_SECTIONS is that list, and the database enforces it
 * through the campaign_order_briefs view (no brand contact, no commercials).
 */

export type OrderFormStatus = "draft" | "sent" | "changes_requested" | "approved";
export type SurveyType = "pre" | "post" | "pre_post";

export interface CampaignOrderForm {
  id: string;
  reference: string;
  campaign_id: string;
  brand_id: string;
  status: OrderFormStatus;
  brand_company_name: string | null;
  brand_address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  campaign_name: string | null;
  campaign_objective: string | null;
  campaign_timeline: string | null;
  listing_id: string | null;
  artist_profile_id: string | null;
  artist_name: string | null;
  event_name: string | null;
  event_reference: string | null;
  event_date: string | null;
  event_venue: string | null;
  event_location: string | null;
  approx_participants: number | null;
  survey_type: SurveyType | null;
  survey_question_count: number | null;
  research_questions: string | null;
  draft_survey_link: string | null;
  discount_reward: string | null;
  rewards_available: number | null;
  redemption_arrangements: string | null;
  social_media_details: string | null;
  other_details: string | null;
  media_image_urls: string[];
  media_video_url: string | null;
  campaign_package_id: string | null;
  campaign_fee_gbp: number | null;
  vat_gbp: number | null;
  total_gbp: number | null;
  payment_date: string | null;
  sent_at: string | null;
  changes_requested_at: string | null;
  changes_requested_note: string | null;
  approved_at: string | null;
  consent_details_approved: boolean;
  consent_terms_accepted: boolean;
  created_at: string;
  updated_at: string;
}

export const SURVEY_TYPE_LABELS: Record<SurveyType, string> = {
  pre: "Pre-event",
  post: "Post-event",
  pre_post: "Pre & post event",
};

export const ORDER_FORM_STATUS_LABELS: Record<OrderFormStatus, string> = {
  draft: "Draft",
  sent: "Awaiting brand approval",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/** The two consent statements the brand ticks (verbatim from the brief). */
export const ORDER_FORM_CONSENTS = {
  details: "It has reviewed and approved the Campaign details and Campaign Fee.",
  terms: "It agrees to the Terms and Conditions and Privacy Policy.",
} as const;

export type OrderFormSection =
  | "brand"
  | "campaign"
  | "event"
  | "research"
  | "benefit"
  | "social"
  | "other"
  | "media"
  | "commercial";

/** Sections the Admin Portal brief marks "ok for artist to see". */
export const ARTIST_SECTIONS: OrderFormSection[] = ["campaign", "event", "benefit", "social"];
export const ALL_SECTIONS: OrderFormSection[] = [
  "media",
  "brand",
  "campaign",
  "event",
  "research",
  "benefit",
  "social",
  "other",
  "commercial",
];

/**
 * What must be filled before the form can go to the brand. The brand is
 * approving a commercial commitment, so the money and the people are required;
 * research details can follow.
 */
export function missingForSend(f: Partial<CampaignOrderForm>): string[] {
  const missing: string[] = [];
  if (!f.brand_company_name?.trim()) missing.push("Brand / company name");
  if (!f.contact_name?.trim()) missing.push("Contact person");
  if (!f.contact_email?.trim()) missing.push("Contact email");
  if (!f.campaign_name?.trim()) missing.push("Campaign name");
  if (!f.campaign_objective?.trim()) missing.push("Campaign objective");
  if (f.campaign_fee_gbp == null) missing.push("Campaign fee");
  if (f.vat_gbp == null) missing.push("VAT");
  return missing;
}

/** VAT at the standard rate, to the penny (fee is ex-VAT). */
export function vatFor(feeGbp: number, rate = 0.2): number {
  return Math.round(feeGbp * rate * 100) / 100;
}

/** An embeddable URL for a YouTube / Vimeo link, else null (shown as a link). */
export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export const isDirectVideo = (url: string | null | undefined) =>
  !!url && /\.(mp4|webm|mov)(\?|$)/i.test(url);
