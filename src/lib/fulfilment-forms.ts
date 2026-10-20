/**
 * Artist / Organiser Fulfilment Form (19 Oct standup, "Artist / Event Portal"
 * brief, migration 0082) — the artist's counterpart to the brand's Campaign
 * Order Form (src/lib/order-forms.ts).
 *
 * One form per sponsored event. An admin pre-fills the promotional
 * commitments, special terms, terms of payment and the codes deadline, and
 * sends it; the artist confirms the discount codes, ticks the promotional
 * confirmations and the Terms & Privacy consent, adds payment details and
 * invoices, and submits. The artist has no update policy on the row — their
 * writes are definer RPCs — and the brand can't read it at all.
 */

export type FulfilmentFormStatus = "draft" | "sent" | "changes_requested" | "submitted";

export interface ArtistFulfilmentForm {
  id: string;
  sponsored_event_id: string;
  status: FulfilmentFormStatus;
  codes_deadline: string | null;
  promo_channels: string[];
  promo_channels_custom: string[];
  promo_post_count: number | null;
  promo_start_date: string | null;
  promo_social_handles: string | null;
  promo_post_texts: string | null;
  promo_other_requirements: string | null;
  special_terms: string | null;
  payment_terms: string | null;
  payment_details: string | null;
  consent_publish: boolean;
  consent_materials: boolean;
  consent_terms_privacy: boolean;
  terms_version: string | null;
  sent_at: string | null;
  changes_requested_at: string | null;
  changes_requested_note: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtistFulfilmentInvoice {
  id: string;
  form_id: string;
  file_path: string;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** The brief's agreed promotional channels. "Other" is free text — any number
 *  of names, kept in promo_channels_custom. */
export const PROMO_CHANNELS: { key: string; label: string }[] = [
  { key: "instagram_feed", label: "Instagram feed post / Reel" },
  { key: "instagram_story", label: "Instagram Story" },
  { key: "tiktok", label: "TikTok video / post" },
  { key: "facebook", label: "Facebook post" },
  { key: "mailing_list", label: "Artist mailing list / newsletter" },
  { key: "website", label: "Artist website / event page" },
];
const PROMO_CHANNEL_KEYS = new Set(PROMO_CHANNELS.map((c) => c.key));
export const isPromoChannelKey = (key: string) => PROMO_CHANNEL_KEYS.has(key);

/** Every agreed channel as the artist reads it: the ticked ones, then the
 *  hand-typed ones. */
export function promoChannelLabels(form: Pick<ArtistFulfilmentForm, "promo_channels" | "promo_channels_custom">) {
  return [
    ...PROMO_CHANNELS.filter((c) => form.promo_channels.includes(c.key)).map((c) => c.label),
    ...form.promo_channels_custom,
  ];
}

export const FULFILMENT_STATUS_LABELS: Record<FulfilmentFormStatus, string> = {
  draft: "Draft — not sent",
  sent: "Waiting for the artist",
  changes_requested: "Changes requested",
  submitted: "Submitted",
};

/** The confirmations, worded as in the brief. The database stores each as a
 *  boolean and logs it in consent_records; the wording lives here once. */
export const CODES_NOTICE_CONSENT =
  "LES will be informed promptly of any redemption problems, restrictions or changes affecting the codes.";
export const PUBLISH_CONSENT =
  "We will publish the agreed campaign communications through the specified channels and within the agreed schedule.";
export const MATERIALS_CONSENT =
  "We will use the campaign link and approved promotional materials supplied or approved by LES.";

/** Brief: the codes are due "1 week from form creation" — counted from when
 *  the form is sent, since a draft can sit with the team for days. */
export const CODES_DEADLINE_DAYS = 7;

export function defaultCodesDeadline(from: Date = new Date()): string {
  const d = new Date(from.getTime() + CODES_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** What has to be filled in before the form can go to the artist. */
export function missingForSend(form: Pick<
  ArtistFulfilmentForm,
  "promo_channels" | "promo_channels_custom" | "payment_terms"
>): string[] {
  const missing: string[] = [];
  if (form.promo_channels.length === 0 && form.promo_channels_custom.length === 0) {
    missing.push("at least one agreed promotional channel");
  }
  if (!form.payment_terms?.trim()) missing.push("the terms of payment");
  return missing;
}

/** True once the codes deadline (a London calendar date) has passed. */
export function codesDeadlinePassed(deadline: string | null, today: Date = new Date()): boolean {
  if (!deadline) return false;
  const todayLondon = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(today);
  return todayLondon > deadline;
}

/** The form's status and codes deadline as embedded on a sponsored_events
 *  select (`artist_fulfilment_forms(status, codes_deadline)`). The FK is
 *  unique, so PostgREST returns an object — or null — but an array is
 *  tolerated in case the relationship is ever read as one-to-many. */
export type FulfilmentSummary = Pick<ArtistFulfilmentForm, "status" | "codes_deadline">;
export const FULFILMENT_EMBED = "artist_fulfilment_forms(status, codes_deadline)";

export function fulfilmentOf(
  embedded: FulfilmentSummary | FulfilmentSummary[] | null | undefined,
): FulfilmentSummary | null {
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded ?? null;
}

/** One line on where the form stands, for the admin summary blocks. */
export function fulfilmentStatusText(
  form: FulfilmentSummary | null,
  codesConfirmed: boolean,
): { state: "done" | "awaited"; text: string } {
  if (!form) return { state: "awaited", text: "Artist fulfilment form not started — awaiting you" };
  switch (form.status) {
    case "draft":
      return { state: "awaited", text: "Artist fulfilment form drafted — awaiting you to send it" };
    case "changes_requested":
      return { state: "awaited", text: "Artist asked for changes to the fulfilment form — awaiting you" };
    case "sent": {
      const overdue = !codesConfirmed && codesDeadlinePassed(form.codes_deadline);
      return {
        state: "awaited",
        text: overdue
          ? "Artist fulfilment form sent — awaiting artist (codes deadline passed)"
          : "Artist fulfilment form sent — awaiting artist",
      };
    }
    case "submitted":
      return { state: "done", text: "Artist fulfilment form submitted" };
  }
}
