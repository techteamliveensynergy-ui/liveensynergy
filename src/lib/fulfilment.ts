/**
 * The Artist/Organiser Fulfilment Form (0104): promotional commitments and
 * special terms the Live·En·Synergy team fills in for each partnership. The
 * artist reads it once it's marked ready and gives a final consent, which is
 * also their agreement to the partnership.
 */
export interface FulfilmentForm {
  sponsored_event_id: string;
  promo_channels: string[];
  promo_post_count: number | null;
  promo_social_urls: string[];
  promo_start_date: string | null;
  promo_post_texts: string[];
  promo_other: string | null;
  special_terms: string | null;
  ready_at: string | null;
  ready_by: string | null;
  artist_ack_at: string | null;
  updated_at: string;
}

/** What the admin card pre-fills from the brand's order form when no form
 *  exists yet. Suggestions only — the admin edits before saving. */
export interface FulfilmentPrefill {
  social_media_details: string | null;
  other_details: string | null;
  campaign_timeline: string | null;
}

export type FulfilmentStage = "not_set_up" | "draft" | "ready" | "consented";

export function fulfilmentStage(form: Pick<FulfilmentForm, "ready_at" | "artist_ack_at"> | null): FulfilmentStage {
  if (!form) return "not_set_up";
  if (form.artist_ack_at) return "consented";
  if (form.ready_at) return "ready";
  return "draft";
}

export const FULFILMENT_STAGE_LABEL: Record<FulfilmentStage, string> = {
  not_set_up: "Not set up",
  draft: "Draft — not sent to the artist",
  ready: "Sent — waiting for the artist's consent",
  consented: "Artist consented",
};

/** The two ticks the artist gives (wording mirrors the order form's consent). */
export const FULFILMENT_CONSENTS = {
  commitments:
    "I/We confirm the promotional commitments and special terms above, and will deliver them as described.",
  terms: "I/We agree to the Terms and Conditions and Privacy Policy.",
} as const;

/** One value per line → trimmed, non-empty list (max 20). */
export function linesToList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}
