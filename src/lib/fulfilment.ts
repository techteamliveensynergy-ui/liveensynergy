/**
 * The artist fulfilment form (GitHub #57 / #59; Sakshi's "Artist / Event
 * Portal" doc, 2 Nov standup; migration 0103).
 *
 * Plain module — no server-only imports — so client components can use the
 * wording and the pure state logic.
 *
 * What "live" means: a confirmed partnership is public / open to the audience
 * only once its fulfilment is complete (`completed_at`). The database decides
 * (`sponsored_event_fulfilled()`); this file only mirrors the rule so the
 * screens can say *why* an event is still waiting.
 */

/** The channels offered as tick-boxes (Sakshi's doc). Admin can add more names. */
export const PROMO_CHANNEL_PRESETS = [
  "Instagram feed post / Reel",
  "Instagram Story",
  "TikTok video / post",
  "Facebook post",
  "Artist mailing list / newsletter",
  "Artist website / event page",
] as const;

/**
 * "Promotional confirmations" — the artist ticks every one before the
 * promotional commitments count. Word for word from the doc; the ticked text
 * is stored with the consent (promo_consent_statements, 0103).
 */
export const PROMO_CONFIRMATIONS = [
  "We will publish the agreed campaign communications through the specified channels and within the agreed schedule.",
  "We will use the campaign link and approved promotional materials supplied or approved by LES.",
  "We will include appropriate advertising or commercial partnership disclosures where required.",
  "We will notify LES promptly if we cannot fulfil an agreed promotional commitment.",
] as const;

/**
 * The two extra confirmations under Reward Engine / Discount Codes (doc, first
 * screenshot). They sit beside the existing "I agree to honour them" tick.
 */
export const CODES_EXTRA_CONFIRMATIONS = [
  "Codes will be configured and tested before the campaign is launched.",
  "LES will be informed promptly of any redemption problems, restrictions or changes affecting the codes.",
] as const;

/** An uploaded invoice: PDF or an image. Payment details go on the invoice. */
export const INVOICE_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export const INVOICE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const INVOICE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"];
export const INVOICE_HINT =
  "PDF or image, up to 4 MB. Put your payment details (account name, sort code and account number, or PayPal) on the invoice itself.";

export type InvoiceStatus = "submitted" | "received" | "paid" | "rejected";
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  submitted: "Submitted",
  received: "Received",
  paid: "Paid",
  rejected: "Rejected",
};

export interface SponsoredEventFulfilment {
  sponsored_event_id: string;
  promo_channels: string[];
  promo_post_count: number | null;
  promo_urls: string[];
  promo_start_date: string | null;
  promo_post_texts: string | null;
  promo_other: string | null;
  special_terms: string | null;
  proof_requirements: string | null;
  proof_min_count: number | null;
  payment_terms: string | null;
  promo_consent_at: string | null;
  promo_consent_by: string | null;
  promo_consent_statements: string[];
  final_consent_at: string | null;
  final_consent_by: string | null;
  final_consent_version: string | null;
  requested_at: string;
  completed_at: string | null;
  completed_by: string | null;
  completion_kind: "artist" | "admin_waived" | "predates" | null;
  waived_reason: string | null;
  updated_at: string;
}

export interface ArtistInvoice {
  id: string;
  sponsored_event_id: string;
  uploaded_by: string | null;
  file_path: string;
  file_name: string | null;
  invoice_number: string | null;
  amount_gbp: number | null;
  note: string | null;
  status: InvoiceStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

type PromoFields = Pick<
  SponsoredEventFulfilment,
  | "promo_channels"
  | "promo_post_count"
  | "promo_urls"
  | "promo_start_date"
  | "promo_post_texts"
  | "promo_other"
  | "special_terms"
  | "proof_requirements"
  | "proof_min_count"
>;

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Mirrors fulfilment_has_promo() in 0103: is there anything to agree to? */
export function hasPromo(f: PromoFields | null | undefined): boolean {
  if (!f) return false;
  return (
    (f.promo_channels?.length ?? 0) > 0 ||
    f.promo_post_count != null ||
    (f.promo_urls?.length ?? 0) > 0 ||
    !!f.promo_start_date ||
    filled(f.promo_post_texts) ||
    filled(f.promo_other) ||
    filled(f.special_terms) ||
    filled(f.proof_requirements) ||
    f.proof_min_count != null
  );
}

/** Is an invoice required before the artist can submit? Mirrors the RPC. */
export function invoiceRequired(
  event: { artist_fee_gbp: number | null },
  f: Pick<SponsoredEventFulfilment, "payment_terms"> | null,
): boolean {
  return (event.artist_fee_gbp ?? 0) > 0 || filled(f?.payment_terms);
}

export type FulfilmentStatus = "waiting" | "live" | "none";

/**
 * The state the badges show. `none` = no fulfilment row (an in-progress
 * proposal, or an event confirmed before 0103 was applied): nothing to say.
 */
export function fulfilmentStatus(
  sponsorshipStatus: string,
  f: Pick<SponsoredEventFulfilment, "completed_at"> | null | undefined,
): FulfilmentStatus {
  if (sponsorshipStatus !== "confirmed") return "none";
  if (!f) return "none";
  return f.completed_at ? "live" : "waiting";
}

export const WAITING_FOR_FULFILMENT = "Waiting for fulfilment";

export interface FulfilmentStep {
  key: "codes" | "promo" | "invoice" | "consent";
  label: string;
  done: boolean;
  /** Why it can't be done yet, or a short hint. */
  hint?: string;
}

/**
 * The checklist the artist works down. A step is "done" when the database
 * would accept it; the last step (final consent + submit) only unlocks once
 * every earlier one is done — the RPC re-checks all of it.
 */
export function fulfilmentSteps(input: {
  codesConfirmed: boolean;
  hasTiers: boolean;
  fulfilment: SponsoredEventFulfilment;
  invoiceCount: number;
  invoiceNeeded: boolean;
}): FulfilmentStep[] {
  const f = input.fulfilment;
  const promo = hasPromo(f);
  return [
    {
      key: "codes",
      label: "Confirm the discount codes",
      done: input.codesConfirmed && input.hasTiers,
      hint: !input.hasTiers ? "The team is still setting the codes up." : undefined,
    },
    {
      key: "promo",
      label: "Confirm the promotional commitments",
      done: promo ? !!f.promo_consent_at : true,
      hint: promo ? undefined : "Nothing to confirm yet.",
    },
    {
      key: "invoice",
      label: "Upload your invoice",
      done: input.invoiceNeeded ? input.invoiceCount > 0 : true,
      hint: input.invoiceNeeded ? undefined : "Not needed for this event.",
    },
    {
      key: "consent",
      label: "Give your final consent and submit",
      done: !!f.completed_at,
    },
  ];
}

/** Plain-English reasons for the submit RPC's refusal codes. */
export const SUBMIT_REFUSALS: Record<string, string> = {
  forbidden: "Only the artist or organiser on this partnership can submit the form.",
  not_confirmed: "This partnership isn't confirmed yet.",
  not_ready: "The form isn't ready yet — the team will open it shortly.",
  consent_required: "Tick the box to agree to the Terms & Conditions and Privacy Policy.",
  codes_unconfirmed: "Confirm the discount codes first (they need to be set up by the team and confirmed by you).",
  promo_unconfirmed: "Confirm the promotional commitments first.",
  invoice_missing: "Upload your invoice first.",
};
